"""Genera las capas temáticas de Norteamérica (capítulo 3).

Uso:
    python3 herramientas/norteamerica_capas.py ne_10m_geography_regions_polys.geojson \
        ne_50m_admin_1_states_provinces.geojson carpeta_temporal

- relieve.geojson   unidades de Natural Earth (geography_regions_polys, 10m) clasificadas según las
                    grandes unidades de relieve del manual (apartado 1.1 y figura 3.1). La clasificación es nuestra.
                    Los huecos que dejan esas unidades dentro de Estados Unidos y Canadá se rellenan por celdas
                    de 1° con la unidad más próxima, salvo en las zonas de ZONAS, asignadas según la figura 3.1.
                    Las islas árticas alejadas de cualquier unidad quedan sin clasificar, como en la figura.
- estados.geojson   estados de Estados Unidos y provincias y territorios de Canadá (Natural Earth admin-1, 50m),
                    con su código ISO 3166-2 como identificador.
- puntos.json       picos, ciudades, regiones industriales (apartado 4.3 y figura 3.9) y recursos
                    (apartado 4.1.1). Posiciones aproximadas.
"""
import json
import os
import sys

from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union
from shapely.validation import make_valid

RELIEVE = {
    # 1. Escudo canadiense
    "CANADIAN SHIELD": ("escudo", "Escudo canadiense"),
    "Superior Upland": ("escudo", "Tierras altas del lago Superior"),
    "LES LAURENTIDES": ("escudo", "Laurentides"),
    "TORNGAT MTS.": ("escudo", "Montes Torngat"),
    "PÉNINSULE D’UNGAVA": ("escudo", "Península de Ungava"),
    "BARREN GROUNDS": ("escudo", "Barren Grounds (tierras estériles)"),
    "Adirondack Mts.": ("escudo", "Montes Adirondacks"),
    # 2. Apalaches
    "APPALACHIAN MTS.": ("apalaches", "Apalaches"),
    "Blue Ridge": ("apalaches", "Blue Ridge (Montañas Azules)"),
    "ALLEGHENY PLATEAU": ("apalaches", "Meseta de Allegheny"),
    "CUMBERLAND PLAT.": ("apalaches", "Meseta de Cumberland"),
    "PIEDMONT": ("apalaches", "Piedemonte"),
    "Gaspé Peninsula": ("apalaches", "Península de Gaspé"),
    # 3a. Llanuras litorales árticas
    "NORTH SLOPE": ("artica", "Vertiente norte de Alaska"),
    "Yukon Flats": ("artica", "Llanos del Yukón"),
    # 3b. Llanura litoral del Atlántico y del Golfo de México
    "COASTAL PLAIN": ("litoral", "Llanura litoral del Atlántico y del Golfo"),
    "FLORIDA": ("litoral", "Península de Florida"),
    "Sea Islands": ("litoral", "Sea Islands"),
    # 4. Llanuras interiores
    "GREAT PLAINS": ("interior", "Grandes Llanuras"),
    "CENTRAL LOWLAND": ("interior", "Tierras bajas centrales"),
    "Llano Estacado": ("interior", "Llano Estacado"),
    "Edwards Plateau": ("interior", "Meseta de Edwards"),
    "Black Hills": ("interior", "Black Hills"),
    # 5. Tierras altas del interior
    "Ozark Plateau": ("tierrasaltas", "Meseta de Ozark"),
    "Ouachita Mts.": ("tierrasaltas", "Montes Ouachita"),
    # 6. Montañas Rocosas
    "ROCKY MOUNTAINS": ("rocosas", "Montañas Rocosas"),
    "Front Range": ("rocosas", "Front Range"),
    "Bitterroot Range": ("rocosas", "Bitterroot"),
    "Salmon River Mts.": ("rocosas", "Montes Salmon River"),
    "Wasatch Range": ("rocosas", "Wasatch"),
    "MACKENZIE MTS.": ("rocosas", "Montes Mackenzie"),
    "SELWYN MTS.": ("rocosas", "Montes Selwyn"),
    "BROOKS RANGE": ("rocosas", "Cordillera Brooks"),
    "Ogilvie Mts.": ("rocosas", "Montes Ogilvie"),
    "Cassiar Mts.": ("rocosas", "Montes Cassiar"),
    "COLUMBIA MTS.": ("rocosas", "Montes Columbia"),
    # 7. Cuencas y mesetas intramontanas
    "GREAT BASIN": ("intramontana", "Gran Cuenca"),
    "COLORADO PLATEAU": ("intramontana", "Meseta del Colorado"),
    "COLUMBIA PLAT.": ("intramontana", "Meseta de Columbia"),
    "FRASER PLATEAU": ("intramontana", "Meseta de Fraser"),
    "YUKON PLATEAU": ("intramontana", "Meseta del Yukón"),
    "Great Salt Lake Desert": ("intramontana", "Desierto del Gran Lago Salado"),
    "Black Rock Desert": ("intramontana", "Desierto de Black Rock"),
    "Mogollon Rim": ("intramontana", "Mogollon Rim"),
    "Grand Canyon": ("intramontana", "Gran Cañón"),
    "Horn Plat.": ("intramontana", "Meseta Horn"),
    # 8. Cordillera costera del Pacífico
    "COAST RANGES": ("costera", "Cordilleras costeras de California"),
    "SIERRA NEVADA": ("costera", "Sierra Nevada"),
    "CASCADE RANGE": ("costera", "Cordillera de las Cascadas"),
    "COAST MOUNTAINS": ("costera", "Cordillera Costera de Canadá"),
    "ALASKA RANGE": ("costera", "Cordillera de Alaska"),
    "CHUGACH MTS.": ("costera", "Montes Chugach"),
    "Wrangell Mts.": ("costera", "Montes Wrangell"),
    "Klamath Mts.": ("costera", "Montes Klamath"),
    "Central Valley": ("costera", "Gran Valle de California"),
}

