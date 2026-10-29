"""Prepara los datos de población a partir de World Population Prospects 2024 (Naciones Unidas).

Fuente: paquete de datos wpp2024 de la División de Población de Naciones Unidas,
https://github.com/PPgp/wpp2024 (archivos .rda de la carpeta data/).
Estimaciones hasta 2023 y proyección (variante media) desde 2024.

Uso:
    pip install pyreadr
    python3 herramientas/poblacion_wpp.py carpeta_wpp ne_50m_admin_0_countries.geojson

carpeta_wpp debe contener: popAge1dt.rda, popprojAge1dt.rda, misc1dt.rda, miscproj1dt.rda,
tfr1dt.rda, tfrproj1dt.rda, e01dt.rda, e0proj1dt.rda.

Genera:
    datos/poblacion/<ID>.json   pirámide por grupos quinquenales (1950-2100, cada 5 años)
                                y series anuales de natalidad, mortalidad, fecundidad,
                                esperanza de vida y población
    datos/poblacion/indice.json lista de países y agregados disponibles
    datos/indicadores/wpp.json  indicadores demográficos de todos los países en los años del explorador
"""
import json
import os
import sys

import numpy as np
import pyreadr

AGREGADOS = {900: "MUNDO", 903: "AFR", 935: "ASI", 908: "EUR", 904: "LAC", 905: "NAM", 909: "OCE"}
EXTRA = {"NOR": 578, "FRA": 250, "XKX": 412}
ANIOS_PIR = list(range(1950, 2101, 5))
ANIOS_EXP = [1990, 2000, 2010, 2020, 2024, 2050]
GRUPOS = [f"{a}-{a + 4}" for a in range(0, 95, 5)] + ["95+"]


def leer(carpeta, nombre):
    df = pyreadr.read_r(os.path.join(carpeta, nombre + ".rda"))[nombre]
    df["year"] = df["year"].astype(int)  # en las proyecciones el año viene como texto
    return df


