#!/usr/bin/env python3
"""
Convierte un vídeo local a HLS (varias calidades + master.m3u8) con ffmpeg.

Uso:
    python convertir_hls.py video.mp4 salida/
    python convertir_hls.py video.mp4 salida/ --calidades 720,480 --segmento 4

Resultado:
    salida/master.m3u8          <- la URL que se le pasa al reproductor (hls.js)
    salida/v0/index.m3u8 + .ts  <- una carpeta por calidad
Requisitos: ffmpeg y ffprobe en el PATH.
"""

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

# Altura -> (bitrate de vídeo, bitrate máximo, buffer)
PERFILES = {
    1080: ("5000k", "5350k", "7500k"),
    720: ("2800k", "2996k", "4200k"),
    480: ("1400k", "1498k", "2100k"),
    360: ("800k", "856k", "1200k"),
}


def analizar(entrada: Path):
    """Devuelve (altura del vídeo, tiene_audio) usando ffprobe."""
    salida = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(entrada)],
        capture_output=True, text=True, check=True,
    )
    streams = json.loads(salida.stdout)["streams"]
    video = next((s for s in streams if s["codec_type"] == "video"), None)
    if video is None:
        sys.exit("El archivo no tiene pista de vídeo.")
    tiene_audio = any(s["codec_type"] == "audio" for s in streams)
    return int(video["height"]), tiene_audio


def elegir_calidades(pedidas, altura_origen):
    """Descarta las calidades mayores que el original (no tiene sentido ampliar)."""
    validas = [h for h in pedidas if h <= altura_origen]
    if not validas:
        # Vídeo más pequeño que todas las calidades: se usa su propia altura (par).
        validas = [altura_origen - altura_origen % 2]
    return sorted(validas, reverse=True)


def construir_comando(entrada, destino, calidades, tiene_audio, segmento):
    n = len(calidades)
    # 1. Dividir el vídeo en N copias y escalar cada una (-2 = ancho par proporcional).
    filtros = [f"[0:v]split={n}" + "".join(f"[v{i}]" for i in range(n))]
    for i, h in enumerate(calidades):
        filtros.append(f"[v{i}]scale=-2:{h}[v{i}out]")

    cmd = ["ffmpeg", "-y", "-hide_banner", "-i", str(entrada),
           "-filter_complex", ";".join(filtros)]

    # 2. Codificar cada calidad (H.264 + AAC, compatible con todos los navegadores).
    mapa = []
    for i, h in enumerate(calidades):
        bitrate, maximo, buffer = PERFILES.get(h, ("1000k", "1070k", "1500k"))
        cmd += ["-map", f"[v{i}out]",
                f"-c:v:{i}", "libx264", f"-b:v:{i}", bitrate,
                f"-maxrate:v:{i}", maximo, f"-bufsize:v:{i}", buffer]
        if tiene_audio:
            cmd += ["-map", "0:a:0", f"-c:a:{i}", "aac", f"-b:a:{i}", "128k", "-ac", "2"]
            mapa.append(f"v:{i},a:{i}")
        else:
            mapa.append(f"v:{i}")

    # 3. Fotogramas clave cada `segmento` segundos para que todos los cortes coincidan.
    cmd += ["-preset", "veryfast", "-pix_fmt", "yuv420p", "-sc_threshold", "0",
            "-force_key_frames", f"expr:gte(t,n_forced*{segmento})"]

    # 4. Empaquetar en HLS: listas por calidad + master.m3u8.
    cmd += ["-f", "hls",
            "-hls_time", str(segmento),
            "-hls_playlist_type", "vod",
            "-hls_flags", "independent_segments",
            "-hls_segment_filename", (destino / "v%v" / "seg_%03d.ts").as_posix(),
            "-master_pl_name", "master.m3u8",
            "-var_stream_map", " ".join(mapa),
            (destino / "v%v" / "index.m3u8").as_posix()]
    return cmd


def main():
    p = argparse.ArgumentParser(description="Convierte un vídeo a HLS con ffmpeg.")
    p.add_argument("entrada", type=Path, help="archivo de vídeo de origen")
    p.add_argument("destino", type=Path, help="carpeta donde se escribe el HLS")
    p.add_argument("--calidades", default="1080,720,480",
                   help="alturas separadas por comas (por defecto 1080,720,480)")
    p.add_argument("--segmento", type=int, default=6,
                   help="duración de cada segmento en segundos (por defecto 6)")
    args = p.parse_args()

    for herramienta in ("ffmpeg", "ffprobe"):
        if shutil.which(herramienta) is None:
            sys.exit(f"No se encuentra {herramienta} en el PATH.")
    if not args.entrada.is_file():
        sys.exit(f"No existe el archivo: {args.entrada}")

    altura, tiene_audio = analizar(args.entrada)
    pedidas = [int(x) for x in args.calidades.split(",") if x.strip()]
    calidades = elegir_calidades(pedidas, altura)

    args.destino.mkdir(parents=True, exist_ok=True)
    print(f"Origen {altura}p, audio: {'sí' if tiene_audio else 'no'}; "
          f"calidades: {', '.join(f'{h}p' for h in calidades)}")

    cmd = construir_comando(args.entrada, args.destino, calidades, tiene_audio, args.segmento)
    resultado = subprocess.run(cmd)
    if resultado.returncode != 0:
        sys.exit("ffmpeg terminó con error.")
    print(f"Listo: {args.destino / 'master.m3u8'}")


if __name__ == "__main__":
    main()
