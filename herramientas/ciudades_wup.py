"""Prepara los datos del motor «Ciudades» a partir de los extractos de World Urbanization Prospects 2025.

Uso: python3 herramientas/ciudades_wup.py

Lee herramientas/wup2025/*.txt (ver extraer.js) y la población total de datos/poblacion/<ID>.json
(WPP 2024) y escribe:
  datos/ciudades/ciudades.json      ciudades de 100 000 hab. o más, 1975-2050, con coordenadas
  datos/ciudades/urbanizacion.json  porcentaje de población urbana (definiciones nacionales), 1950-2050
  datos/ciudades/tamano.json        peso de las ciudades por tamaño en la población de cada país
"""
import json
import math
import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WUP = os.path.join(RAIZ, "herramientas", "wup2025")
SALIDA = os.path.join(RAIZ, "datos", "ciudades")

ANIOS = [1975, 1990, 2000, 2010, 2025, 2035, 2050]
ANIOS_U = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2015, 2020, 2025, 2030, 2040, 2050]
ANIOS_T = [1975, 2000, 2025, 2050]

URSS = ["RUS", "UKR", "BLR", "MDA", "EST", "LVA", "LTU", "GEO", "ARM", "AZE", "KAZ", "UZB", "TKM", "KGZ", "TJK"]
UE27 = ["AUT", "BEL", "BGR", "HRV", "CYP", "CZE", "DNK", "EST", "FIN", "FRA", "DEU", "GRC", "HUN", "IRL", "ITA", "LVA",
        "LTU", "LUX", "MLT", "NLD", "POL", "PRT", "ROU", "SVK", "SVN", "ESP", "SWE"]

# Nombres en castellano de las ciudades más citadas
NOMBRES = {
    "Moskva (Moscow)": "Moscú", "Saint Petersburg": "San Petersburgo", "Kyiv (Kiev)": "Kiev", "London": "Londres",
    "Paris": "París", "Roma (Rome)": "Roma", "Milan": "Milán", "Naples": "Nápoles", "Turin": "Turín", "Genoa": "Génova",
    "Florence": "Florencia", "Warszawa (Warsaw)": "Varsovia", "Praha (Prague)": "Praga", "Wien (Vienna)": "Viena",
    "Bruxelles (Brussels)": "Bruselas", "Antwerp": "Amberes", "Lisboa (Lisbon)": "Lisboa", "Porto": "Oporto",
    "Athína (Athens)": "Atenas", "Thessaloniki": "Salónica", "București (Bucharest)": "Bucarest",
    "Beograd (Belgrade)": "Belgrado", "Sofia": "Sofía", "København (Copenhagen)": "Copenhague", "Stockholm": "Estocolmo",
    "Gothenburg": "Gotemburgo", "Helsinki (Helsingfors)": "Helsinki", "Dublin": "Dublín", "The Hague": "La Haya",
    "Berlin": "Berlín", "Hamburg": "Hamburgo", "Munich": "Múnich", "Cologne": "Colonia", "Frankfurt": "Fráncfort",
    "Essen": "Essen (cuenca del Ruhr)", "Dusseldorf": "Düsseldorf", "Nuremberg": "Núremberg", "Hanover": "Hannover",
    "Geneva": "Ginebra", "Zurich": "Zúrich", "Berne (Bern)": "Berna", "Basel": "Basilea", "Lucerne": "Lucerna",
    "Tbilisi": "Tiflis", "Yerevan": "Ereván", "Bakı (Baku)": "Bakú", "Toshkent (Tashkent)": "Taskent",
    "Samarqand": "Samarcanda", "Bukhara": "Bujará", "Qoqand": "Kokand", "Namangan": "Namangán", "Andijon": "Andiyán",
    "Fergana": "Ferganá", "Qarshi": "Karshi", "Astana": "Astaná", "Shymkent": "Shymkent", "Karaganda": "Karagandá",
    "Bishkek": "Biskek", "Dushanbe": "Dusambé", "Khujand": "Juyand", "Aşgabat (Ashgabat)": "Asjabad",
    "Minsk": "Minsk", "Homel": "Gómel", "Chișinău": "Chisináu", "Kharkiv": "Járkov", "Odesa": "Odesa", "Dnipro": "Dnipró",
    "Lviv": "Leópolis", "Zaporizhzhia": "Zaporiyia", "Kryvyi Rih": "Krivói Rog", "Mykolaiv": "Mikoláiv",
    "Sevastopol": "Sebastopol", "Simferopol": "Simferópol", "Yekaterinburg": "Ekaterimburgo",
    "Nizhny Novgorod": "Nizhni Nóvgorod", "Rostov-on-Don": "Rostov del Don", "Kazan": "Kazán",
    "Volgograd": "Volgogrado", "Chelyabinsk": "Cheliábinsk", "Krasnoyarsk": "Krasnoyarsk", "Voronezh": "Vorónezh",
    "Saratov": "Sarátov", "Krasnodar": "Krasnodar", "Tyumen": "Tiumén", "Novokuznetsk": "Novokuznetsk",
    "Komsomolsk-on-Amur": "Komsomolsk del Amur", "Arkhangelsk": "Arjánguelsk", "Astrakhan": "Astracán",
    "Makhachkala": "Majachkalá", "Yakutsk": "Yakutsk", "Tula": "Tula", "Murmansk": "Múrmansk",
    "Riga": "Riga", "Vilnius": "Vilna", "Tallinn": "Tallin", "Kaunas": "Kaunas",
    "Seville": "Sevilla", "Donostia / San Sebastián": "San Sebastián", "Oviedo / Uviéu": "Oviedo", "Elx / Elche": "Elche",
    "Almeria": "Almería", "Glasgow": "Glasgow", "Edinburgh": "Edimburgo", "Manchester": "Mánchester",
    "Marseille": "Marsella", "Lille": "Lille", "Bordeaux": "Burdeos", "Nice": "Niza", "Strasbourg": "Estrasburgo",
    "Toulouse": "Toulouse", "Krakow": "Cracovia", "Wrocław": "Breslavia", "Gdansk": "Gdansk", "Lodz": "Lodz",
    "Poznan": "Poznan", "Katowice": "Katowice (Alta Silesia)", "Lefkosia (Nicosia)": "Nicosia",
    "Tiranë (Tirana)": "Tirana", "Prishtina (Pristina)": "Pristina", "Luxembourg-Ville": "Luxemburgo",
    "Reykjavík": "Reikiavik", "Valletta": "La Valeta", "Ljubljana": "Liubliana", "Bratislava": "Bratislava",
    "Skopje": "Skopie", "Saarbruecken": "Saarbrücken",
    # núcleos que la rejilla separa del centro principal o que la ONU deja sin nombre
    "АЗС": "Petropávlovsk-Kamchatski", "Rajon Swerdlowski": "Krasnoyarsk (sur del Yeniséi)",
    "Metallurgicheskiy District": "Cheliábinsk (distrito Metalúrgico)", "Тимофеевка": "Toliatti (distrito Avtozavodski)",
    "Лада": "Toliatti (este)", "Волгогрэс": "Volgogrado (sur)", "посёлок Нагорный": "Volgogrado (extremo sur)",
    "Ленинский": "Uliánovsk (orilla izquierda del Volga)", "Бункерная": "Lípetsk (sur)",
    "Кислино": "Kursk (sur)", "Фокинский район": "Briansk (distrito Fokinski)", "Фосфоритный": "Briansk (este)",
    "Шелепино": "Rýbinsk", "Zhilkino": "Irkutsk (noroeste)",
    "Анатуриши узбок": "Vahdat (este)", "Киров": "Bojtar (este)", "Курбонкуса": "Tursunzoda (oeste)",
    "Шадобдеҳ": "Istaravshán",
}


