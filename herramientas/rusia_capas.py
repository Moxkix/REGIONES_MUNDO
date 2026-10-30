"""Genera las capas temáticas de Rusia y los Estados postsoviéticos (capítulo 2).

Uso:
    python3 herramientas/rusia_capas.py ne_10m_geography_regions_polys.geojson carpeta_temporal

- relieve.geojson   unidades de Natural Earth (geography_regions_polys, 10m) clasificadas
                    según las unidades morfoestructurales del manual (apartado 3.1 y figura 2.3).
                    La clasificación es nuestra.
- puntos.json       picos, ciudades, regiones industriales (apartados 5.3 y 6.2), yacimientos de
                    energía y minerales (apartados 5.1 y 5.2) y trazado esquemático del Transiberiano
                    y del BAM. Posiciones aproximadas.
"""
import json
import os
import sys

from shapely.geometry import mapping, shape

RELIEVE = {
    # Llanura rusa (plataforma)
    "NORTHERN EUROPEAN PLAIN": ("plataforma", "Gran Llanura rusa"),
    "Baltic Plains": ("plataforma", "Llanuras bálticas"),
    "PONTIC STEPPE": ("plataforma", "Estepa póntica"),
    "VYCHEGDA LOWLAND": ("plataforma", "Tierras bajas del Vychegda"),
    "CENTRAL RUSSIAN UPLAND": ("plataforma", "Alturas Centrales Rusas"),
    "Volga Upland": ("plataforma", "Alturas del Volga"),
    "Stavropol’ Plateau": ("plataforma", "Meseta de Stávropol"),
    "Bol’shezemel’skaya Tundra": ("plataforma", "Tundra de Bolshezemelskaya"),
    "CASPIAN DEPRESSION": ("aralocaspiana", "Depresión del Caspio"),
    # Escudos y zócalo cristalino
    "Karelia": ("escudo", "Carelia (escudo báltico)"),
    "KOLA PENINSULA": ("escudo", "Península de Kola (escudo báltico)"),
    "Dnieper Upland": ("escudo", "Alturas del Dniéper (escudo ucraniano)"),
    "Azov Upland": ("escudo", "Alturas de Azov (escudo ucraniano)"),
    "CENTRAL SIBERIAN PLATEAU": ("escudo", "Mesetas de Siberia Central"),
    "PUTORANA PLATEAU": ("escudo", "Meseta de Putorana"),
    "Aldan Upland": ("escudo", "Alturas del Aldán"),
    # Llanura de Siberia Occidental y tierras bajas del norte
    "WESTERN SIBERIAN PLAIN": ("siberia", "Llanura de Siberia Occidental"),
    "YAMAL PENINSULA": ("siberia", "Península de Yamal"),
    "GYDA PENINSULA": ("siberia", "Península de Gydán"),
    "Taz Pen.": ("siberia", "Península del Taz"),
    "NORTH SIBERIAN LOWLAND": ("siberia", "Tierras bajas del norte de Siberia"),
    "KOLYMA LOWLAND": ("siberia", "Tierras bajas del Kolimá"),
    # Depresión aralo-caspiana
    "TURAN LOWLAND": ("aralocaspiana", "Depresión de Turán"),
    "GARAGUM DESERT": ("aralocaspiana", "Desierto de Karakum"),
    "QIZILQUM DESERT": ("aralocaspiana", "Desierto de Kyzylkum"),
    "Ustyurt Plateau": ("aralocaspiana", "Meseta de Ustiurt"),
    "BETPAQDALA DESERT": ("aralocaspiana", "Desierto de Betpak-Dala"),
    "KAZAKH STEPPE": ("aralocaspiana", "Estepas kazajas"),
    # Zócalo herciniano levantado
    "URAL MOUNTAINS": ("herciniano", "Urales"),
    "KAZAKH UPLAND": ("herciniano", "Umbral de Kazajistán"),
    "ALTAY MOUNTAINS": ("herciniano", "Altái"),
    # Orla de montañas periféricas
    "CARPATHIAN MOUNTAINS": ("montanas", "Cárpatos"),
    "CAUCASUS MTS.": ("montanas", "Gran Cáucaso"),
    "Lesser Caucasus": ("montanas", "Pequeño Cáucaso"),
    "Kopet Dag Mts .": ("montanas", "Kopet Dag"),
    "PAMIRS": ("montanas", "Pamir"),
    "TIAN SHAN": ("montanas", "Tian Shan"),
    "Alataw Mts.": ("montanas", "Alatau"),
    "Karatau Range": ("montanas", "Karatau"),
    "Tarbagatay Ra.": ("montanas", "Tarbagatai"),
    "Abakanskiy Ra.": ("montanas", "Sierra de Abakán"),
    "Western Sayan Mts.": ("montanas", "Sayanes Occidentales"),
    "EASTERN SAYAN MTS.": ("montanas", "Sayanes Orientales"),
    "YABLONOVYY RANGE": ("montanas", "Montes Yablonovi"),
    "STANOVOY RANGE": ("montanas", "Montes Stanovói"),
    "STANOVOY UPLAND": ("montanas", "Alturas del Stanovói"),
    "VERKHOYANSK RANGE": ("montanas", "Montes de Verjoyansk"),
    "CHERSKIY RANGE": ("montanas", "Montes Cherski"),
    "Momskiy Mts.": ("montanas", "Montes Momski"),
    "Suntar-Khayata Range": ("montanas", "Suntar-Jayata"),
    "Dzhugdzhur Range": ("montanas", "Dzhugdzhur"),
    "Okhotsk-Kolyma Upland": ("montanas", "Alturas de Ojotsk-Kolimá"),
    "KOLYMA RANGE": ("montanas", "Montes de Kolimá"),
    "Chukchi Range": ("montanas", "Montes de Chukotka"),
    "Koryak Range": ("montanas", "Montes Koriakos"),
    "SREDINNYY RANGE": ("montanas", "Cordillera Central de Kamchatka"),
    "SIKHOTE-ALIN’ RANGE": ("montanas", "Sijoté-Alín"),
    "Bureinskiy Ra.": ("montanas", "Montes Bureya"),
}

