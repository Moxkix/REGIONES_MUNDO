"""Genera las capas temáticas de Europa (relieve, ciudades, industria, picos).

Uso:
    python3 herramientas/europa_capas.py ne_10m_geography_regions_polys.geojson regiones/europa/capas

- relieve.geojson   unidades de Natural Earth (geography_regions_polys, 10m)
                    clasificadas según las grandes unidades morfoestructurales
                    del manual (apartado 1.1.2). La clasificación es nuestra.
- puntos.json       cuencas sedimentarias, picos, ciudades, regiones
                    industriales y cuencas hulleras. Las regiones industriales
                    y cuencas hulleras siguen el texto y la figura 1.11 del
                    manual; su posición es aproximada (centroide de la región).
"""
import json
import os
import sys

from shapely.geometry import mapping, shape

# nombre en Natural Earth -> (unidad, etiqueta en español)
RELIEVE = {
    # Escudos precámbricos
    "Finnish Lake Region": ("escudo", "Región de los lagos (escudo báltico)"),
    "Karelia": ("escudo", "Carelia"),
    "LAPLAND": ("escudo", "Laponia"),
    "KOLA PENINSULA": ("escudo", "Península de Kola"),
    "Finnmarks-vidda": ("escudo", "Finnmarksvidda"),
    "Dnieper Upland": ("escudo", "Alturas del Dniéper (escudo ucraniano)"),
    "Azov Upland": ("escudo", "Alturas de Azov (escudo ucraniano)"),
    # Cordilleras caledonianas
    "KJØLEN MOUNTAINS": ("caledoniano", "Montes Escandinavos"),
    "Hardanger-vidda": ("caledoniano", "Hardangervidda"),
    "Grampian Mts.": ("caledoniano", "Montes Grampianos (Highlands)"),
    "Cambrian Mts.": ("caledoniano", "Montes Cámbricos"),
    # Macizos hercinianos
    "Massif Central": ("herciniano", "Macizo Central"),
    "Bretagne": ("herciniano", "Macizo Armoricano"),
    "Ardennes": ("herciniano", "Ardenas"),
    "Harz": ("herciniano", "Harz"),
    "Vosges": ("herciniano", "Vosgos"),
    "Böhmerwald": ("herciniano", "Selva de Bohemia"),
    "Erzgebirge": ("herciniano", "Montes Metálicos"),
    "Sudetes Mts.": ("herciniano", "Sudetes"),
    "Sierra Morena": ("herciniano", "Sierra Morena"),
    "Cord. Cantábrica": ("herciniano", "Cordillera Cantábrica (zócalo rejuvenecido)"),
    "URAL MOUNTAINS": ("herciniano", "Urales"),
    # Cordilleras alpinas
    "ALPS": ("alpino", "Alpes"),
    "PYRENEES": ("alpino", "Pirineos"),
    "S. Nevada": ("alpino", "Cordilleras Béticas (Sierra Nevada)"),
    "APPENNINI": ("alpino", "Apeninos"),
    "Calabria": ("alpino", "Arco calabrés"),
    "Jura": ("alpino", "Jura"),
    "Dinaric Alps": ("alpino", "Alpes Dináricos"),
    "Pindus Mts.": ("alpino", "Pindo"),
    "Balkan Mts.": ("alpino", "Balcanes"),
    "CARPATHIAN MOUNTAINS": ("alpino", "Cárpatos"),
    "Tatra Mts.": ("alpino", "Tatras"),
    "Transylvanian Alps": ("alpino", "Alpes de Transilvania"),
    "CAUCASUS MTS.": ("alpino", "Cáucaso"),
    "Lesser Caucasus": ("alpino", "Cáucaso Menor"),
    "PONTIC MOUNTAINS": ("alpino", "Montes Pónticos"),
    "Taurus Mts.": ("alpino", "Tauro"),
    "Atlas Tellien": ("alpino", "Atlas Telliano"),
    "Er Rif": ("alpino", "Rif"),
    # Llanuras y plataforma
    "NORTHERN EUROPEAN PLAIN": ("llanura", "Gran Llanura Europea"),
    "Baltic Plains": ("llanura", "Llanuras bálticas"),
    "PONTIC STEPPE": ("llanura", "Estepa póntica"),
    "CASPIAN DEPRESSION": ("llanura", "Depresión del Caspio"),
    "VYCHEGDA LOWLAND": ("llanura", "Tierras bajas del Vychegda"),
    "CENTRAL RUSSIAN UPLAND": ("llanura", "Alturas Centrales Rusas (plataforma)"),
    "Volga Upland": ("llanura", "Alturas del Volga (plataforma)"),
    # Cuencas de antepaís alpino
    "Alföld": ("cuenca", "Gran Llanura Húngara (cuenca de Panonia)"),
}

