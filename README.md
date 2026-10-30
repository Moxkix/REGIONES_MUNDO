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
| `poblacion.html?r=<id>` | Población y desarrollo: pirámides animadas (1950-2100) con comparación, transición demográfica y explorador de indicadores en dispersión, con trayectorias y mapa mundial |
| `paisajes.html?r=<id>` | Lectura de paisajes como en la PEC: localizar la fotografía en el mapa, identificar el clima (con climograma de referencia) y explicar la vegetación y la actividad económica, con respuesta modelo |

Todo es HTML, CSS y JavaScript sin compilación. D3 y TopoJSON están en `comun/vendor/` y las fuentes tipográficas en `comun/fuentes/`, de modo que el sitio no depende de servicios externos.

## Estructura

```
index.html, region.html, atlas.html, climas.html,
recursos.html, poblacion.html, paisajes.html      páginas genéricas
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
  poblacion/      pirámides y series demográficas de Naciones Unidas por país y agregado
  indicadores/    wpp.json (demografía) y wdi.json (economía, Banco Mundial) para el explorador
  mundo/          países de Natural Earth a 1:50 m y 1:110 m (TopoJSON)
regiones/<id>/
  config.json     proyección, ventana, capas del atlas, estaciones y centros de acción
  capas/          geometrías de la región
  datos/          datos por país, estaciones, actualización frente al manual
  cuestionarios/  preguntas del atlas y de los climogramas
herramientas/     scripts para preparar las capas (ver herramientas/README.md)
```

## Cómo añadir una región

1. En `datos/regiones.json`, cambiad `"disponible"` a `true` y añadid los motores en `"motores"` (`"atlas"`, `"climas"`, `"recursos"`, `"poblacion"`, `"paisajes"`).
2. Cread la carpeta `regiones/<id>/` copiando la estructura de `regiones/europa/`.
3. En `config.json` definid la proyección (`laea`, `conica` o `equalEarth`, con `rotar`) y la ventana geográfica `[oeste, sur, este, norte]`.
4. Generad el clima de Köppen para la ventana con `herramientas/koppen_region.py` y las demás capas que necesitéis.
5. Rellenad `datos/paises.json`, `datos/estaciones.json`, `datos/actualizacion.json` y los cuestionarios.

Algunos detalles opcionales:

- En `datos/paises.json`, `columnas` define las columnas de la tabla de países de la presentación (por defecto, las de Europa).
- En `datos/actualizacion.json`, cada fila puede citar una fuente (`fuente`, `url`) o varias (`fuentes: [{"titulo", "url"}]`).
- En `datos/estaciones.json`, si alguna estación lleva `ordenEjercicio`, el ejercicio de clasificación usa solo esas, en ese orden; las demás quedan para explorar. `nota` explica cualquier particularidad de la serie (periodo distinto, estación sustituta).

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

La sección `recursos` de `config.json` indica qué productos mostrar (`productos`), el agregado regional con el que comparar (`agregado`, por ejemplo la UE-27 o la suma de los países de la región; `nombreCorto` acorta su etiqueta en el gráfico de barras), las afirmaciones del manual que hay que comprobar (`manual`), los países del balance energético (`energia`) y el archivo de indicadores agrarios (`agrario`).

Cada afirmación del manual se comprueba automáticamente con los datos más recientes:

| `tipo` | Qué calcula |
|---|---|
| `cuota` | Porcentaje del agregado regional en el total mundial |
| `posicion` | Puesto del agregado frente al resto de países |
| `ranking` | Primeros productores dentro de una lista de países (o del mundo) |
| `pais` | Puesto y cuota mundial de un país (o de varios: `"pais": ["RUS", "KAZ"]`) |

Los datos de producción son mundiales: al añadir una región nueva normalmente basta con elegir productos ya disponibles. Para añadir un producto, se crea `datos/produccion/<id>.json` con el mismo formato y se ejecuta `herramientas/indice_produccion.py`.

### Población y desarrollo

Los datos demográficos son mundiales (Naciones Unidas, *World Population Prospects 2024*: estimaciones hasta 2023 y variante media de la proyección desde 2024), así que una región nueva solo necesita la sección `poblacion` de su `config.json`:

```json
"poblacion": { "cuestionario": "cuestionarios/poblacion.json", "porDefecto": "ESP",
  "transicionComparar": "NER", "comparadores": ["NGA", "IND", "CHN", "JPN", "USA"],
  "explorador": { "x": "fecundidad", "y": "esperanza_vida", "anio": 2024 } }
```

En el explorador los países de la región se dibujan resaltados y los demás atenuados, con el color de la región del temario a la que pertenecen. Los datos se regeneran con `herramientas/poblacion_wpp.py`.

### Lectura de paisajes

La sección `paisajes` de `config.json` apunta al archivo de paisajes y, si hace falta, a estaciones de referencia propias (las de los climogramas se usan también):

```json
"paisajes": { "archivo": "datos/paisajes.json", "estacionesExtra": "datos/estaciones_paisajes.json" }
```

Cada paisaje lleva el punto y la tolerancia de la localización (`lat`, `lon`, `tolerancia` en km), el tipo de Köppen correcto y tres distractores, la estación de referencia, el texto del clima, «qué mirar en la foto», las preguntas de vegetación y actividad, la respuesta modelo (`modelo.a`, `.b`, `.c`) y enlaces a otros motores.

Para la fotografía basta con el nombre del archivo de Wikimedia Commons: `"foto": {"archivo": "File:Nombre.jpg"}`. La página la carga desde Commons. `herramientas/descargar_fotos.py <region>` completa autor y licencia desde la API de Commons, avisa si las coordenadas de la foto no cuadran con el paisaje y, con `--descargar`, guarda una copia en `regiones/<id>/fotos/`. También se pueden usar fotos propias con `"local": "fotos/archivo.jpg"`, indicando autor y licencia.

### Preguntas

Cada pregunta lleva un bloque que abre la vista que necesita: `mapa` en el atlas y `vista` en los demás motores (por ejemplo `{"pestana": "transicion", "pais": "ESP", "comparar": "NER"}`):

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
- Población: Naciones Unidas, [World Population Prospects 2024](https://population.un.org/wpp/), a partir del paquete de datos [wpp2024](https://github.com/PPgp/wpp2024). Indicadores económicos del explorador: Banco Mundial, *World Development Indicators*.
- Código: licencia MIT. Contenidos: licencia CC BY 4.0. Fuentes tipográficas: SIL Open Font License 1.1.

Preparado por Iñaki Moro Deordal como apoyo a la tutoría. No sustituye al manual ni a las indicaciones del equipo docente.
