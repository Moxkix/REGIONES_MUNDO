"""Genera las capas temáticas de Japón y Australia (capítulo 4).

Uso:
    python3 herramientas/japon_australia_capas.py ne_10m_geography_regions_polys.geojson \
        adm1_ja.geojson dem_jp.npy carpeta_temporal

- adm1_ja.geojson   prefecturas de Japón y estados y territorios de Australia (Natural Earth admin-1, 10m),
                    con su código ISO 3166-2 como identificador.
- dem_jp.npy        altitudes de Japón clasificadas (0 mar; 1 <200 m; 2 200-500 m; 3 500-1.500 m; 4 >1.500 m) en una
                    rejilla de 0,04° con origen en 122,5° E y 46° N, obtenida de las teselas Terrarium de Mapzen/AWS
                    (SRTM, GMTED y ETOPO1) a zoom 7. Véase herramientas/README.md.

Escribe en la carpeta temporal:
- relieve.geojson   Japón: pisos de altitud (mapa hipsométrico), porque el manual subraya que tres cuartas partes del
                    país son montañosas y solo un 16 % son llanuras. Australia: grandes unidades morfoestructurales
                    de la figura 4.10 a partir de las regiones de Natural Earth; los huecos se rellenan con la unidad
                    más próxima por celdas de 1°. La clasificación es nuestra.
- estados.geojson   prefecturas y estados.
- agro_au.geojson   esquema de usos agrarios de Australia deducido del clima (Köppen) y de la latitud, siguiendo la
                    figura 4.9 y el apartado 2.2.2 (función usos_agrarios). Es una simplificación propia.
- puntos.json       picos y volcanes, ciudades, llanuras y cuencas (rótulos), regiones industriales (figura 4.5 y
                    apartado 2.3.2) y recursos (apartados 1.2.1 y 2.3.1). Posiciones aproximadas.
"""
import json
import os
import sys

import numpy as np
from rasterio import features
from rasterio.transform import from_origin
from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union
from shapely.validation import make_valid

# --- Australia: unidades de Natural Earth -> figura 4.10 ---
AUSTRALIA = {
    "WESTERN PLATEAU": ("au_zocalo", "Mesetas occidentales"),
    "KIMBERLEY PLATEAU": ("au_zocalo", "Meseta de Kimberley"),
    "Hamersley Ra.": ("au_zocalo", "Meseta de Hamersley (Pilbara)"),
    "Darling Range": ("au_zocalo", "Darling Range"),
    "GREAT VICTORIA DESERT": ("au_zocalo", "Gran Desierto de Victoria"),
    "GREAT SANDY DESERT": ("au_recubierto", "Gran Desierto de Arena"),
    "Gibson Desert": ("au_recubierto", "Desierto de Gibson"),
    "Tanami Desert": ("au_recubierto", "Desierto de Tanami"),
    "Barkly Tableland": ("au_recubierto", "Meseta de Barkly"),
    "ARNHEM LAND": ("au_recubierto", "Tierra de Arnhem"),
    "MacDonnell Ranges": ("au_recubierto", "Montes MacDonnell"),
    "Selwyn Ra.": ("au_recubierto", "Selwyn Range (Monte Isa)"),
    "GREAT ARTESIAN BASIN": ("au_llanuras", "Gran Cuenca Artesiana"),
    "MURRAY-DARLING BASIN": ("au_llanuras", "Cuenca del Murray-Darling"),
    "Riverina": ("au_llanuras", "Riverina"),
    "Darling Downs": ("au_llanuras", "Darling Downs"),
    "NULLARBOR PLAIN": ("au_llanuras", "Llanura de Nullarbor"),
    "Simpson Desert": ("au_llanuras", "Desierto de Simpson"),
    "Strzelecki Desert": ("au_llanuras", "Desierto de Strzelecki"),
    "GREAT DIVIDING RANGE": ("au_cordillera", "Gran Cordillera Divisoria"),
    "Australian Alps": ("au_cordillera", "Alpes australianos (Snowy Mountains)"),
    "Blue Mts.": ("au_cordillera", "Montañas Azules"),
    "Atherton Tableland": ("au_cordillera", "Meseta de Atherton"),
    "Buckland Tableland": ("au_cordillera", "Meseta de Buckland"),
    "Flinders Ranges": ("au_cordillera", "Montes Flinders"),
    "TASMANIA": ("au_cordillera", "Tasmania"),
}
NOMBRES_AU = {"au_zocalo": "Zócalo precámbrico", "au_recubierto": "Zócalo precámbrico recubierto",
              "au_llanuras": "Llanuras centrales", "au_cordillera": "Cadenas primarias rejuvenecidas"}