def num(x):
    return None if x == "" else int(x)


def leer(nombre):
    with open(os.path.join(WUP, nombre), encoding="utf-8") as f:
        return [l.rstrip("\n").split("|") for l in f if l.strip()]


def poblacion_wpp(iso):
    ruta = os.path.join(RAIZ, "datos", "poblacion", iso + ".json")
    if not os.path.exists(ruta):
        return None
    d = json.load(open(ruta, encoding="utf-8"))
    a0 = d["anios"][0]
    return {y: d["poblacion"][y - a0] for y in range(a0, d["anios"][1] + 1)}


def nombre_corto(n):
    if n in NOMBRES:
        return NOMBRES[n]
    m = re.match(r"^(.*?) \((.*)\)$", n)
    return m.group(2) if m else n


def main():
    os.makedirs(SALIDA, exist_ok=True)

    # ---- ciudades ----
    ciudades = []
    for c in leer("ciudades.txt"):
        iso, n, lon, lat, cap = c[:5]
        v = [num(x) for x in c[5:]]
        ciudades.append([iso, nombre_corto(n), float(lon), float(lat), 1 if cap else 0, v])
    ciudades.sort(key=lambda c: -(c[5][4] or 0))
    top = []
    for c in leer("top_mundo.txt"):
        v = [int(x) or None for x in c[4:]]
        top.append([c[0], nombre_corto(c[1]), float(c[2]), float(c[3]), v])
    json.dump({
        "fuente": "Naciones Unidas, World Urbanization Prospects 2025 (archivo F21, ciudades según el grado de urbanización)",
        "url": "https://population.un.org/wup/downloads?tab=Cities",
        "nota": "Una ciudad es un centro urbano continuo de la rejilla de 1 km² (densidad de 1.500 hab./km² y 50.000 hab. o más), "
                "con independencia de los límites municipales. Por eso las cifras no coinciden con las oficiales de cada ciudad: "
                "Moscú, por ejemplo, incluye su periferia continua, y una conurbación como la del Ruhr cuenta como una sola ciudad, mientras que algunas ciudades "
                "partidas por un río aparecen en dos núcleos. Perm (Rusia, un millón de habitantes) no figura en el archivo de la ONU. "
                "Hasta 2025 son estimaciones; 2035 y 2050 son proyecciones. Población en miles.",
        "anios": ANIOS, "ultimoEstimado": 2025,
        "campos": ["pais", "nombre", "lon", "lat", "capital", "poblacion"],
        "ciudades": ciudades,
        "mundo": {"anios": ANIOS_T, "ciudades": top},
    }, open(os.path.join(SALIDA, "ciudades.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

    # ---- población total (WPP) ----
    pob = {}
    for iso in set([c[0] for c in ciudades] + [a[0] for a in leer("agregados.txt")] + URSS + UE27 + ["MUNDO", "EUR"]):
        p = poblacion_wpp(iso)
        if p:
            pob[iso] = p
    pob["WLD"] = pob.get("MUNDO")

    # ---- urbanización (definiciones nacionales) ----
    series = {c[0]: [float(x) if x else None for x in c[1:]] for c in leer("urbano_nacional.txt")}

    def ponderar(lista):
        out = []
        for i, y in enumerate(ANIOS_U):
            num_, den = 0, 0
            for iso in lista:
                if iso in series and series[iso][i] is not None and iso in pob:
                    num_ += series[iso][i] * pob[iso][y]; den += pob[iso][y]
            out.append(round(num_ / den, 1) if den else None)
        return out
    series["URSS15"] = ponderar(URSS)
    series["UE27"] = ponderar(UE27)
    catalogo = json.load(open(os.path.join(RAIZ, "datos", "regiones.json"), encoding="utf-8"))["regiones"]
    for r in catalogo:  # cada región del temario, ponderada con su población
        if r.get("disponible") and any(iso in series for iso in r["paises"]):
            series[r["id"]] = ponderar(r["paises"])
    json.dump({
        "fuente": "Naciones Unidas, World Urbanization Prospects 2025 (población urbana según las definiciones nacionales); "
                  "antigua URSS y UE-27 ponderadas con la población de World Population Prospects 2024",
        "url": "https://population.un.org/wup/downloads?tab=CSV%20Format",
        "nota": "Cada país define lo urbano a su manera (por tamaño, por función o por categoría administrativa), "
                "así que las comparaciones entre países son aproximadas. Hasta 2025, estimaciones; después, proyecciones.",
        "anios": ANIOS_U,
        "agregados": {"URSS15": "Antigua URSS (15 Estados)", "UE27": "Unión Europea (27)", "EUR": "Europa", "EEU": "Europa oriental",
                      "NEU": "Europa del norte", "SEU": "Europa del sur", "WEU": "Europa occidental", "CAS": "Asia central",
                      "NAM": "América del Norte", "DEV": "Regiones desarrolladas", "WLD": "Mundo",
                      **{r["id"]: r["titulo"] for r in catalogo if r["id"] in series}},
        "series": series,
    }, open(os.path.join(SALIDA, "urbanizacion.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

    # ---- peso de las ciudades por tamaño ----
    agr = {}
    for a in leer("agregados.txt"):
        agr.setdefault(a[0], {})[int(a[1])] = [int(x) for x in a[2:]]

    def fila(lista):
        out = {}
        for y in ANIOS_T:
            t = [0, 0, 0, 0, 0]; den = 0
            for iso in lista:
                if iso in agr and y in agr[iso] and iso in pob:
                    t = [u + v for u, v in zip(t, agr[iso][y])]
                if iso in pob:
                    den += pob[iso][y]
            if den:
                out[str(y)] = {"ciudades": round(t[0] / den * 100, 1), "c200": round(t[1] / den * 100, 1),
                               "c1m": round(t[2] / den * 100, 1), "n1m": t[3], "n500": t[4]}
        return out
    tam = {iso: fila([iso]) for iso in agr if iso in pob}
    tam["URSS15"] = fila(URSS)
    tam["UE27"] = fila(UE27)
    for r in catalogo:
        if r.get("disponible") and any(iso in agr for iso in r["paises"]):
            tam[r["id"]] = fila(r["paises"])
    json.dump({
        "fuente": "Naciones Unidas, World Urbanization Prospects 2025 (ciudades según el grado de urbanización) y World Population Prospects 2024",
        "nota": "Porcentaje de la población total que vive en ciudades (centros urbanos de 50.000 hab. o más), en ciudades de 200.000 o más "
                "y en ciudades de un millón o más; número de ciudades de un millón y de medio millón o más.",
        "anios": ANIOS_T, "paises": tam,
    }, open(os.path.join(SALIDA, "tamano.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(len(ciudades), "ciudades;", len(series), "series de urbanización;", len(tam), "países con peso por tamaño")


if __name__ == "__main__":
    main()