CUENCAS = [  # cuencas sedimentarias citadas en el manual (posición aproximada)
    ("Cuenca de Londres", -1.6, 51.15), ("Cuenca de París", 2.0, 47.75),
    ("Cuenca de Aquitania", -0.4, 44.3), ("Cuenca del Duero", -4.6, 41.7),
    ("Cuenca del Tajo", -3.4, 40.0), ("Depresión del Ebro", -0.6, 41.6),
    ("Depresión del Guadalquivir", -5.6, 37.4), ("Llanura del Po", 10.3, 45.1),
    ("Macizo Ibérico (Meseta)", -5.6, 39.1),
]

PICOS = [  # altitud en metros
    ("Mont Blanc", 6.865, 45.833, 4806), ("Elbrus", 42.439, 43.355, 5642),
    ("Mulhacén", -3.311, 37.053, 3479), ("Aneto", 0.657, 42.631, 3404),
    ("Olimpo", 22.358, 40.086, 2918), ("Musala", 23.585, 42.180, 2925),
    ("Gerlach", 20.134, 49.164, 2655), ("Galdhøpiggen", 8.312, 61.636, 2469),
    ("Ben Nevis", -5.004, 56.797, 1345), ("Puy de Sancy", 2.814, 45.528, 1885),
    ("Corno Grande", 13.566, 42.469, 2912), ("Triglav", 13.837, 46.378, 2864),
]

CIUDADES = [  # nombre, lon, lat, capital estatal
    ("Londres", -0.13, 51.51, 1), ("París", 2.35, 48.86, 1), ("Madrid", -3.70, 40.42, 1),
    ("Lisboa", -9.14, 38.72, 1), ("Roma", 12.50, 41.90, 1), ("Berlín", 13.40, 52.52, 1),
    ("Viena", 16.37, 48.21, 1), ("Varsovia", 21.01, 52.23, 1), ("Praga", 14.42, 50.08, 1),
    ("Budapest", 19.04, 47.50, 1), ("Bucarest", 26.10, 44.43, 1), ("Sofía", 23.32, 42.70, 1),
    ("Atenas", 23.73, 37.98, 1), ("Belgrado", 20.46, 44.79, 1), ("Bruselas", 4.35, 50.85, 1),
    ("Ámsterdam", 4.90, 52.37, 1), ("Copenhague", 12.57, 55.68, 1), ("Estocolmo", 18.07, 59.33, 1),
    ("Oslo", 10.75, 59.91, 1), ("Helsinki", 24.94, 60.17, 1), ("Dublín", -6.26, 53.35, 1),
    ("Kiev", 30.52, 50.45, 1), ("Moscú", 37.62, 55.76, 1), ("Minsk", 27.56, 53.90, 1),
    ("Zagreb", 15.98, 45.81, 1), ("Riga", 24.11, 56.95, 1), ("Vilna", 25.28, 54.69, 1),
    ("Tallin", 24.75, 59.44, 1), ("Bratislava", 17.11, 48.15, 1), ("Liubliana", 14.51, 46.06, 1),
    ("Berna", 7.45, 46.95, 1), ("Chisinau", 28.86, 47.01, 1),
    ("Milán", 9.19, 45.46, 0), ("Barcelona", 2.17, 41.39, 0), ("Hamburgo", 9.99, 53.55, 0),
    ("Múnich", 11.58, 48.14, 0), ("Fráncfort", 8.68, 50.11, 0), ("Colonia", 6.96, 50.94, 0),
    ("Róterdam", 4.48, 51.92, 0), ("Lyon", 4.84, 45.76, 0), ("Marsella", 5.37, 43.30, 0),
    ("Mánchester", -2.24, 53.48, 0), ("Birmingham", -1.90, 52.49, 0), ("Glasgow", -4.25, 55.86, 0),
    ("Nápoles", 14.27, 40.85, 0), ("Turín", 7.69, 45.07, 0), ("Oporto", -8.61, 41.15, 0),
    ("Bilbao", -2.93, 43.26, 0), ("Cracovia", 19.94, 50.06, 0), ("Estambul", 28.98, 41.01, 0),
    ("San Petersburgo", 30.32, 59.94, 0), ("Odesa", 30.73, 46.48, 0), ("Járkov", 36.23, 49.99, 0),
]