NOMBRES_U = {"escudo": "Escudo canadiense", "apalaches": "Apalaches", "artica": "Llanuras litorales árticas",
             "litoral": "Llanura litoral del Atlántico y del Golfo", "interior": "Llanuras interiores",
             "tierrasaltas": "Tierras altas del interior", "rocosas": "Montañas Rocosas",
             "intramontana": "Cuencas y mesetas intramontanas", "costera": "Cordillera costera del Pacífico"}

# Zonas de los huecos asignadas a mano según la figura 3.1 (o, s, e, n)
ZONAS = [
    ((-96, 50, -78, 58.5), "artica"),        # tierras bajas de la bahía de Hudson (3a)
    ((-136, 62, -118, 70.5), "artica"),      # bajo Mackenzie (3a)
    ((-123, 53, -104, 62), "interior"),      # Llanuras interiores del norte, hasta el Gran Lago del Esclavo
    ((-92.5, 29, -88, 37.5), "litoral"),     # llanura aluvial del Misisipi (3b)
    ((-166, 60, -141, 68), "intramontana"),  # interior de Alaska
    ((-60, 46.5, -52, 52), "apalaches"),     # Terranova
]


def rellenar(unidades, tierra):
    """Asigna los huecos de tierra sin unidad a la unidad más próxima (por celdas de 1°)."""
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
            u = next((u for (zo, zs, ze, zn), u in ZONAS if zo <= c.x <= ze and zs <= c.y <= zn), None)
            if u is None:
                d, u = min((g.distance(c), u) for u, g in unidades)
                if d > 1.5 and c.y > 60:   # islas árticas: sin clasificar, como en la figura
                    continue
            piezas.setdefault(u, []).append(celda)
    return {u: unary_union(v) for u, v in piezas.items()}


PICOS = [  # nombre, lon, lat, altitud (apartado 1.1)
    ("Denali (McKinley)", -151.007, 63.069, 6190),
    ("Monte Elbert", -106.445, 39.118, 4401),
    ("Monte Whitney", -118.292, 36.579, 4421),
    ("Monte Rainier", -121.760, 46.853, 4392),
    ("Monte Mitchell", -82.265, 35.765, 2037),
    ("Monte Washington", -71.303, 44.271, 1917),
    ("Valle de la Muerte (−86 m)", -116.83, 36.25, -86),
]