NOMBRES_JP = {1: ("jp1", "Llanuras y colinas (menos de 200 m)"), 2: ("jp2", "Colinas y montañas bajas (200-500 m)"),
              3: ("jp3", "Montañas (500-1.500 m)"), 4: ("jp4", "Altas montañas (más de 1.500 m)")}

PICOS = [  # nombre, lon, lat, altitud, tipo (v = volcán)
    ("Monte Fuji", 138.73, 35.36, 3776, "v"), ("Kita-dake", 138.24, 35.67, 3193, ""), ("Ontake", 137.48, 35.89, 3067, "v"),
    ("Asama", 138.52, 36.41, 2568, "v"), ("Asahi-dake (Daisetsuzan)", 142.85, 43.66, 2291, "v"),
    ("Aso", 131.10, 32.88, 1592, "v"), ("Sakurajima", 130.66, 31.58, 1117, "v"), ("Unzen", 130.29, 32.76, 1483, "v"),
    ("Usu", 140.84, 42.54, 737, "v"),
    ("Kosciuszko", 148.26, -36.46, 2228, ""), ("Bartle Frere", 145.81, -17.40, 1622, ""), ("Ossa", 146.03, -41.87, 1617, ""),
    ("Zeil", 132.39, -23.40, 1531, ""), ("Woodroffe", 131.75, -26.33, 1435, ""), ("Uluru", 131.04, -25.34, 863, ""),
]
CIUDADES = [  # nombre, lon, lat, capital
    ("Tokio", 139.69, 35.69, 1), ("Yokohama", 139.64, 35.44, 0), ("Osaka", 135.50, 34.69, 0), ("Nagoya", 136.91, 35.18, 0),
    ("Sapporo", 141.35, 43.06, 0), ("Fukuoka", 130.40, 33.59, 0), ("Kobe", 135.20, 34.69, 0), ("Kioto", 135.77, 35.01, 0),
    ("Hiroshima", 132.46, 34.39, 0), ("Sendai", 140.87, 38.27, 0), ("Kitakyushu", 130.88, 33.88, 0), ("Niigata", 139.04, 37.92, 0),
    ("Kagoshima", 130.56, 31.60, 0), ("Naha", 127.68, 26.21, 0), ("Kanazawa", 136.66, 36.56, 0),
    ("Canberra", 149.13, -35.28, 1), ("Sídney", 151.21, -33.87, 0), ("Melbourne", 144.96, -37.81, 0), ("Brisbane", 153.03, -27.47, 0),
    ("Perth", 115.86, -31.95, 0), ("Adelaida", 138.60, -34.93, 0), ("Hobart", 147.33, -42.88, 0), ("Darwin", 130.84, -12.46, 0),
    ("Gold Coast", 153.43, -28.02, 0), ("Newcastle", 151.78, -32.93, 0), ("Townsville", 146.82, -19.26, 0),
    ("Cairns", 145.77, -16.92, 0), ("Alice Springs", 133.88, -23.70, 0),
]
CUENCAS = [  # rótulos en cursiva de llanuras y cuencas
    ("Llanura de Kanto", 139.6, 36.1), ("Llanura de Nobi", 136.75, 35.3), ("Llanura de Echigo", 139.2, 37.75),
    ("Llanura de Ishikari", 141.6, 43.25), ("Llanura de Tokachi", 143.2, 42.75), ("Llanura de Osaka", 135.55, 34.85),
    ("Gran Cuenca Artesiana", 142.5, -24.5), ("Cuenca del Murray-Darling", 145.0, -33.0), ("Llanura de Nullarbor", 128.5, -30.8),
    ("Lago Eyre (−15 m)", 137.3, -28.4),
]
INDUSTRIA = [  # nombre, lon, lat, tipo, nota
    ("Keihin (Tokio-Kawasaki-Yokohama)", 139.75, 35.55, "jp_principal", "Primera región industrial de Japón: siderurgia, refino y petroquímica, automóvil, electrónica, industria aeronáutica y alimentaria."),
    ("Hanshin (Osaka-Kobe)", 135.35, 34.67, "jp_principal", "Segunda región industrial: siderurgia, naval, química, electrónica, textil y metalurgia."),
    ("Chukyo (Nagoya)", 136.88, 35.05, "jp_principal", "Industria del automóvil (Toyota), textil, cerámica, aeronáutica y siderurgia."),
    ("Kitakyushu", 130.85, 33.9, "jp_principal", "Antiguo foco de la industria pesada (siderurgia de Yawata), en lenta decadencia."),
    ("Keiyo (Chiba)", 140.08, 35.55, "jp_otra", "Siderurgia, refino y petroquímica en polders de la bahía de Tokio."),
    ("Tokai (Shizuoka-Hamamatsu)", 137.9, 34.85, "jp_otra", "Motocicletas, instrumentos musicales, papel y automóvil."),
    ("Setouchi (Mar Interior: Mizushima, Fukuyama, Hiroshima)", 133.4, 34.45, "jp_otra", "Siderurgia, petroquímica, construcción naval y automóvil (Mazda) a orillas del Mar Interior."),
    ("Kita-Kanto", 139.4, 36.4, "jp_otra", "Electrónica y automóvil en el interior de Kanto."),
    ("Hokuriku (Toyama-Kanazawa)", 137.0, 36.65, "jp_otra", "Aluminio, química, maquinaria y textil en la costa del Mar del Japón."),
    ("Muroran-Tomakomai", 141.2, 42.4, "jp_otra", "Siderurgia, papel y refino en Hokkaido."),
    ("Sídney-Newcastle-Port Kembla", 151.1, -33.6, "au", "Siderurgia (Port Kembla), metalurgia, química, refino y bienes de equipo."),
    ("Melbourne-Geelong", 144.6, -37.95, "au", "Bienes de equipo, química, alimentaria; el automóvil cerró en 2016-2017."),
    ("Adelaida-Whyalla-Port Pirie", 137.9, -33.6, "au", "Siderurgia (Whyalla), fundición de plomo (Port Pirie) y material de defensa."),
    ("Brisbane-Gladstone", 151.25, -23.85, "au", "Alúmina y aluminio en Gladstone; alimentaria y refino en Brisbane."),
    ("Perth-Kwinana", 115.8, -32.2, "au", "Refino de petróleo, alúmina, níquel y procesado de litio."),
    ("Bell Bay (Tasmania)", 146.85, -41.15, "au", "Aluminio y ferroaleaciones gracias a la hidroelectricidad."),
    ("Monte Isa", 139.49, -20.73, "au", "Fundición de cobre, plomo y zinc junto a la mina."),
]
RECURSOS = [  # nombre, lon, lat, tipo, nota
    ("Hierro del Pilbara", 118.5, -22.6, "hierro", "Mount Newman, Tom Price, Paraburdoo: primera región exportadora de mineral de hierro del mundo."),
    ("Bauxita de Weipa", 141.9, -12.6, "bauxita", "Península del cabo York (Queensland)."),
    ("Bauxita de Gove", 136.8, -12.25, "bauxita", "Tierra de Arnhem (Territorio del Norte)."),
    ("Bauxita de la Darling Range", 116.1, -32.6, "bauxita", "Huntly y Willowdale, al sur de Perth."),
    ("Carbón de la cuenca de Bowen", 148.6, -22.5, "carbon", "Carbón de coque para la siderurgia de Asia oriental."),
    ("Carbón del valle del Hunter", 151.0, -32.5, "carbon", "Carbón térmico exportado por Newcastle, el mayor puerto carbonero del mundo."),
    ("Lignito del valle de La Trobe", 146.5, -38.2, "carbon", "Centrales térmicas de Victoria."),
    ("Oro de Kalgoorlie", 121.47, -30.78, "metales", "Super Pit y otras minas de los Goldfields de Australia Occidental."),
    ("Olympic Dam", 136.88, -30.44, "metales", "Cobre, uranio, oro y plata: uno de los mayores yacimientos de uranio del mundo."),
    ("Broken Hill", 141.47, -31.95, "metales", "Plata, plomo y zinc desde 1883."),
    ("Monte Isa", 139.49, -20.73, "metales", "Cobre, plomo, zinc y plata."),
    ("Níquel de Kambalda", 121.66, -31.2, "metales", "Níquel de Australia Occidental."),
    ("Litio de Greenbushes", 116.06, -33.86, "metales", "La mayor mina de litio en roca del mundo."),
    ("Gas del Noroeste (North West Shelf, Gorgon)", 116.8, -20.3, "gas", "Gas natural licuado exportado a Japón, China y Corea."),
    ("Gas y petróleo del estrecho de Bass", 148.0, -38.4, "gas", "Cuenca de Gippsland."),
    ("Gas de la cuenca de Cooper (Moomba)", 140.2, -28.1, "gas", "En el desierto de Strzelecki."),
    ("Gas de Queensland (gas de carbón)", 149.5, -26.6, "gas", "Gas de las vetas de carbón exportado como GNL por Gladstone."),
    ("Petróleo y gas de Niigata y Akita", 139.6, 38.6, "historico", "Pequeños yacimientos que apenas cubren una mínima parte del consumo japonés."),
    ("Carbón de Ishikari y Kushiro", 142.5, 43.2, "historico", "Las minas de carbón japonesas cerraron casi todas; solo queda una mina submarina en Kushiro."),
    ("Cobre de Hitachi y Besshi", 134.0, 33.9, "historico", "Antiguas minas de cobre, hoy cerradas."),
]
LINEAS_JP = [
    {"nombre": "Línea Media Tectónica", "estilo": "falla", "leyenda": "Grandes fallas (Línea Media Tectónica y Línea Magna)",
     "nota": "Separa la zona interna y la zona externa del arco del suroeste (figura 4.1).",
     "coords": [[130.7, 32.6], [131.8, 33.2], [132.6, 33.65], [133.5, 33.9], [134.6, 34.1], [135.3, 34.25], [136.2, 34.4], [137.0, 34.8], [137.9, 35.6], [138.15, 36.0]]},
    {"nombre": "Línea Magna (Itoigawa-Shizuoka)", "estilo": "falla", "leyenda": "Grandes fallas (Línea Media Tectónica y Línea Magna)",
     "nota": "Borde occidental de la Fosa Magna, que separa el arco del noreste del arco del suroeste.",
     "coords": [[137.86, 37.04], [137.9, 36.6], [138.0, 36.2], [138.1, 35.9], [138.3, 35.4], [138.4, 35.0]]},
    {"nombre": "Fosa del Japón", "estilo": "fosa", "leyenda": "Fosas oceánicas (subducción de las placas del Pacífico y de Filipinas)",
     "nota": "La placa del Pacífico se hunde bajo el arco japonés (figura 4.4).",
     "coords": [[145.0, 41.8], [144.4, 40.5], [144.0, 39.0], [143.5, 37.5], [142.5, 35.8], [142.0, 34.8]]},
    {"nombre": "Fosa de las Kuriles", "estilo": "fosa", "leyenda": "Fosas oceánicas (subducción de las placas del Pacífico y de Filipinas)",
     "coords": [[148.5, 44.6], [147.0, 43.4], [145.8, 42.4], [145.0, 41.8]]},
    {"nombre": "Fosa de Nankai", "estilo": "fosa", "leyenda": "Fosas oceánicas (subducción de las placas del Pacífico y de Filipinas)",
     "nota": "La placa de Filipinas se hunde bajo el suroeste de Japón; zona de grandes terremotos.",
     "coords": [[138.6, 34.2], [137.5, 33.6], [136.0, 33.1], [134.5, 32.75], [133.0, 32.3], [132.0, 31.5]]},
    {"nombre": "Fosa de las Ryukyu", "estilo": "fosa", "leyenda": "Fosas oceánicas (subducción de las placas del Pacífico y de Filipinas)",
     "coords": [[132.0, 31.5], [131.4, 30.2], [130.2, 28.2], [128.6, 26.3], [126.6, 24.8], [124.5, 23.8]]},
]


