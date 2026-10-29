"""Prepara los datos de energía a partir del conjunto de Our World in Data.

Fuente: https://github.com/owid/energy-data (CC BY 4.0), que recoge el
Statistical Review of World Energy del Energy Institute y los datos
eléctricos de Ember.

Uso:
    python3 herramientas/energia_owid.py owid-energy-data.csv

Genera:
    datos/produccion/carbon.json, petroleo.json, gas.json,
    nuclear.json, hidraulica.json, eolica_solar.json
        producción mundial por país (cuotas), mismo formato que los
        archivos de FAOSTAT y USGS.
    regiones/<id>/datos/energia.json
        series 1990-último año de consumo por fuente, producción de
        combustibles fósiles y mezcla eléctrica, para los países de la región
        indicados en regiones/<id>/config.json (recursos.energia.paises).
"""
import csv
import json
import os
import sys

ANIOS = [1990, 2000, 2010, 2020]
AGREGADOS = ["European Union (27)", "Europe", "Africa", "Asia", "North America", "South America", "Oceania"]
UMBRAL = 0.005  # países con al menos el 0,5 % de la producción mundial en algún año

PRODUCTOS = [
    ("carbon", "Carbón", "coal_production", "TWh de energía primaria"),
    ("petroleo", "Petróleo", "oil_production", "TWh de energía primaria"),
    ("gas", "Gas natural", "gas_production", "TWh de energía primaria"),
    ("nuclear", "Electricidad nuclear", "nuclear_electricity", "TWh de electricidad"),
    ("hidraulica", "Electricidad hidráulica", "hydro_electricity", "TWh de electricidad"),
    ("eolica_solar", "Electricidad eólica y solar", ("wind_electricity", "solar_electricity"), "TWh de electricidad"),
]

CONSUMO = ["coal", "oil", "gas", "nuclear", "hydro", "wind", "solar", "other_renewable", "biofuel"]
ELECTRICIDAD = ["coal", "gas", "oil", "nuclear", "hydro", "wind", "solar", "biofuel", "other_renewable_exc_biofuel"]


def num(v):
    try:
        return round(float(v), 3)
    except (TypeError, ValueError):
        return None


def main(csv_path):
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    filas = list(csv.DictReader(open(csv_path, encoding="utf-8")))
    por = {}
    for f in filas:
        por.setdefault(f["country"], {})[int(f["year"])] = f
    iso = {f["country"]: f["iso_code"] for f in filas if f["iso_code"] and not f["iso_code"].startswith("OWID")}
    iso["Kosovo"] = "XKX"

    def valor(pais, anio, campo):
        f = por.get(pais, {}).get(anio)
        if not f:
            return None
        if isinstance(campo, tuple):
            vs = [num(f[c]) for c in campo]
            return None if all(v is None for v in vs) else round(sum(v or 0 for v in vs), 3)
        return num(f[campo])

    # Último año con dato mundial para cada producto
    os.makedirs(os.path.join(raiz, "datos", "produccion"), exist_ok=True)
    indice = []
    for pid, nombre, campo, unidad in PRODUCTOS:
        ultimo = max(a for a in por["World"] if valor("World", a, campo))
        anios = ANIOS + [ultimo]
        mundo = {str(a): valor("World", a, campo) for a in anios}
        paises = {}
        for pais, cod in iso.items():
            serie = {str(a): valor(pais, a, campo) for a in anios}
            if any(v and mundo[k] and v / mundo[k] >= UMBRAL for k, v in serie.items()):
                paises[cod] = serie
        for antiguo, cod in (("USSR", "SUN"), ("Yugoslavia", "YUG"), ("Czechoslovakia", "CSK")):
            serie = {str(a): valor(antiguo, a, campo) for a in anios}
            if any(v and mundo[k] and v / mundo[k] >= UMBRAL for k, v in serie.items()):
                paises[cod] = serie
        agregados = {a: {str(y): valor(a, y, campo) for y in anios} for a in AGREGADOS}
        out = {
            "id": pid, "nombre": nombre, "grupo": "energia", "unidad": unidad, "unidadCorta": "TWh", "anios": anios,
            "mundo": mundo, "agregados": agregados, "paises": paises,
            "fuente": "Energy Institute, Statistical Review of World Energy 2025, y Ember, vía Our World in Data (CC BY 4.0)",
            "url": "https://github.com/owid/energy-data",
            "nota": "Se incluyen los países con al menos el 0,5 % de la producción mundial en alguno de los años. "
                    "Antes de 1992 la URSS, Yugoslavia y Checoslovaquia figuran como tales.",
        }
        json.dump(out, open(os.path.join(raiz, "datos", "produccion", pid + ".json"), "w", encoding="utf-8"),
                  ensure_ascii=False, separators=(",", ":"))
        indice.append(pid)
    print("Producción mundial:", ", ".join(indice))

    # Series por región
    for reg in sorted(os.listdir(os.path.join(raiz, "regiones"))):
        cfg_path = os.path.join(raiz, "regiones", reg, "config.json")
        if not os.path.exists(cfg_path):
            continue
        cfg = json.load(open(cfg_path, encoding="utf-8"))
        ener = cfg.get("recursos", {}).get("energia")
        if not ener:
            continue
        inverso = {v: k for k, v in iso.items()}
        inverso.update({"UE27": "European Union (27)", "MUNDO": "World"})
        primero = ener.get("desde", 1990)
        series = {}
        for cod in ener["paises"]:
            pais = inverso.get(cod)
            if pais not in por:
                print("Sin datos de energía:", cod)
                continue
            anios_p = sorted(a for a in por[pais] if a >= primero and num(por[pais][a]["primary_energy_consumption"]))
            if not anios_p:
                continue
            ult = anios_p[-1]
            d = {"anios": [primero, ult]}
            d["consumo"] = {c: [valor(pais, a, c + "_consumption") for a in range(primero, ult + 1)] for c in CONSUMO}
            d["produccion"] = {c: [valor(pais, a, c + "_production") for a in range(primero, ult + 1)] for c in ("coal", "oil", "gas")}
            d["consumo_fosil"] = {c: d["consumo"][c] for c in ("coal", "oil", "gas")}
            d["poblacion"] = [num(por[pais].get(a, {}).get("population")) for a in range(primero, ult + 1)]
            ultimo_e = max((a for a in por[pais] if num(por[pais][a]["electricity_generation"])), default=None)
            if ultimo_e:
                d["electricidad"] = {"anio": ultimo_e, "total": valor(pais, ultimo_e, "electricity_generation"),
                                     "fuentes": {c: valor(pais, ultimo_e, c + "_electricity") for c in ELECTRICIDAD}}
            series[cod] = d
        out = {"fuente": "Energy Institute, Statistical Review of World Energy 2025; Ember; U.S. EIA. Vía Our World in Data (CC BY 4.0).",
               "url": "https://github.com/owid/energy-data",
               "unidad": "TWh",
               "nota": "Consumo de energía primaria por el método de sustitución: la electricidad nuclear y renovable se convierte a la energía primaria que haría falta para producirla en una central térmica.",
               "paises": series}
        destino = os.path.join(raiz, "regiones", reg, "datos", "energia.json")
        json.dump(out, open(destino, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        print(reg, len(series), "países ->", destino, os.path.getsize(destino) // 1024, "KB")


if __name__ == "__main__":
    main(sys.argv[1])
