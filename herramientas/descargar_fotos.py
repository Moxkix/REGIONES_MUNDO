"""Completa y, si se quiere, descarga las fotografías de los paisajes desde Wikimedia Commons.

En regiones/<id>/datos/paisajes.json basta con escribir en cada paisaje el nombre del archivo
de Commons, por ejemplo  "foto": {"archivo": "File:Hardangerfjord fra Fyksesund.jpg"}.
La página ya puede mostrarla así. Este script, ejecutado en un ordenador con acceso a internet:

  1. consulta la API de Commons y rellena autor, licencia, enlace y dirección de la imagen;
  2. avisa si las coordenadas de la foto quedan lejos del punto del paisaje;
  3. con --descargar, guarda una copia a 1600 px en regiones/<id>/fotos/ (campo "local"),
     para que el sitio no dependa de Commons.

Uso, desde la raíz del repositorio:
    python3 herramientas/descargar_fotos.py europa
    python3 herramientas/descargar_fotos.py europa --descargar
"""
import html
import json
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.request

AGENTE = "REGIONES_MUNDO/1.0 (https://github.com/Moxkix/REGIONES_MUNDO; recurso docente)"
API = "https://commons.wikimedia.org/w/api.php"


def pedir(url):
    req = urllib.request.Request(url, headers={"User-Agent": AGENTE})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def texto(v):
    return html.unescape(re.sub(r"<[^>]+>", "", v or "")).strip()


def ficha(archivo):
    nombre = re.sub(r"^(File|Archivo):", "", archivo).strip()
    q = urllib.parse.urlencode({"action": "query", "format": "json", "titles": "File:" + nombre,
                                "prop": "imageinfo", "iiprop": "url|size|extmetadata", "iiurlwidth": 1600})
    datos = json.loads(pedir(API + "?" + q))
    pagina = next(iter(datos["query"]["pages"].values()))
    if "imageinfo" not in pagina:
        raise ValueError("no existe en Commons: " + nombre)
    ii = pagina["imageinfo"][0]
    m = ii.get("extmetadata", {})
    val = lambda k: (m.get(k) or {}).get("value")
    lat, lon = val("GPSLatitude"), val("GPSLongitude")
    return {
        "archivo": "File:" + nombre,
        "url": ii.get("thumburl") or ii["url"],
        "pagina": ii["descriptionurl"],
        "autor": texto(val("Artist")) or None,
        "licencia": texto(val("LicenseShortName")) or None,
        "licencia_url": val("LicenseUrl"),
        "ancho": ii.get("width"), "alto": ii.get("height"),
        "lat": float(lat) if lat else None, "lon": float(lon) if lon else None,
    }


def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def main(region, descargar):
    carpeta = os.path.join("regiones", region)
    config = json.load(open(os.path.join(carpeta, "config.json"), encoding="utf-8"))
    ruta = os.path.join(carpeta, config["paisajes"]["archivo"])
    datos = json.load(open(ruta, encoding="utf-8"))
    for p in datos["paisajes"]:
        f = p.get("foto") or {}
        if not f.get("archivo"):
            print("·", p["id"], "sin archivo de Commons")
            continue
        try:
            info = ficha(f["archivo"])
        except Exception as e:  # noqa: BLE001
            print("!", p["id"], e)
            continue
        f.update({k: v for k, v in info.items() if v is not None and k not in ("lat", "lon", "ancho", "alto")})
        aviso = ""
        if info["ancho"] and info["alto"] and info["alto"] > info["ancho"]:
            aviso += " (foto vertical)"
        if info["lat"] is not None:
            d = km((p["lat"], p["lon"]), (info["lat"], info["lon"]))
            if d > p.get("tolerancia", 250) / 2:
                aviso += " (la foto está a %d km del punto del paisaje: revisad lat/lon)" % d
        if not re.match(r"^(CC0|CC BY|CC BY-SA|Public domain|PD)", info["licencia"] or "", re.I):
            aviso += " (revisad la licencia: %s)" % info["licencia"]
        print("ok", p["id"], "-", info["autor"], "-", info["licencia"], aviso)
        if descargar:
            ext = os.path.splitext(urllib.parse.urlparse(f["url"]).path)[1].lower() or ".jpg"
            local = "fotos/" + p["id"] + ext
            destino = os.path.join(carpeta, local)
            os.makedirs(os.path.dirname(destino), exist_ok=True)
            if not os.path.exists(destino):
                open(destino, "wb").write(pedir(f["url"]))
            f["local"] = local
        p["foto"] = f
        time.sleep(1)
    json.dump(datos, open(ruta, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print("Actualizado", ruta)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    main(args[0] if args else "europa", "--descargar" in sys.argv)
