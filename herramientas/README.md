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