CIUDADES = [  # nombre, lon, lat, capital
    ("Washington", -77.04, 38.90, 1), ("Ottawa", -75.70, 45.42, 1), ("Nueva York", -74.00, 40.71, 0),
    ("Los Ángeles", -118.24, 34.05, 0), ("Chicago", -87.63, 41.88, 0), ("Houston", -95.37, 29.76, 0),
    ("Dallas", -96.80, 32.78, 0), ("Filadelfia", -75.17, 39.95, 0), ("Miami", -80.19, 25.76, 0),
    ("Atlanta", -84.39, 33.75, 0), ("Boston", -71.06, 42.36, 0), ("San Francisco", -122.42, 37.77, 0),
    ("Phoenix", -112.07, 33.45, 0), ("Seattle", -122.33, 47.61, 0), ("Detroit", -83.05, 42.33, 0),
    ("Denver", -104.99, 39.74, 0), ("Minneapolis", -93.27, 44.98, 0), ("Nueva Orleans", -90.07, 29.95, 0),
    ("Pittsburgh", -79.99, 40.44, 0), ("Toronto", -79.38, 43.65, 0), ("Montreal", -73.57, 45.50, 0),
    ("Vancouver", -123.12, 49.28, 0), ("Calgary", -114.07, 51.05, 0), ("Winnipeg", -97.14, 49.90, 0),
    ("Anchorage", -149.90, 61.22, 0), ("Quebec", -71.21, 46.81, 0), ("Halifax", -63.57, 44.65, 0),
]

INDUSTRIA = [  # nombre, lon, lat, tipo, nota (apartado 4.3 y figura 3.9)
    ("Megalópolis (Boston-Washington)", -74.0, 40.7, "noreste", "Núcleo del cinturón manufacturero: industria muy diversificada, servicios avanzados, finanzas e investigación."),
    ("Valle del Mohawk", -75.2, 43.0, "noreste", "Corredor entre el Atlántico y los Grandes Lagos: electrónica, locomotoras, turborreactores e industria fotográfica."),
    ("Pittsburgh-Cleveland", -80.8, 41.0, "noreste", "Industria pesada (siderurgia) sobre el carbón de los Apalaches y el hierro del lago Superior; hoy diversificada."),
    ("Detroit", -83.05, 42.33, "noreste", "Núcleo histórico de la industria del automóvil (Ford, General Motors, Chrysler)."),
    ("Calumet (sur de Chicago)", -87.5, 41.6, "noreste", "Gary, Hammond y Milwaukee: siderurgia, electrónica, textil y alimentación a orillas del lago Michigan."),
    ("Cinturón industrial canadiense", -79.0, 43.8, "noreste", "Toronto, Hamilton y Montreal: automóvil, acero, maquinaria y servicios."),
    ("Piedemonte (Charlotte-Greensboro)", -80.5, 35.6, "sur", "Industria textil trasladada desde Nueva Inglaterra, tabaco y química."),
    ("Triángulo de la Investigación", -78.8, 35.9, "sur", "Raleigh, Durham y Chapel Hill: biotecnología y alta tecnología."),
    ("Área de Tennessee (Birmingham)", -86.8, 33.5, "sur", "Acero de Birmingham y la investigación espacial de Huntsville."),
    ("Bajo Misisipi y costa del Golfo", -91.2, 30.2, "sur", "Petroquímica y refinerías entre Baton Rouge, Nueva Orleans y Houston."),
    ("Florida (Cabo Cañaveral, Tampa, Miami)", -80.6, 28.4, "sur", "Industria aeroespacial y nuevas tecnologías."),
    ("Los Ángeles-San Diego", -117.6, 33.6, "pacifico", "Industria aeronáutica y espacial, cine y farmacia."),
    ("San Francisco y Silicon Valley", -122.0, 37.4, "pacifico", "Electrónica e informática en torno a la Universidad de Stanford."),
    ("Seattle-Portland-Vancouver", -122.5, 47.0, "pacifico", "Aluminio sobre la energía hidráulica del Columbia, aeronáutica (Seattle, la «Jet City»), madera y papel."),
    ("Houston", -95.37, 29.76, "sur", "Petróleo, petroquímica e industria espacial."),
    ("Austin", -97.74, 30.27, "sur", "Complejo microelectrónico."),
]

