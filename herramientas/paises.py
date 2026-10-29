"""Prepara la capa mundial de países a partir de Natural Earth.

Uso:
    python3 herramientas/paises.py ne_50m_admin_0_countries.geojson salida.geojson

Salida: GeoJSON con dos propiedades por país:
    id      código ISO 3166-1 alfa-3 (Kosovo = XKX)
    nombre  nombre en español (campo NAME_ES de Natural Earth)

Después se simplifica y se convierte a TopoJSON con mapshaper
(ver herramientas/README.md).
"""
import json
import sys

# Territorios que Natural Earth separa y que aquí se integran en su Estado.
INTEGRAR = {"ALD": "FIN", "IOA": "AUS", "ATC": "AUS"}
# Códigos que Natural Earth deja como -99.
CODIGOS = {"KOS": "XKX", "SOL": "SOL", "CYN": "CYN", "KAS": "KAS"}


def codigo(p):
    a3 = p["ADM0_A3"]
    if a3 in INTEGRAR:
        return INTEGRAR[a3]
    if a3 in CODIGOS:
        return CODIGOS[a3]
    eh = p.get("ISO_A3_EH")
    return eh if eh and eh != "-99" else a3


def main(entrada, salida):
    datos = json.load(open(entrada, encoding="utf-8"))
    nombres = {}
    for f in datos["features"]:
        p = f["properties"]
        if p["ADM0_A3"] not in INTEGRAR:
            nombres[codigo(p)] = p.get("NAME_ES") or p["NAME"]
    nombres["XKX"] = "Kosovo"
    nombres["MKD"] = "Macedonia del Norte"
    nombres["CZE"] = "Chequia"
    nombres["ROU"] = "Rumanía"
    nombres["CYN"] = "Chipre del Norte"
    nombres["SOL"] = "Somalilandia"
    feats = []
    for f in datos["features"]:
        c = codigo(f["properties"])
        feats.append({"type": "Feature", "properties": {"id": c, "nombre": nombres.get(c, c)},
                      "geometry": f["geometry"]})
    json.dump({"type": "FeatureCollection", "features": feats},
              open(salida, "w", encoding="utf-8"), ensure_ascii=False)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
