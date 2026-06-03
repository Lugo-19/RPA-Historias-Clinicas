# -*- coding: utf-8 -*-
"""
make-icon.py — Convierte un PNG en un .ico de Windows multi-resolucion.
Uso: python make-icon.py <entrada.png> <salida.ico>
El .ico incluye 16,24,32,48,64,128,256 px (Windows elige el tamano segun
el contexto: barra de tareas, escritorio, explorador, etc.).
"""
import sys
from PIL import Image

def main():
    if len(sys.argv) < 3:
        print("Uso: python make-icon.py <entrada.png> <salida.ico>")
        sys.exit(2)
    src, dst = sys.argv[1], sys.argv[2]
    img = Image.open(src).convert("RGBA")
    # Lienzo cuadrado (por si la imagen no lo es), centrando el contenido.
    lado = max(img.size)
    fondo = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
    fondo.paste(img, ((lado - img.size[0]) // 2, (lado - img.size[1]) // 2), img)
    tamanos = [(s, s) for s in (16, 24, 32, 48, 64, 128, 256)]
    fondo.save(dst, format="ICO", sizes=tamanos)
    print(dst)

if __name__ == "__main__":
    main()