PICOS = [  # nombre, lon, lat, altitud (m)
    ("Elbrús", 42.439, 43.355, 5642), ("Kazbek", 44.518, 42.697, 5054),
    ("Pico Ismail Samani (antiguo pico Comunismo)", 72.02, 38.94, 7495),
    ("Pico Pobeda (Jengish Chokusu)", 80.13, 42.04, 7439), ("Beluja (Altái)", 86.59, 49.81, 4506),
    ("Narodnaya (Urales)", 59.65, 65.03, 1895), ("Kliuchevskaya Sopka (Kamchatka)", 160.64, 56.06, 4754),
    ("Aragats", 44.20, 40.53, 4090), ("Hoverla (Cárpatos)", 24.50, 48.16, 2061),
]

CIUDADES = [  # nombre, lon, lat, capital estatal
    ("Moscú", 37.62, 55.76, 1), ("Kiev", 30.52, 50.45, 1), ("Minsk", 27.56, 53.90, 1),
    ("Chisinau", 28.86, 47.01, 1), ("Tiflis", 44.79, 41.72, 1), ("Ereván", 44.51, 40.18, 1),
    ("Bakú", 49.87, 40.41, 1), ("Astaná", 71.43, 51.13, 1), ("Taskent", 69.28, 41.31, 1),
    ("Asjabad", 58.38, 37.95, 1), ("Biskek", 74.59, 42.87, 1), ("Dusambé", 68.78, 38.56, 1),
    ("San Petersburgo", 30.32, 59.94, 0), ("Nizhni Nóvgorod", 44.00, 56.33, 0), ("Kazán", 49.11, 55.79, 0),
    ("Samara", 50.10, 53.20, 0), ("Volgogrado", 44.52, 48.71, 0), ("Rostov del Don", 39.72, 47.24, 0),
    ("Ekaterimburgo", 60.60, 56.84, 0), ("Cheliábinsk", 61.40, 55.16, 0), ("Perm", 56.25, 58.01, 0),
    ("Ufá", 55.96, 54.74, 0), ("Omsk", 73.37, 54.99, 0), ("Novosibirsk", 82.92, 55.03, 0),
    ("Krasnoyarsk", 92.87, 56.01, 0), ("Irkutsk", 104.28, 52.29, 0), ("Norilsk", 88.20, 69.35, 0),
    ("Yakutsk", 129.73, 62.03, 0), ("Jabárovsk", 135.07, 48.48, 0), ("Vladivostok", 131.89, 43.12, 0),
    ("Múrmansk", 33.08, 68.97, 0), ("Arcángel", 40.52, 64.54, 0), ("Járkov", 36.23, 49.99, 0),
    ("Odesa", 30.73, 46.48, 0), ("Dnipró", 35.05, 48.46, 0), ("Almaty", 76.89, 43.24, 0),
    ("Samarcanda", 66.96, 39.65, 0), ("Karagandá", 73.10, 49.80, 0), ("Tiumén", 65.53, 57.15, 0),
]