def dem_japon(ruta, tierra):
    a = np.load(ruta)
    tr = from_origin(122.5, 46.0, 0.04, 0.04)
    piezas = {}
    for geom, v in features.shapes(a, mask=a > 0, transform=tr):
        piezas.setdefault(int(v), []).append(shape(geom))
    out = []
    for v, gs in sorted(piezas.items()):
        # suavizado y eliminación de manchas de menos de unos 40 km² (dos o tres celdas)
        g = unary_union([x for x in gs if x.area >= 0.004]).buffer(0.02).buffer(-0.02).intersection(tierra)
        k, n = NOMBRES_JP[v]
        out.append((k, n, poligonal(g)))
    return out


def rellenar(unidades, tierra):
    todas = unary_union([g for _, g in unidades]).buffer(0)
    huecos = tierra.difference(todas)
    o, s, e, n = huecos.bounds
    piezas = {}
    for x in range(int(o) - 1, int(e) + 1):
        for y in range(int(s) - 1, int(n) + 1):
            celda = huecos.intersection(box(x, y, x + 1, y + 1))
            if celda.is_empty or celda.area < 1e-4:
                continue
            c = celda.representative_point()
            d, u = min((g.distance(c), u) for u, g in unidades)
            piezas.setdefault(u, []).append(celda)
    return {u: poligonal(unary_union(v)) for u, v in piezas.items()}


