# -*- coding: utf-8 -*-
"""
make-icon.py — Convierte un PNG en un .ico de Windows multi-resolucion.
Uso: python make-icon.py <entrada.png> <salida.ico>

- Quita el fondo oscuro: calcula el alpha por brillo (key-out del negro), de
  modo que el fondo casi-negro queda transparente y las lineas (verdes) opacas,
  con bordes anti-aliasing suaves (sin halo).
- Recorta al contenido y deja un margen pequeno para que el dibujo ocupe mas
  del icono (mejor legibilidad en tamanos chicos).
- Exporta 16,24,32,48,64,128,256 px (Windows elige segun el contexto).
"""
import sys
from PIL import Image

PISO     = 24     # brillo por debajo de esto -> totalmente transparente (fondo ~20)
GANANCIA = 1.6    # empuja las lineas a opaco
MARGEN   = 0.06   # 6% de margen alrededor del contenido recortado

def quitar_fondo_oscuro(img):
    """Devuelve una RGBA con el fondo oscuro convertido a transparente."""
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            brillo = max(r, g, b)
            a = int((brillo - PISO) * GANANCIA)
            a = 0 if a < 0 else (255 if a > 255 else a)
            px[x, y] = (r, g, b, a)
    return img

def recortar_y_centrar(img):
    """Recorta al bounding box del contenido (alpha>0) y centra en cuadrado con margen."""
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    lado = int(max(img.size) * (1 + 2 * MARGEN))
    fondo = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
    fondo.paste(img, ((lado - img.size[0]) // 2, (lado - img.size[1]) // 2), img)
    return fondo

def main():
    if len(sys.argv) < 3:
        print("Uso: python make-icon.py <entrada.png> <salida.ico>")
        sys.exit(2)
    src, dst = sys.argv[1], sys.argv[2]
    img = Image.open(src)
    img = quitar_fondo_oscuro(img)
    img = recortar_y_centrar(img)
    tamanos = [(s, s) for s in (16, 24, 32, 48, 64, 128, 256)]
    img.save(dst, format="ICO", sizes=tamanos)
    print(dst)

if __name__ == "__main__":
    main()
