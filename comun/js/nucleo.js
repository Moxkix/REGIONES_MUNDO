/* Núcleo común: carga de datos, región activa, cabecera y proyecciones. */
(function () {
  "use strict";

  const BASE = document.documentElement.dataset.base || ".";
  const cache = new Map();

  function url(ruta) {
    return BASE.replace(/\/$/, "") + "/" + ruta.replace(/^\//, "");
  }

  async function json(ruta) {
    if (!cache.has(ruta)) {
      cache.set(ruta, fetch(url(ruta)).then((r) => {
        if (!r.ok) throw new Error("No se ha podido cargar " + ruta + " (" + r.status + ")");
        return r.json();
      }));
    }
    return cache.get(ruta);
  }

  function esc(t) {
    return String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function parametro(nombre) {
    return new URLSearchParams(location.search).get(nombre);
  }

  /* Carga el catálogo y la configuración de la región indicada en ?r= */
  async function region() {
    const catalogo = await json("datos/regiones.json");
    const id = parametro("r") || catalogo.porDefecto;
    const ficha = catalogo.regiones.find((r) => r.id === id);
    if (!ficha) throw new Error("La región «" + id + "» no existe en datos/regiones.json");
    if (!ficha.disponible) throw new Error("La región «" + ficha.titulo + "» todavía no tiene contenidos.");
    let config = await json("regiones/" + id + "/config.json");
    let vista = null;
    if (config.vistas && config.vistas.length) {
      vista = config.vistas.find((v) => v.id === parametro("v")) || config.vistas[0];
      config = conVista(config, vista);
      vistas = { actual: vista, lista: config.vistas, region: id };
    }
    return { catalogo, ficha, config, vista, carpeta: "regiones/" + id + "/" };
  }

  /* Vistas de una región con dos espacios separados (Japón y Australia):
     "vistas": [{ "id", "nombre", "proyeccion", "ventana", "secciones": { "climas": {...} } }]
     Cada vista cambia el encuadre de los mapas y puede sustituir claves de cualquier sección.
     Los elementos con "parte" (capas, estaciones, paisajes, preguntas) solo se muestran en su vista;
     una vista con "todas": true los muestra todos. */
  let vistas = null;
  function conVista(config, v) {
    const c = Object.assign({}, config);
    if (v.proyeccion) c.proyeccion = v.proyeccion;
    if (v.ventana) c.ventana = v.ventana;
    Object.entries(v.secciones || {}).forEach(([k, val]) => { c[k] = Object.assign({}, config[k] || {}, val); });
    return c;
  }
  const enVista = (x) => !vistas || vistas.actual.todas || !x || !x.parte || x.parte === vistas.actual.id;
  const conV = (ruta) => vistas ? ruta + "&v=" + vistas.actual.id : ruta;

  const HERRAMIENTAS = [
    { id: "region", pagina: "region.html", nombre: "Presentación" },
    { id: "atlas", pagina: "atlas.html", nombre: "Atlas de lectura cruzada" },
    { id: "climas", pagina: "climas.html", nombre: "Climogramas" },
    { id: "recursos", pagina: "recursos.html", nombre: "Producciones y recursos" },
    { id: "poblacion", pagina: "poblacion.html", nombre: "Población y desarrollo" },
    { id: "ciudades", pagina: "ciudades.html", nombre: "Ciudades" },
    { id: "paisajes", pagina: "paisajes.html", nombre: "Paisajes" },
  ];

  function cabecera(contenedor, ficha, actual, motores) {
    const disponibles = HERRAMIENTAS.filter((h) => h.id === "region" || (motores || []).includes(h.id));
    contenedor.innerHTML =
      '<a class="marca" href="' + url("index.html") + '">Atlas de los grandes espacios mundiales</a>' +
      (ficha ? '<nav class="ruta" aria-label="Ruta"><span aria-hidden="true">/</span>' +
        '<a href="' + url("region.html?r=" + ficha.id) + '">Cap. ' + ficha.capitulo + ". " + esc(ficha.titulo) + "</a></nav>" : "") +
      (ficha ? '<nav class="herramientas" aria-label="Herramientas de la región">' +
        disponibles.map((h) => '<a href="' + url(conV(h.pagina + "?r=" + ficha.id)) + '"' +
          (h.id === actual ? ' aria-current="page"' : "") + ">" + h.nombre + "</a>").join("") + "</nav>" : "") +
      (ficha && vistas && actual !== "region" ? '<nav class="vistas" aria-label="Espacio que se muestra">' +
        vistas.lista.map((v) => '<a href="' + url(location.pathname.split("/").pop() + "?r=" + ficha.id + "&v=" + v.id) + '"' +
          (v.id === vistas.actual.id ? ' aria-current="true"' : "") + ">" + esc(v.nombre) + "</a>").join("") + "</nav>" : "");
    const nv = contenedor.querySelector("nav.vistas");
    if (nv) nv.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => { a.href += location.hash; }));
  }

  function error(contenedor, e) {
    console.error(e);
    contenedor.innerHTML = '<div class="contenido"><h1>No se puede mostrar esta página</h1><p>' + esc(e.message) +
      '</p><p><a href="' + url("index.html") + '">Volver a la portada</a></p></div>';
  }

  /* Proyección definida en la configuración de cada región.
     tipo: "laea" (acimutal equivalente de Lambert), "conica" (cónica equivalente de Albers),
           "equalEarth". rotar/paralelos como en d3. */
  function proyeccion(def) {
    let p;
    switch (def.tipo) {
      case "laea": p = d3.geoAzimuthalEqualArea(); break;
      case "conica": p = d3.geoConicEqualArea().parallels(def.paralelos || [30, 60]); break;
      case "equalEarth": p = d3.geoEqualEarth(); break;
      default: p = d3.geoEqualEarth();
    }
    if (def.rotar) p.rotate(def.rotar);
    return p;
  }

  /* Polígono de la ventana geográfica (o, s, e, n) densificado para ajustar la proyección */
  function ventana(ext) {
    const [o, s, e, n] = ext;
    const pts = [];
    for (let x = o; x <= e; x += 1) pts.push([x, s]);
    for (let y = s; y <= n; y += 1) pts.push([e, y]);
    for (let x = e; x >= o; x -= 1) pts.push([x, n]);
    for (let y = n; y >= s; y -= 1) pts.push([o, y]);
    return { type: "MultiPoint", coordinates: pts };
  }

  /* Almacenamiento local tolerante a fallos (modo privado, bloqueos) */
  const memoria = {
    leer(clave, defecto) {
      try { const v = localStorage.getItem("rm:" + clave); return v ? JSON.parse(v) : defecto; }
      catch (e) { return defecto; }
    },
    guardar(clave, valor) {
      try { localStorage.setItem("rm:" + clave, JSON.stringify(valor)); } catch (e) { /* sin almacenamiento */ }
    },
  };

  function formato(n, dec) {
    if (n == null || isNaN(n)) return "—";
    return Number(n).toLocaleString("es-ES", { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 });
  }

  /* Ficha flotante común a los mapas */
  function fichaFlotante() {
    let el = document.querySelector(".ficha");
    if (!el) { el = document.createElement("div"); el.className = "ficha"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    return {
      mostrar(html, ev) {
        el.innerHTML = html; el.style.display = "block";
        const r = el.getBoundingClientRect();
        let x = ev.clientX + 14, y = ev.clientY + 14;
        if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 14;
        if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - 14;
        el.style.left = Math.max(8, x) + "px"; el.style.top = Math.max(8, y) + "px";
      },
      ocultar() { el.style.display = "none"; },
    };
  }

  window.RM = { url, json, esc, parametro, region, cabecera, error, proyeccion, ventana, memoria, formato, fichaFlotante, enVista,
    get vista() { return vistas ? vistas.actual : null; } };
})();