def usos_agrarios(koppen_au, au):
    """Zonas agrarias de Australia a partir de los tipos de Köppen (figura 4.9 y apartado 2.2.2)."""
    tierra = au.buffer(0)
    costa = tierra.boundary.buffer(1.0).intersection(tierra)
    queensland = box(145, -24, 154, -15)
    d = json.load(open(koppen_au, encoding="utf-8"))
    zonas = {}
    def add(k, g):
        if not g.is_empty:
            zonas.setdefault(k, []).append(g)
    for f in d["features"]:
        k = f["properties"]["k"]
        g = make_valid(shape(f["geometry"])).buffer(0).intersection(tierra)
        if g.is_empty:
            continue
        norte, sur = g.intersection(box(100, -26, 160, 0)), g.intersection(box(100, -50, 160, -26))
        if k in ("BWh", "BWk"):
            add("desierto", g)
        elif k in ("BSh", "BSk"):
            add("bovino", norte); add("ovino", sur)
        elif k in ("Aw", "Am", "Af", "Cwa"):
            pl = g.intersection(queensland).intersection(costa)
            add("plantacion", pl); add("bovino", g.difference(pl))
        elif k in ("Csa", "Csb"):
            add("trigo", g)
        else:  # Cfa, Cfb, Cfc
            pl = g.intersection(queensland).intersection(costa)
            resto = g.difference(pl)
            add("plantacion", pl)
            add("intensiva", resto.intersection(costa)); add("trigo", resto.difference(costa))
    return {k: poligonal(unary_union(v)) for k, v in zonas.items()}


