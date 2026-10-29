"""Regenera datos/produccion/indice.json con los productos disponibles.

Uso: python3 herramientas/indice_produccion.py
El motor «Producciones y recursos» solo pide los productos que figuran en el índice.
"""
import json
import os

raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
carpeta = os.path.join(raiz, "datos", "produccion")
productos = []
for f in sorted(os.listdir(carpeta)):
    if f.endswith(".json") and f != "indice.json":
        d = json.load(open(os.path.join(carpeta, f), encoding="utf-8"))
        productos.append({"id": d["id"], "nombre": d["nombre"], "grupo": d["grupo"], "anios": d["anios"]})
json.dump({"productos": productos}, open(os.path.join(carpeta, "indice.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(productos), "productos:", ", ".join(p["id"] for p in productos))
