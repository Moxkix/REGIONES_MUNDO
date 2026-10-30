/* Motor «Climogramas»: explorar estaciones, dinámica atmosférica, clasificar y preguntas.
   Lee la sección "climas" de regiones/<id>/config.json. */
(async function () {
  "use strict";
  const barra = document.getElementById("barra");
  const main = document.getElementById("climas");
  let R;
  try { R = await RM.region(); } catch (e) { RM.cabecera(barra); RM.error(main, e); return; }
  RM.cabecera(barra, R.ficha, "climas", R.ficha.motores);
  document.title = "Climogramas. " + R.ficha.titulo;
  const C = R.config.climas;
  const carpeta = (r) => R.carpeta + r;

  try {
    const capaK = (R.config.atlas && R.config.atlas.capas || []).find((c) => c.tipo === "koppen");
    const [mundo, koppen, datos, topoK, preguntas] = await Promise.all([
      RM.json("datos/mundo/paises-50m.json"), RM.json("datos/koppen.json"), RM.json(carpeta(C.estaciones)),
      capaK ? RM.json(carpeta(capaK.archivo)) : Promise.resolve(null),
      C.cuestionario ? RM.json(carpeta(C.cuestionario)).catch(() => null) : Promise.resolve(null),
    ]);
    const est = datos.estaciones.map((e) => Object.assign(e, { k: RM.koppen(e.t, e.p, e.lat) }));
    const porId = new Map(est.map((e) => [e.id, e]));
    const dominios = new Map(C.dominios.map((d) => [d.id, d]));
    const colorK = (c) => (koppen.tipos[c] || {}).color || "#ccc";
    const nombreK = (c) => (koppen.tipos[c] || {}).nombre || "";
    const f1 = (n) => RM.formato(n, 1), f0 = (n) => RM.formato(n, 0);
    const MES = RM.MESES;

    // ---------- Pestañas ----------
    const tabs = ["explorar", "dinamica", "clasificar", "preguntas"];
    function abrir(id) {
      tabs.forEach((t) => {
        document.getElementById("t-" + t).setAttribute("aria-selected", t === id ? "true" : "false");
        document.getElementById("s-" + t).hidden = t !== id;
      });
      history.replaceState(null, "", "#" + id);
    }
    tabs.forEach((t) => document.getElementById("t-" + t).addEventListener("click", () => abrir(t)));
    if (tabs.includes(location.hash.slice(1))) abrir(location.hash.slice(1));
    if (!preguntas) document.getElementById("t-preguntas").hidden = true;

    // ---------- Explorar ----------
    const mapa = new RM.Mapa(document.getElementById("mapa-estaciones"), R.config, mundo, { ancho: 700 });
    const gK = mapa.capa("koppen");
    if (topoK) {
      gK.selectAll("path").data(topojson.feature(topoK, topoK.objects[capaK.objeto]).features).join("path")
        .attr("class", "poligono").attr("d", mapa.ruta).attr("fill", (f) => colorK(f.properties[capaK.campo])).attr("opacity", 0.5);
    } else document.querySelector(".conmutador").hidden = true;
    mapa.fronteras(mapa.capa("fronteras"));
    const gE = mapa.capa("estaciones");
    let actual = RM.memoria.leer("climas:" + R.ficha.id + ":actual", est[0].id);
    if (!porId.has(actual)) actual = est[0].id;
    let comparada = null;

    const puntos = gE.selectAll("g").data(est).join("g").attr("transform", (d) => "translate(" + mapa.proy([d.lon, d.lat]) + ")");
    puntos.append("circle").attr("class", "estacion").attr("r", 7).attr("fill", (d) => colorK(d.k.codigo))
      .on("click", (ev, d) => seleccionar(d.id));
    puntos.append("text").attr("class", "etiqueta").attr("x", 10).attr("y", 5).attr("font-size", 15).text((d) => d.nombreCorto || d.nombre);
    puntos.append("title").text((d) => d.nombre + " (" + d.k.codigo + ")");
    document.getElementById("ver-koppen").addEventListener("change", (ev) => gK.style("display", ev.target.checked ? null : "none"));

    const lista = document.getElementById("lista-estaciones");
    lista.innerHTML = est.map((e) => '<button type="button" role="option" data-id="' + e.id + '"><span class="k" style="background:' + colorK(e.k.codigo) +
      '"></span>' + RM.esc(e.nombreCorto || e.nombre) + "</button>").join("");
    lista.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => seleccionar(b.dataset.id)));

    function seleccionar(id) {
      actual = id; if (comparada === id) comparada = null;
      RM.memoria.guardar("climas:" + R.ficha.id + ":actual", id);
      pintarFicha();
    }

    // Tipo de Köppen del mapa en el punto de la estación (para comparar con el calculado)
    const featsK = topoK ? topojson.feature(topoK, topoK.objects[capaK.objeto]).features : [];
    const kMapa = (e) => { const f = featsK.find((x) => d3.geoContains(x, [e.lon, e.lat])); return f ? f.properties[capaK.campo] : null; };

    function pintarFicha() {
      const e = porId.get(actual), I = e.k.ind;
      puntos.select("circle").classed("activa", (d) => d.id === actual).classed("comparada", (d) => d.id === comparada);
      lista.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", b.dataset.id === actual ? "true" : "false"));
      const secos = I.mesesSecos.map((i) => MES[i]);
      const estLluvia = (() => {
        const v = I.Pverano / I.Pann;
        return v >= 0.6 ? "en el semestre cálido" : v <= 0.4 ? "en el semestre frío" : "repartidas a lo largo del año";
      })();
      const km = kMapa(e);
      const dom = (e.dominio || []).map((d) => dominios.get(d)).filter(Boolean);
      const el = document.getElementById("ficha-estacion");
      el.innerHTML =
        "<h2>" + RM.esc(e.nombre) + '</h2><p class="meta">' + RM.esc(e.pais) + ". " + f1(Math.abs(e.lat)) + "° " + (e.lat >= 0 ? "N" : "S") + ", " +
        f1(Math.abs(e.lon)) + "° " + (e.lon >= 0 ? "E" : "O") + ". " + f0(e.altitud) + " m. Normales " + RM.esc(e.periodo) + ".</p>" +
        '<div class="comparar-con"><label for="comparar">Comparar con</label><select id="comparar"><option value="">Ninguna estación</option>' +
        est.filter((x) => x.id !== e.id).map((x) => '<option value="' + x.id + '"' + (x.id === comparada ? " selected" : "") + ">" + RM.esc(x.nombre) + "</option>").join("") +
        "</select></div>" +
        '<svg id="climograma" role="img" aria-label="Climograma de ' + RM.esc(e.nombre) + '"></svg>' +
        '<div class="leyenda-clim"><span class="l-p">Precipitación (mm)</span><span class="l-t">Temperatura media (°C)</span><span class="l-s">Mes seco (P &lt; 2T)</span>' +
        ((e.p.some((x) => x > 100) || (comparada && porId.get(comparada).p.some((x) => x > 100))) ? '<span class="l-a">Más de 100 mm (escala reducida a 1/10)</span>' : "") +
        (comparada ? '<span class="l-c">' + RM.esc(porId.get(comparada).nombre) + "</span>" : "") + "</div>" +
        '<dl class="indicadores">' +
        "<div><dt>Temperatura media anual</dt><dd>" + f1(I.Tann) + " °C</dd></div>" +
        "<div><dt>Amplitud térmica anual</dt><dd>" + f1(I.amplitud) + " °C</dd></div>" +
        "<div><dt>Mes más frío y más cálido</dt><dd>" + f1(I.Tmin) + " / " + f1(I.Tmax) + " °C</dd></div>" +
        "<div><dt>Precipitación anual</dt><dd>" + f0(I.Pann) + " mm</dd></div>" +
        "<div><dt>Meses secos (P &lt; 2T)</dt><dd>" + (secos.length ? secos.length + " <small>(" + secos.join(", ") + ")</small>" : "Ninguno") + "</dd></div>" +
        "<div><dt>Lluvias</dt><dd><small>" + estLluvia + ", máximo en " + MES[I.mesMaxP] + "</small></dd></div>" +
        "</dl>" +
        "<h3>Clasificación de Köppen paso a paso</h3>" +
        '<div class="codigo-koppen"><span class="c" style="background:' + colorK(e.k.codigo) + '">' + e.k.codigo + '</span><span class="n">' + RM.esc(nombreK(e.k.codigo)) + "</span></div>" +
        '<ol class="pasos">' + e.k.pasos.map((p) => "<li>" + RM.esc(p.texto) + (p.resultado ? '<span class="r">' + p.resultado + "</span>" : "") + "</li>").join("") + "</ol>" +
        (km ? '<p class="mapa-coincide">El mapa de Köppen 1986-2010 asigna a esta zona el tipo <b>' + km + "</b>" +
          (km === e.k.codigo ? ", el mismo que se obtiene con las normales 1991-2020." : ". La diferencia se debe al periodo (1991-2020 frente a 1986-2010), a la resolución del mapa (unos 11 km) o a que la estación está cerca de un límite entre tipos.") + "</p>" : "") +
        (e.comentario ? '<div class="comentario"><p>' + (dom.length ? "<b>Dominio según el manual: " + dom.map((d) => RM.esc(d.nombre.toLowerCase())).join(" o ") + ".</b> " : "") +
          RM.esc(e.comentario) + "</p></div>" : "") +
        '<p class="nota">Datos: ' + (e.url ? '<a href="' + RM.esc(e.url) + '">' + RM.esc(e.fuente) + "</a>" : RM.esc(e.fuente)) + (e.nota ? ". " + RM.esc(e.nota) : "") + "</p>";
      RM.climograma(document.getElementById("climograma"), e, { comparar: comparada ? porId.get(comparada) : null });
      document.getElementById("comparar").addEventListener("change", (ev) => { comparada = ev.target.value || null; pintarFicha(); });
    }
    pintarFicha();

    // ---------- Dinámica atmosférica ----------
    if (C.centros) {
      const m2 = new RM.Mapa(document.getElementById("mapa-centros"), R.config, mundo, { ancho: 700 });
      m2.fronteras(m2.capa("fronteras"));
      m2.defs.append("marker").attr("id", "flecha").attr("viewBox", "0 0 10 10").attr("refX", 6).attr("refY", 5)
        .attr("markerWidth", 7).attr("markerHeight", 7).attr("orient", "auto-start-reverse")
        .append("path").attr("d", "M0,0L10,5L0,10z").attr("fill", "#1d2a30");
      const gC = m2.capa("centros");
      const claves = Object.keys(C.centros.estaciones);
      let temporada = claves[0];
      const fs = document.getElementById("estacion-anio");
      fs.innerHTML += claves.map((k) => '<label><input type="radio" name="temporada" value="' + k + '"' + (k === temporada ? " checked" : "") + ">" +
        RM.esc(C.centros.estaciones[k].nombre) + "</label>").join("");
      fs.querySelectorAll("input").forEach((i) => i.addEventListener("change", () => { temporada = i.value; pintarCentros(); }));
      function pintarCentros() {
        const S = C.centros.estaciones[temporada];
        gC.selectAll("*").remove();
        S.flujos.forEach((f) => gC.append("path").attr("class", "flujo").attr("d", m2.ruta({ type: "LineString", coordinates: f.coords })));
        const g = gC.selectAll("g.centro").data(S.centros).join("g").attr("class", (d) => "centro " + d.tipo)
          .attr("transform", (d) => "translate(" + m2.proy([d.lon, d.lat]) + ")");
        [70, 48].forEach((r) => g.append("circle").attr("class", (d) => "halo " + d.tipo).attr("r", r).attr("stroke-width", 2).style("fill", "none"));
        g.append("circle").attr("r", 17);
        g.append("text").attr("class", "letra").attr("text-anchor", "middle").attr("dy", "0.36em").text((d) => d.tipo);
        g.append("text").attr("class", "nombre").attr("text-anchor", "middle").attr("y", 34).text((d) => d.nombre);
        document.getElementById("texto-centros").innerHTML =
          "<h2>" + RM.esc(S.nombre) + "</h2>" + S.texto.map((t) => "<p>" + RM.esc(t) + "</p>").join("") +
          '<p class="nota">A: anticiclón (altas presiones). B: borrasca o baja presión. ' + RM.esc(C.centros.fuente) + "</p>";
      }
      pintarCentros();
    } else document.getElementById("t-dinamica").hidden = true;

    // ---------- Clasificar ----------
    const claveC = "climas:" + R.ficha.id + ":clasificar";
    let elecciones = RM.memoria.leer(claveC, {});
    const tarjetas = document.getElementById("tarjetas");
    // si algunas estaciones llevan ordenEjercicio, el ejercicio usa solo esas
    const enEjercicio = est.some((e) => e.ordenEjercicio != null) ? est.filter((e) => e.ordenEjercicio != null) : est;
    const orden = enEjercicio.slice().sort((a, b) => (a.ordenEjercicio || 0) - (b.ordenEjercicio || 0) || a.id.localeCompare(b.id));
    function pintarTarjetas(corregir, solucion) {
      tarjetas.innerHTML = orden.map((e) => {
        const sel = elecciones[e.id] || "";
        const ok = (e.dominio || []).includes(sel);
        const cls = corregir && sel ? (ok ? " bien" : " mal") : "";
        return '<article class="tarjeta' + cls + '"><h3>' + RM.esc(e.nombre) + '</h3><p class="meta">' + RM.esc(e.pais) + ", " + f0(e.altitud) + " m</p>" +
          '<svg class="mini" data-id="' + e.id + '" role="img" aria-label="Climograma de ' + RM.esc(e.nombre) + '"></svg>' +
          '<label class="oculto" for="d-' + e.id + '">Dominio de ' + RM.esc(e.nombre) + "</label>" +
          '<select id="d-' + e.id + '" data-id="' + e.id + '"><option value="">Elegid el dominio</option>' +
          C.dominios.map((d) => '<option value="' + d.id + '"' + (d.id === sel ? " selected" : "") + ">" + RM.esc(d.nombre) + "</option>").join("") + "</select>" +
          ((corregir && sel) || solucion ? '<div class="retro">' + (sel && corregir ? (ok ? '<b class="bien">Correcto.</b> ' : '<b class="mal">No es ese.</b> ') : "") +
            "Dominio: " + (e.dominio || []).map((d) => RM.esc(dominios.get(d).nombre.toLowerCase())).join(" o ") + ". Köppen " + e.k.codigo + ". " +
            explicar(e) + "</div>" : "") + "</article>";
      }).join("");
      tarjetas.querySelectorAll("svg.mini").forEach((s) => RM.climograma(s, porId.get(s.dataset.id), { mini: true }));
      tarjetas.querySelectorAll("select").forEach((s) => s.addEventListener("change", () => {
        elecciones[s.dataset.id] = s.value; RM.memoria.guardar(claveC, elecciones);
      }));
      const n = orden.filter((e) => elecciones[e.id]).length;
      const bien = orden.filter((e) => (e.dominio || []).includes(elecciones[e.id])).length;
      document.getElementById("marcador").textContent = corregir ? bien + " de " + orden.length + " correctas (" + n + " respondidas)" : "";
    }
    function explicar(e) {
      const I = e.k.ind;
      return "Amplitud de " + f1(I.amplitud) + " °C, " + (I.mesesSecos.length ? I.mesesSecos.length + " meses secos" : "ningún mes seco") +
        ", " + f0(I.Pann) + " mm con el máximo en " + MES[I.mesMaxP] + ". " + (e.claveEjercicio || "");
    }
    document.getElementById("comprobar").addEventListener("click", () => pintarTarjetas(true, false));
    document.getElementById("soluciones").addEventListener("click", () => pintarTarjetas(true, true));
    document.getElementById("reiniciar").addEventListener("click", () => { elecciones = {}; RM.memoria.guardar(claveC, elecciones); pintarTarjetas(false, false); });
    pintarTarjetas(false, false);

    // ---------- Preguntas ----------
    if (preguntas) {
      new RM.Cuestionario(document.getElementById("cuestionario"), preguntas.preguntas, { clave: "climas:" + R.ficha.id });
    }
  } catch (e) {
    RM.error(main, e);
  }
})();