def poligonal(g):
    """Solo las partes poligonales de una geometría (las intersecciones dejan líneas y puntos sueltos)."""
    if g.geom_type in ("Polygon", "MultiPolygon"):
        return g
    return unary_union([x for x in getattr(g, "geoms", []) if x.geom_type in ("Polygon", "MultiPolygon")])


def main(regiones, adm1, dem, carpeta):
    a = json.load(open(adm1, encoding="utf-8"))
    est = [f for f in a["features"] if f["properties"]["iso_3166_2"] and "~" not in f["properties"]["iso_3166_2"]]
    jp = unary_union([make_valid(shape(f["geometry"])) for f in est if f["properties"]["adm0_a3"] == "JPN"]).buffer(0)
    au = unary_union([make_valid(shape(f["geometry"])) for f in est if f["properties"]["adm0_a3"] == "AUS"]).buffer(0)

    feats = [{"type": "Feature", "properties": {"u": k, "n": "Japón: " + n.lower()[0] + n[1:]}, "geometry": mapping(g)}
             for k, n, g in dem_japon(dem, jp)]
    d = json.load(open(regiones, encoding="utf-8"))
    unidades, nombradas = [], []
    for f in d["features"]:
        nom = f["properties"]["NAME"]
        if nom in AUSTRALIA:
            g = poligonal(make_valid(shape(f["geometry"])).buffer(0).intersection(au))
            if g.is_empty:
                continue
            u, etiqueta = AUSTRALIA[nom]
            unidades.append((u, g))
            nombradas.append((g.area, {"type": "Feature", "properties": {"u": u, "n": etiqueta}, "geometry": mapping(g)}))
    relleno = rellenar(unidades, au)
    feats += [{"type": "Feature", "properties": {"u": u, "n": NOMBRES_AU[u]}, "geometry": mapping(g)} for u, g in relleno.items()]
    feats += [f for _, f in sorted(nombradas, key=lambda x: -x[0])]   # las unidades pequeñas, encima
    json.dump({"type": "FeatureCollection", "features": feats}, open(os.path.join(carpeta, "relieve.geojson"), "w", encoding="utf-8"), ensure_ascii=False)

    json.dump({"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"id": f["properties"]["iso_3166_2"]}, "geometry": f["geometry"]} for f in est]},
        open(os.path.join(carpeta, "estados.geojson"), "w", encoding="utf-8"), ensure_ascii=False)

    k_au = os.path.join(carpeta, "k_au.geojson")
    if os.path.exists(k_au):
        zonas = usos_agrarios(k_au, au)
        json.dump({"type": "FeatureCollection", "features": [
            {"type": "Feature", "properties": {"u": k}, "geometry": mapping(g)} for k, g in zonas.items()]},
            open(os.path.join(carpeta, "agro_au.geojson"), "w", encoding="utf-8"))

    def pt(lon, lat, props):
        return {"type": "Feature", "properties": props, "geometry": {"type": "Point", "coordinates": [lon, lat]}}
    puntos = {
        "picos": [pt(x, y, {"n": n + (" (volcán)" if t == "v" else ""), "h": h}) for n, x, y, h, t in PICOS],
        "ciudades": [pt(x, y, {"n": n, "cap": c}) for n, x, y, c in CIUDADES],
        "cuencas": [pt(x, y, {"n": n}) for n, x, y in CUENCAS],
        "industria": [pt(x, y, {"n": n, "tipo": t, "nota": nota}) for n, x, y, t, nota in INDUSTRIA],
        "recursos": [pt(x, y, {"n": n, "tipo": t, "nota": nota}) for n, x, y, t, nota in RECURSOS],
    }
    json.dump(puntos, open(os.path.join(carpeta, "puntos.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    json.dump(LINEAS_JP, open(os.path.join(carpeta, "lineas_jp.json"), "w", encoding="utf-8"), ensure_ascii=False)
    print(len(feats), "polígonos de relieve;", len(est), "prefecturas y estados")


if __name__ == "__main__":
    main(*sys.argv[1:5])