INDUSTRIA = [  # nombre, lon, lat, tipo, nota (según el manual, apartado 5.2 y figura 1.11)
    ("Midlands y Yorkshire", -1.6, 53.3, "tradicional", "Antiguo «país negro» sobre carbón; reconversión con ayudas del FEDER y el FSE."),
    ("Gran Londres", -0.1, 51.5, "metropolitana", "Industria de transformación diversificada ligada al mercado y a los centros de decisión."),
    ("Ruhr", 7.2, 51.45, "tradicional", "Cuenca hullera y siderúrgica; resistió mejor la crisis por su posición junto al eje del Rin y su diversificación."),
    ("Lorena-Sarre", 6.6, 49.2, "tradicional", "Siderurgia sobre hierro y carbón; fuerte hundimiento con la crisis del acero."),
    ("Pasillo franco-belga", 3.6, 50.5, "tradicional", "Cuencas hulleras de Nord-Pas-de-Calais y Charleroi-Lieja."),
    ("Región de París (Île-de-France)", 2.35, 48.85, "metropolitana", "Gran polo industrial y terciario de un modelo macrocéfalo."),
    ("Randstad y Róterdam", 4.5, 52.0, "portuaria", "Primer centro de refino de Europa; industria litoral y portuaria."),
    ("Fosa del Rin (Rin-Main)", 8.4, 49.6, "reciente", "Eje de intensa actividad industrial y de comunicaciones."),
    ("Valle del Po (Piamonte-Lombardía)", 9.0, 45.3, "reciente", "Industrialización reciente y diversificada en torno a Milán y Turín."),
    ("Ródano-Alpes", 4.9, 45.6, "reciente", "Industria de transformación en torno a Lyon."),
    ("Sajonia", 13.0, 51.0, "tradicional", "Región industrial histórica de Alemania oriental."),
    ("Bohemia", 14.5, 50.2, "tradicional", "Metalurgia fomentada por el CAME; reconversión tras 1990."),
    ("Alta Silesia", 18.9, 50.3, "tradicional", "Cuenca hullera durante años primera productora de carbón de Europa."),
    ("Hamburgo", 10.0, 53.55, "portuaria", "Puerto del mar del Norte con industria litoral."),
    ("Marsella-Fos", 5.0, 43.4, "portuaria", "Refino, petroquímica y siderurgia portuaria."),
    ("Barcelona", 2.1, 41.45, "reciente", "Textil histórico y diversificación en el «arco latino»."),
    ("Madrid", -3.7, 40.4, "metropolitana", "Concentración industrial metropolitana."),
    ("Ría de Bilbao", -2.98, 43.3, "tradicional", "Siderurgia y construcción naval en reconversión."),
    ("Asturias", -5.85, 43.35, "tradicional", "Cuenca hullera y siderurgia en reconversión."),
    ("Bergslagen y Gotemburgo", 13.5, 59.0, "tradicional", "Minería de hierro y metalurgia sueca; automóvil en Gotemburgo."),
    ("Cuenca del Donets (Donbás)", 38.0, 48.2, "tradicional", "Carbón y siderurgia de Ucrania oriental."),
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
        return {"type": "Feature", "properties": props,
                "geometry": {"type": "Point", "coordinates": [lon, lat]}}

    puntos = {
        "cuencas": [pt(x, y, {"n": n}) for n, x, y in CUENCAS],
        "picos": [pt(x, y, {"n": n, "h": h}) for n, x, y, h in PICOS],
        "ciudades": [pt(x, y, {"n": n, "cap": c}) for n, x, y, c in CIUDADES],
        "industria": [pt(x, y, {"n": n, "tipo": t, "nota": nota}) for n, x, y, t, nota in INDUSTRIA],
    }
    json.dump(puntos, open(os.path.join(carpeta, "puntos.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=0)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
