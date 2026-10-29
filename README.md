# Atlas de los grandes espacios mundiales

Recursos interactivos para la tutoría de **Geografía de los grandes espacios mundiales** (Grado en Geografía e Historia, UNED). Cada región sigue un capítulo del manual *Grandes regiones de la Tierra* y compara sus cifras con los datos más recientes.

Sitio publicado: <https://moxkix.github.io/REGIONES_MUNDO/>

## Qué contiene

| Página | Qué hace |
|---|---|
| `index.html` | Portada con el mapamundi de las siete regiones del temario |
| `region.html?r=<id>` | Presentación de la región, tabla «el manual y la actualidad» y datos por país |
| `atlas.html?r=<id>` | Atlas de lectura cruzada: capas superpuestas o enfrentadas con cortinilla y preguntas guiadas |
| `climas.html?r=<id>` | Climogramas, clasificación de Köppen paso a paso, centros de acción y ejercicio de clasificación |
| `recursos.html?r=<id>` | Producciones y recursos: cuotas de producción mundial (agricultura, energía y minería), balance energético por país, indicadores agrarios y afirmaciones del manual comprobadas |

Todo es HTML, CSS y JavaScript sin compilación. D3 y TopoJSON están en `comun/vendor/` y las fuentes tipográficas en `comun/fuentes/`, de modo que el sitio no depende de servicios externos.

## Estructura

```
index.html, region.html, atlas.html, climas.html   páginas genéricas
comun/
  css/        estilos comunes y de cada motor
  js/         nucleo.js (carga y utilidades), mapa.js, cuestionario.js,
              atlas.js, climas.js, climograma.js, koppen.js
  vendor/     d3 v7, topojson-client
  fuentes/    Source Serif 4 e IBM Plex Sans (licencia SIL OFL)
datos/
  regiones.json   catálogo de regiones (capítulo, países, estado, motores)
  koppen.json     colores y nombres de los tipos de Köppen
  produccion/     producción mundial por país de 25 productos (compartida por todas las regiones)
                  e indice.json con los disponibles
  mundo/          países de Natural Earth a 1:50 m y 1:110 m (TopoJSON)
regiones/<id>/
  config.json     proyección, ventana, capas del atlas, estaciones y centros de acción
  capas/          geometrías de la región
  datos/          datos por país, estaciones, actualización frente al manual
  cuestionarios/  preguntas del atlas y de los climogramas
herramientas/     scripts para preparar las capas (ver herramientas/README.md)
```

## Cómo añadir una región

1. En `datos/regiones.json`, cambiad `"disponible"` a `true` y añadid los motores en `"motores"` (`"atlas"`, `"climas"`, `"recursos"`).
2. Cread la carpeta `regiones/<id>/` copiando la estructura de `regiones/europa/`.
3. En `config.json` definid la proyección (`laea`, `conica` o `equalEarth`, con `rotar`) y la ventana geográfica `[oeste, sur, este, norte]`.
4. Generad el clima de Köppen para la ventana con `herramientas/koppen_region.py` y las demás capas que necesitéis.
5. Rellenad `datos/paises.json`, `datos/estaciones.json`, `datos/actualizacion.json` y los cuestionarios.

Los motores leen todo de la configuración: no hay que tocar el código.

### Tipos de capa del atlas

| `tipo` | Datos | Uso |
|---|---|---|
| `poligonos` | TopoJSON con un campo de categoría | relieve, regiones agrarias, unidades naturales |
| `koppen` | TopoJSON con el campo `k` | clima |
| `coropleta` | `datos/paises.json` y un campo numérico | densidad, envejecimiento, renta |
| `categorias` | asignación país → categoría | situación política, bloques |
| `puntos` | lista de puntos con categoría | regiones industriales, yacimientos, puertos |

### Producciones y recursos

La sección `recursos` de `config.json` indica qué productos mostrar (`productos`), el agregado regional con el que comparar (`agregado`, por ejemplo la UE-27 o la suma de los países de la región), las afirmaciones del manual que hay que comprobar (`manual`), los países del balance energético (`energia`) y el archivo de indicadores agrarios (`agrario`).

Cada afirmación del manual se comprueba automáticamente con los datos más recientes:

| `tipo` | Qué calcula |
|---|---|
| `cuota` | Porcentaje del agregado regional en el total mundial |
| `posicion` | Puesto del agregado frente al resto de países |
| `ranking` | Primeros productores dentro de una lista de países (o del mundo) |
| `pais` | Cuota mundial de un país |

Los datos de producción son mundiales: al añadir una región nueva normalmente basta con elegir productos ya disponibles. Para añadir un producto, se crea `datos/produccion/<id>.json` con el mismo formato y se ejecuta `herramientas/indice_produccion.py`.

### Preguntas

Cada pregunta lleva un bloque `mapa` que activa las capas que necesita:

```json
{ "id": "relieve-clima", "mapa": { "modo": "comparar", "izq": "relieve", "der": "clima" },
  "enunciado": "…", "opciones": [{ "t": "…", "ok": true, "r": "retroalimentación" }],
  "explicacion": ["párrafo", "párrafo"], "manual": "Apartado 1.2.1" }
```

## Probar en local

```
python3 -m http.server 8000
```

y abrid <http://localhost:8000/>. Abrir los archivos con doble clic no funciona porque el navegador bloquea la carga de los JSON.

## Publicar en GitHub Pages

En *Settings → Pages* del repositorio, elegid *Deploy from a branch*, rama `main` y carpeta `/ (root)`.

## Fuentes y licencias

- Cartografía base: [Natural Earth](https://www.naturalearthdata.com/), dominio público.
- Clima: clasificación de Köppen-Geiger 1986-2010 de Rubel, F., Brugger, K., Haslinger, K. y Auer, I. (2017), *Meteorologische Zeitschrift* 26, 115-125, en la versión ráster del paquete [kgcpy](https://github.com/cwru-sdle/kgcpy) (BSD-3).
- Datos estadísticos: Eurostat, Naciones Unidas y servicios meteorológicos nacionales; cada archivo indica su fuente y año.
- Producción agraria: FAOSTAT (QCL), a través de Our World in Data. Minería: U.S. Geological Survey, *Mineral Commodity Summaries* 2016 y 2026. Energía: Energy Institute (*Statistical Review of World Energy*) y Ember, a través del repositorio [owid/energy-data](https://github.com/owid/energy-data) (CC BY 4.0). Indicadores agrarios: Banco Mundial (WDI).
- Código: licencia MIT. Contenidos: licencia CC BY 4.0. Fuentes tipográficas: SIL Open Font License 1.1.

Preparado por Iñaki Moro Deordal como apoyo a la tutoría. No sustituye al manual ni a las indicaciones del equipo docente.