INDUSTRIA = [  # nombre, lon, lat, tipo, nota (apartados 5.3 y 6.2)
    ("Región industrial central (Moscú)", 37.6, 55.7, "centro", "Corazón económico de Rusia: industria diversificada, ciencia y servicios; unas 30 ciudades de más de 100.000 habitantes en 400 km."),
    ("San Petersburgo", 30.3, 59.9, "centro", "Gran puerto hacia el Báltico; industria apoyada en los recursos del Gran Norte y la taiga."),
    ("Región del Volga", 49.5, 53.5, "europea", "Eje urbano e industrial (Kazán, Samara, Sarátov, Volgogrado), automóvil en Togliatti y energía hidroeléctrica."),
    ("Urales", 60.6, 56.0, "europea", "Principal región minera de Rusia y gran productora de acero (Magnitogorsk, Ekaterimburgo, Cheliábinsk)."),
    ("Kuzbass", 86.5, 54.0, "siberiana", "Carbón abundante y de fácil extracción; siderurgia, química y mecánica (Novokuznetsk, Kémerovo)."),
    ("Angara-Baikal", 101.0, 55.0, "siberiana", "Aluminio y celulosa junto a las grandes presas del Yeniséi y el Angará (Krasnoyarsk, Bratsk, Irkutsk)."),
    ("Extremo Oriente", 136.0, 49.0, "siberiana", "Siderurgia en Komsomolsk, bienes de equipo en Jabárovsk, pesca y puerto en Vladivostok."),
    ("Donbás", 38.0, 48.1, "ucraniana", "Carbón y siderurgia de Ucrania oriental; zona de guerra desde 2014."),
    ("Dniéper (Zaporiyia-Dnipró)", 35.1, 47.9, "ucraniana", "Ferroaleaciones, aluminio y acero sobre la energía del Dniéper y el hierro de Krivói Rog."),
    ("Karagandá", 73.1, 49.8, "asiatica", "Carbón, metalurgia y cobre en el norte de Kazajistán."),
]

