"""Vectoriza la clasificación climática de Köppen-Geiger para una región.

Fuente del ráster: mapa mundial de Köppen-Geiger del periodo 1986-2010
(Rubel, Brugger, Haslinger y Auer, 2017, Meteorologische Zeitschrift 26:115-125),
a 100" de resolución, tal como lo distribuye el paquete kgcpy
(archivo kmz_int_reshape.png, licencia BSD-3, https://github.com/cwru-sdle/kgcpy).

Uso:
    python3 herramientas/koppen_region.py kmz_int_reshape.png salida.geojson \
        --bbox -32 28 70 76 --factor 4 --suavizado 3

    --bbox      oeste sur este norte (grados)
    --factor    agregación por moda en bloques de factor x factor píxeles
                (4 -> unos 11 km); reduce el tamaño del resultado
    --suavizado tamaño del filtro de moda posterior (0 = sin filtro)

Salida: GeoJSON con una propiedad "k" (código Köppen: Cfb, Csa...).
"""
import argparse
import json

import numpy as np
from PIL import Image
from rasterio import features
from rasterio.transform import from_origin
from scipy import ndimage
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

Image.MAX_IMAGE_PIXELS = None

CODIGOS = ["", "Af", "Am", "As", "Aw", "BSh", "BSk", "BWh", "BWk", "Cfa", "Cfb", "Cfc",
           "Csa", "Csb", "Csc", "Cwa", "Cwb", "Cwc", "Dfa", "Dfb", "Dfc", "Dfd", "Dsa",
           "Dsb", "Dsc", "Dsd", "Dwa", "Dwb", "Dwc", "Dwd", "EF", "ET"]
OCEANO = 32


def moda_bloques(a, f):
    h, w = (a.shape[0] // f) * f, (a.shape[1] // f) * f
    b = a[:h, :w].reshape(h // f, f, w // f, f).transpose(0, 2, 1, 3).reshape(h // f, w // f, f * f)
    sal = np.zeros((h // f, w // f), dtype=np.uint8)
    cuentas = np.zeros((h // f, w // f, 33), dtype=np.uint16)
    for v in range(1, 33):
        cuentas[..., v] = (b == v).sum(axis=2)
    tierra = cuentas[..., 1:32].sum(axis=2)
    sal = np.where(tierra * 2 >= f * f, cuentas[..., 1:32].argmax(axis=2) + 1, OCEANO)
    return sal.astype(np.uint8)


def moda_filtro(a, n):
    def moda(v):
        v = v.astype(np.int64)
        if v[len(v) // 2] == OCEANO:
            return OCEANO
        v = v[v != OCEANO]
        return np.bincount(v).argmax()
    return ndimage.generic_filter(a, moda, size=n, mode="nearest").astype(np.uint8)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("png")
    ap.add_argument("salida")
    ap.add_argument("--bbox", nargs=4, type=float, required=True)
    ap.add_argument("--factor", type=int, default=4)
    ap.add_argument("--suavizado", type=int, default=3)
    a = ap.parse_args()

    img = np.array(Image.open(a.png))
    alto, ancho = img.shape
    res = 360.0 / ancho
    o, s, e, n = a.bbox
    c0, c1 = int((o + 180) / res), int((e + 180) / res)
    f0, f1 = int((90 - n) / res), int((90 - s) / res)
    rec = img[f0:f1, c0:c1]
    agr = moda_bloques(rec, a.factor)
    if a.suavizado:
        agr = moda_filtro(agr, a.suavizado)
    paso = res * a.factor
    tr = from_origin(-180 + c0 * res, 90 - f0 * res, paso, paso)

    grupos = {}
    for geom, v in features.shapes(agr, mask=agr != OCEANO, transform=tr):
        grupos.setdefault(int(v), []).append(shape(geom))
    feats = []
    for v, gs in sorted(grupos.items()):
        g = unary_union(gs).simplify(paso * 0.6, preserve_topology=True)
        feats.append({"type": "Feature", "properties": {"k": CODIGOS[v]}, "geometry": mapping(g)})
    json.dump({"type": "FeatureCollection", "features": feats}, open(a.salida, "w"))


if __name__ == "__main__":
    main()