RECURSOS = [  # nombre, lon, lat, tipo, nota (apartado 4.1.1)
    ("Cuenca pérmica (Texas y Nuevo México)", -102.5, 31.8, "petroleo", "Principal región productora de petróleo de esquisto (fracking)."),
    ("Costa del Golfo de México", -91.0, 28.5, "petroleo", "Petróleo y gas de Texas y Luisiana, en tierra y en el mar."),
    ("Bakken (Dakota del Norte)", -102.8, 47.9, "petroleo", "Petróleo de esquisto."),
    ("Vertiente norte de Alaska (Prudhoe Bay)", -148.5, 70.3, "petroleo", "Grandes reservas, encarecidas por la distancia y el clima."),
    ("Arenas bituminosas de Alberta", -111.5, 57.0, "petroleo", "Principal fuente del petróleo canadiense."),
    ("Marcellus (Apalaches)", -77.5, 41.5, "gas", "Gas de esquisto en Pensilvania y Virginia Occidental."),
    ("Carbón de los Apalaches", -81.5, 38.0, "carbon", "Kentucky, Virginia Occidental y Pensilvania."),
    ("Carbón de Illinois", -88.8, 38.0, "carbon", "Cuenca de la región central (Illinois e Indiana)."),
    ("Cuenca del Powder River (Wyoming)", -105.5, 44.0, "carbon", "Carbón a cielo abierto de las Montañas Rocosas: hoy la mayor producción."),
    ("Hierro del lago Superior (Mesabi)", -92.5, 47.5, "metales", "Minas de hierro a cielo abierto."),
    ("Cobre de Utah y Arizona", -112.1, 40.5, "metales", "Bingham Canyon y las minas de Arizona."),
    ("Uranio de Saskatchewan (Athabasca)", -105.0, 58.0, "metales", "Una de las principales zonas uraníferas del mundo."),
    ("Níquel de Sudbury", -81.0, 46.5, "metales", "Níquel y cobre del Escudo canadiense."),
    ("Presa Grand Coulee (Columbia)", -118.98, 47.96, "hidro", "Energía hidráulica del Columbia."),
    ("Presa Hoover (Colorado)", -114.74, 36.02, "hidro", "Energía hidráulica del Colorado."),
    ("James Bay (Quebec)", -77.0, 53.8, "hidro", "Gran complejo hidroeléctrico canadiense."),
]

LINEAS = [
    {"nombre": "Meridiano 98° O", "nota": "Frontera climática de la aridez: al este, la mitad húmeda; al oeste, la mitad seca (apartado 1.2.2).",
     "coords": [[-98, 26], [-98, 35], [-98, 45], [-98, 52], [-98, 60]]},
]


def main(relieve, admin1, carpeta):
    d = json.load(open(relieve, encoding="utf-8"))
    a = json.load(open(admin1, encoding="utf-8"))
    na = [f for f in a["features"] if f["properties"]["adm0_a3"] in ("USA", "CAN")]
    tierra = unary_union([make_valid(shape(f["geometry"])) for f in na]).buffer(0)
    feats, unidades = [], []
    for f in d["features"]:
        n = f["properties"]["NAME"]
        if n in RELIEVE:
            g = make_valid(shape(f["geometry"])).buffer(0)
            c = g.representative_point()
            if not (-170 < c.x < -50 and 24 < c.y < 84):
                continue
            u, etiqueta = RELIEVE[n]
            unidades.append((u, g))
            feats.append({"type": "Feature", "properties": {"u": u, "n": etiqueta}, "geometry": mapping(g)})
    relleno = rellenar(unidades, tierra)
    # el relleno va primero para que las unidades con nombre queden encima
    feats = [{"type": "Feature", "properties": {"u": u, "n": NOMBRES_U[u]}, "geometry": mapping(g)}
             for u, g in relleno.items()] + feats
    json.dump({"type": "FeatureCollection", "features": feats},
              open(os.path.join(carpeta, "relieve.geojson"), "w", encoding="utf-8"), ensure_ascii=False)

    est = [{"type": "Feature", "properties": {"id": f["properties"]["iso_3166_2"]}, "geometry": f["geometry"]} for f in na]
    json.dump({"type": "FeatureCollection", "features": est},
              open(os.path.join(carpeta, "estados.geojson"), "w", encoding="utf-8"), ensure_ascii=False)

    def pt(lon, lat, props):
        return {"type": "Feature", "properties": props, "geometry": {"type": "Point", "coordinates": [lon, lat]}}

    puntos = {
        "picos": [pt(x, y, {"n": n, "h": h}) for n, x, y, h in PICOS],
        "ciudades": [pt(x, y, {"n": n, "cap": c}) for n, x, y, c in CIUDADES],
        "industria": [pt(x, y, {"n": n, "tipo": t, "nota": nota}) for n, x, y, t, nota in INDUSTRIA],
        "recursos": [pt(x, y, {"n": n, "tipo": t, "nota": nota}) for n, x, y, t, nota in RECURSOS],
    }
    json.dump(puntos, open(os.path.join(carpeta, "puntos.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print(len(feats), "unidades de relieve;", len(est), "estados y provincias")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