RECURSOS = [  # nombre, lon, lat, tipo, nota (apartados 5.1 y 5.2)
    ("Bakú (Absherón)", 49.9, 40.4, "petroleo", "Primer Bakú: explotado desde 1873; hoy la producción avanza bajo el Caspio."),
    ("Volga-Urales (Segundo Bakú)", 52.5, 54.5, "petroleo", "Yacimientos entre el Volga y los Urales, en explotación desde los años treinta."),
    ("Siberia Occidental (Tercer Bakú)", 73.4, 61.25, "petroleo", "Cuenca del Obi (Surgut, Samotlor): principal región petrolera de Rusia."),
    ("Tengiz y Kashagán (Cuarto Bakú)", 53.3, 46.3, "petroleo", "Grandes yacimientos del Caspio kazajo."),
    ("Urengói y Yamal", 76.6, 66.5, "gas", "Primeros yacimientos de gas del mundo en el Gran Norte de Siberia Occidental."),
    ("Turkmenistán (Galkynysh)", 62.5, 37.2, "gas", "Cuartas reservas de gas del mundo."),
    ("Sajalín", 143.0, 52.0, "gas", "Petróleo y gas en la plataforma marina del Pacífico."),
    ("Donbás", 38.5, 48.0, "carbon", "Carbón de Ucrania oriental, casi paralizado por la guerra."),
    ("Kuzbass", 87.0, 54.5, "carbon", "Primera cuenca hullera de Rusia."),
    ("Karagandá", 73.0, 49.9, "carbon", "Carbón de las estepas kazajas."),
    ("Pechora (Vorkutá)", 64.0, 67.5, "carbon", "Carbón del Ártico europeo."),
    ("Kansk-Achinsk", 91.0, 56.2, "carbon", "Gran yacimiento de lignito de Siberia Central."),
    ("Krivói Rog", 33.4, 47.9, "metales", "Hierro de Ucrania."),
    ("Anomalía magnética de Kursk", 37.5, 51.0, "metales", "Hierro entre Rusia y Ucrania."),
    ("Norilsk", 88.2, 69.35, "metales", "Níquel, paladio, platino y cobre."),
    ("Kolimá", 151.0, 62.5, "metales", "Oro del Extremo Oriente."),
    ("Muruntau", 64.6, 41.5, "metales", "Una de las mayores minas de oro del mundo (Uzbekistán)."),
    ("Uranio de Kazajistán", 68.0, 44.5, "metales", "Kazajistán es el primer productor mundial de uranio."),
]

LINEAS = [
    {"nombre": "Transiberiano", "nota": "Moscú-Vladivostok (9.289 km), terminado en 1905: eje de la colonización de Siberia.",
     "coords": [[37.6, 55.8], [44.0, 56.3], [56.2, 58.0], [60.6, 56.8], [65.5, 57.2], [73.4, 55.0], [82.9, 55.0],
                [92.9, 56.0], [104.3, 52.3], [107.6, 51.8], [113.5, 52.0], [127.5, 50.3], [135.1, 48.5], [131.9, 43.1]]},
    {"nombre": "BAM (Baikal-Amur)", "nota": "Ferrocarril Baikal-Amur, al norte del Transiberiano, abierto en los años ochenta para explotar nuevos yacimientos.",
     "coords": [[98.0, 56.0], [101.6, 56.3], [109.3, 55.7], [114.0, 56.8], [124.7, 55.2], [131.0, 54.0], [137.0, 50.6], [140.3, 49.0]]},
]


def main(entrada, carpeta):
    d = json.load(open(entrada, encoding="utf-8"))
    feats = []
    for f in d["features"]:
        n = f["properties"]["NAME"]
        if n in RELIEVE:
            u, etiqueta = RELIEVE[n]
            feats.append({"type": "Feature", "properties": {"u": u, "n": etiqueta},
                          "geometry": mapping(shape(f["geometry"]))})
    json.dump({"type": "FeatureCollection", "features": feats},
              open(os.path.join(carpeta, "relieve.geojson"), "w", encoding="utf-8"), ensure_ascii=False)

    def pt(lon, lat, props):
        return {"type": "Feature", "properties": props, "geometry": {"type": "Point", "coordinates": [lon, lat]}}

    puntos = {
        "picos": [pt(x, y, {"n": n, "h": h}) for n, x, y, h in PICOS],
        "ciudades": [pt(x, y, {"n": n, "cap": c}) for n, x, y, c in CIUDADES],
        "industria": [pt(x, y, {"n": n, "tipo": t, "nota": nota}) for n, x, y, t, nota in INDUSTRIA],
        "recursos": [pt(x, y, {"n": n, "tipo": t, "nota": nota}) for n, x, y, t, nota in RECURSOS],
    }
    json.dump(puntos, open(os.path.join(carpeta, "puntos.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