def main(carpeta, ne_path):
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sys.path.insert(0, os.path.join(raiz, "herramientas"))
    from paises import codigo  # mismo criterio de códigos que la cartografía

    ne = json.load(open(ne_path, encoding="utf-8"))
    m49 = {}
    for f in ne["features"]:
        p = f["properties"]
        n3 = p.get("ISO_N3")
        cid = codigo(p)
        if n3 and n3 != "-99":
            m49[int(n3)] = cid
    for cid, n in EXTRA.items():
        m49[n] = cid
    m49.update(AGREGADOS)

    edad_obs = leer(carpeta, "popAge1dt")
    edad_proj = leer(carpeta, "popprojAge1dt")[["country_code", "year", "age", "popM", "popF"]]
    edades = (edad_obs[edad_obs.year >= 1950][["country_code", "year", "age", "popM", "popF"]]
              .pipe(lambda d: __import__("pandas").concat([d, edad_proj])))
    edades["grupo"] = np.minimum(edades["age"] // 5, 19)
    pir = edades.groupby(["country_code", "year", "grupo"])[["popM", "popF"]].sum().reset_index()

    import pandas as pd
    misc = pd.concat([leer(carpeta, "misc1dt"), leer(carpeta, "miscproj1dt")])
    tfr = pd.concat([leer(carpeta, "tfr1dt")[["country_code", "year", "tfr"]], leer(carpeta, "tfrproj1dt")[["country_code", "year", "tfr"]]])
    e0 = pd.concat([leer(carpeta, "e01dt")[["country_code", "year", "e0B"]], leer(carpeta, "e0proj1dt")[["country_code", "year", "e0B"]]])
    serie = misc.merge(tfr, on=["country_code", "year"], how="left").merge(e0, on=["country_code", "year"], how="left")
    tot = edades.groupby(["country_code", "year"])[["popM", "popF"]].sum().sum(axis=1).rename("pob").reset_index()
    serie = serie.merge(tot, on=["country_code", "year"], how="left")

    salida = os.path.join(raiz, "datos", "poblacion")
    os.makedirs(salida, exist_ok=True)
    indice = []
    exp = {k: {} for k in ["poblacion", "fecundidad", "esperanza_vida", "natalidad", "mortalidad", "crecimiento_natural", "mayores65", "menores15", "edad_mediana"]}
    r = lambda v, d=2: None if v is None or (isinstance(v, float) and np.isnan(v)) else round(float(v), d)

    for cc, cid in m49.items():
        p = pir[pir.country_code == cc]
        if p.empty:
            continue
        H, M = [], []
        for y in ANIOS_PIR:
            q = p[p.year == y].sort_values("grupo")
            H.append([r(v, 1) for v in q.popM.tolist()])
            M.append([r(v, 1) for v in q.popF.tolist()])
        s = serie[serie.country_code == cc].sort_values("year")
        s = s[(s.year >= 1950) & (s.year <= 2100)]
        out = {
            "id": cid, "unidad": "miles de personas", "grupos": GRUPOS, "aniosPiramide": ANIOS_PIR, "hombres": H, "mujeres": M,
            "anios": [int(s.year.min()), int(s.year.max())], "ultimoObservado": 2023,
            "natalidad": [r(v, 1) for v in s.cbr], "mortalidad": [r(v, 1) for v in s.cdr],
            "fecundidad": [r(v, 2) for v in s.tfr], "esperanza_vida": [r(v, 1) for v in s.e0B],
            "poblacion": [r(v, 0) for v in s.pob],
        }
        json.dump(out, open(os.path.join(salida, cid + ".json"), "w", encoding="utf-8"), separators=(",", ":"))
        indice.append(cid)

        # indicadores para el explorador
        for y in ANIOS_EXP:
            fila = s[s.year == y]
            q = p[p.year == y].sort_values("grupo")
            if fila.empty or q.empty:
                continue
            f0 = fila.iloc[0]
            g = (q.popM + q.popF).to_numpy()
            total = g.sum()
            acum = np.cumsum(g) / total
            k = int(np.searchsorted(acum, 0.5))
            antes = acum[k - 1] if k > 0 else 0
            mediana = 5 * k + 5 * (0.5 - antes) / (acum[k] - antes)
            vals = {
                "poblacion": total, "fecundidad": f0.tfr, "esperanza_vida": f0.e0B, "natalidad": f0.cbr,
                "mortalidad": f0.cdr, "crecimiento_natural": f0.cbr - f0.cdr,
                "mayores65": g[13:].sum() / total * 100, "menores15": g[:3].sum() / total * 100, "edad_mediana": mediana,
            }
            for kk, v in vals.items():
                exp[kk].setdefault(cid, {})[str(y)] = [r(v, 0 if kk == "poblacion" else 2), y]

    json.dump({"fuente": "Naciones Unidas, World Population Prospects 2024 (estimaciones hasta 2023 y variante media desde 2024)",
               "url": "https://population.un.org/wpp/", "paises": sorted(indice)},
              open(os.path.join(salida, "indice.json"), "w", encoding="utf-8"), ensure_ascii=False)
    meta = {
        "poblacion": ("Población (miles)", "log"), "fecundidad": ("Fecundidad (hijos por mujer)", "lineal"),
        "esperanza_vida": ("Esperanza de vida al nacer (años)", "lineal"), "natalidad": ("Tasa bruta de natalidad (‰)", "lineal"),
        "mortalidad": ("Tasa bruta de mortalidad (‰)", "lineal"), "crecimiento_natural": ("Crecimiento natural (‰)", "lineal"),
        "mayores65": ("Población de 65 años y más (%)", "lineal"), "menores15": ("Población menor de 15 años (%)", "lineal"),
        "edad_mediana": ("Edad mediana (años)", "lineal"),
    }
    os.makedirs(os.path.join(raiz, "datos", "indicadores"), exist_ok=True)
    json.dump({"fuente": "Naciones Unidas, World Population Prospects 2024", "anios": ANIOS_EXP,
               "proyectados": [2050],
               "indicadores": {k: {"nombre": v[0], "escala": v[1], "fuente": "Naciones Unidas, WPP 2024"} for k, v in meta.items()},
               "valores": exp},
              open(os.path.join(raiz, "datos", "indicadores", "wpp.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(len(indice), "países y agregados")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
