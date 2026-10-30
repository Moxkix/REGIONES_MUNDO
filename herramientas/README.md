# Herramientas de preparación de capas

Requisitos: Python 3 con `numpy`, `scipy`, `shapely`, `rasterio` y `Pillow`, y [mapshaper](https://github.com/mbloch/mapshaper) (`npm install -g mapshaper`).

Los datos de Natural Earth se descargan del repositorio `nvkelso/natural-earth-vector` (carpeta `geojson/`).

## Países del mundo

```
python3 herramientas/paises.py ne_50m_admin_0_countries.geojson p50.geojson
mapshaper p50.geojson -dissolve2 id copy-fields=nombre -simplify 40% keep-shapes \
  -rename-layers paises -o format=topojson quantization=1e5 datos/mundo/paises-50m.json
python3 herramientas/paises.py ne_110m_admin_0_countries.geojson p110.geojson
mapshaper p110.geojson -filter 'id!="ATA"' -dissolve2 id copy-fields=nombre \
  -rename-layers paises -o format=topojson quantization=1e5 datos/mundo/paises-110m.json
mapshaper p50.geojson -dissolve -o tierra50.geojson
```

## Clima de Köppen para una región

El ráster mundial (`kmz_int_reshape.png`, 1986-2010, 100") está dentro del paquete `kgcpy`:

```
pip download kgcpy --no-deps && unzip kgcpy-*.whl
python3 herramientas/koppen_region.py kgcpy/kmz_int_reshape.png koppen.geojson \
  --bbox -32 28 70 76 --factor 4 --suavizado 3
mapshaper koppen.geojson -clip tierra50.geojson -simplify 25% keep-shapes \
  -filter-slivers min-area=30km2 -rename-layers clima \
  -o format=topojson quantization=1e5 regiones/<id>/capas/clima.json
```

Ajustad `--bbox` (oeste sur este norte) a la ventana de la región con algo de margen.

## Capas de Europa

```
python3 herramientas/europa_capas.py ne_10m_geography_regions_polys.geojson carpeta_temporal
mapshaper carpeta_temporal/relieve.geojson -clip tierra50.geojson -simplify 30% keep-shapes \
  -rename-layers relieve -o format=topojson quantization=1e5 regiones/europa/capas/relieve.json
cp carpeta_temporal/puntos.json regiones/europa/capas/
mapshaper ne_50m_rivers_lake_centerlines.geojson -clip bbox=-32,28,70,76 -filter 'featurecla=="River"' \
  -filter-fields name -simplify 40% -rename-layers rios -o format=topojson quantization=1e5 regiones/europa/capas/rios.json
mapshaper ne_50m_lakes.geojson -clip bbox=-32,28,70,76 -filter-fields name \
  -rename-layers lagos -o format=topojson quantization=1e5 regiones/europa/capas/lagos.json
```

`europa_capas.py` contiene la clasificación de las unidades de relieve por orogenia y las listas de ciudades, picos, cuencas sedimentarias y regiones industriales. Para otra región, copiadlo y cambiad las listas.

## Capas de Rusia y los Estados postsoviéticos

`rusia_capas.py` sigue el mismo esquema: clasifica las unidades de relieve en plataforma rusa, llanura de Siberia occidental, depresión aralo-caspiana, escudo siberiano, macizos hercinianos y cordilleras alpinas y recientes, y escribe las ciudades, picos, regiones industriales y yacimientos (petróleo, gas, carbón, metales) en `puntos.json`.

```
python3 herramientas/rusia_capas.py ne_10m_geography_regions_polys.geojson carpeta_temporal
python3 herramientas/koppen_region.py kgcpy/kmz_int_reshape.png koppen_a.geojson --bbox 18 34 180 82 --factor 6 --suavizado 3
python3 herramientas/koppen_region.py kgcpy/kmz_int_reshape.png koppen_b.geojson --bbox -180 60 -168 72 --factor 6 --suavizado 3
```

Los dos recortes de Köppen se unen con mapshaper (`-merge-layers`), se recortan con `tierra50.geojson` y se simplifican al 20 %. El segundo cubre el extremo de Chukotka al otro lado del antimeridiano.

## Energía

Descargad `owid-energy-data.csv` de <https://github.com/owid/energy-data> y ejecutad:

```
python3 herramientas/energia_owid.py owid-energy-data.csv
python3 herramientas/indice_produccion.py
```

Genera la producción mundial de carbón, petróleo, gas y electricidad nuclear, hidráulica, eólica y solar en `datos/produccion/`, y las series de consumo y producción de cada región que tenga `recursos.energia` en su configuración (`regiones/<id>/datos/energia.json`).

## Producción agraria y minera

Los archivos de `datos/produccion/` de origen FAOSTAT y USGS se prepararon a partir de las tablas publicadas (años 1990, 2000, 2010, 2020 y último disponible para FAOSTAT; 2015 y 2025 para el USGS). Formato:

```json
{ "id": "trigo", "nombre": "Trigo", "grupo": "agricultura", "unidad": "t", "unidadCorta": "t",
  "anios": [1990, 2000, 2010, 2020, 2024], "mundo": { "1990": 592000000 },
  "agregados": { "European Union (27)": { "1990": 0 } },
  "paises": { "CHN": { "1990": 0 } }, "estimado": [], "fuente": "", "url": "", "nota": "" }
```

Se incluyen los países con al menos el 0,5 % de la producción mundial en alguno de los años. Tras añadir o actualizar un producto, ejecutad `python3 herramientas/indice_produccion.py`.

Para el capítulo 2 se añadieron girasol, algodón y centeno (FAOSTAT, con 1992 como primer año sin la URSS) y uranio (Asociación Nuclear Mundial), níquel, oro, aluminio y paladio (USGS). Los códigos `SUN` (URSS), `SDN_ANTIGUO` (Sudán anterior a 2011) y `ETP` (Etiopía con Eritrea, hasta 1992) mantienen los países desaparecidos en los primeros años.

## Población (Naciones Unidas, WPP 2024)

Los archivos `.rda` están en la carpeta `data/` del repositorio [PPgp/wpp2024](https://github.com/PPgp/wpp2024):

```
pip install pyreadr pandas
python3 herramientas/poblacion_wpp.py carpeta_wpp ne_50m_admin_0_countries.geojson
```

Genera `datos/poblacion/<ID>.json` (pirámides quinquenales cada cinco años y series anuales de 1950 a 2100), `datos/poblacion/indice.json` y `datos/indicadores/wpp.json`.
