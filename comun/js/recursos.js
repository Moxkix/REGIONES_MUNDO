/* Motor «Producciones y recursos»: producción mundial, balance energético y sector agrario.
   Lee la sección "recursos" de regiones/<id>/config.json.
   Los datos de producción son mundiales y compartidos (datos/produccion/<producto>.json). */
(async function () {
  "use strict";
  const barra = document.getElementById("barra");
  const main = document.getElementById("recursos");
  let R;
  try { R = await RM.region(); } catch (e) { RM.cabecera(barra); RM.error(main, e); return; }
  RM.cabecera(barra, R.ficha, "recursos", R.ficha.motores);
  document.title = "Producciones y recursos. " + R.ficha.titulo;
  const C = R.config.recursos;
  const carpeta = (r) => R.carpeta + r;

  const GRUPOS = { agricultura: "Agricultura y ganadería", energia: "Energía", mineria: "Minería" };
  const AGR = {
    "World": "Mundo", "European Union (27)": "Unión Europea (27)", "Europe": "Europa", "Africa": "África", "Asia": "Asia",
    "North America": "América del Norte, Central y Caribe", "Northern America": "América del Norte", "South America": "América del Sur",
    "Central America": "América Central", "Oceania": "Oceanía", "Eastern Asia": "Asia oriental", "Southern Asia": "Asia meridional",
    "South-eastern Asia": "Sudeste asiático", "Western Asia": "Asia occidental",
  };
  const ANTIGUOS = { SUN: "URSS", YUG: "Yugoslavia", CSK: "Checoslovaquia", UE27: "Unión Europea (27)", MUNDO: "Mundo", EUU: "Unión Europea", WLD: "Mundo" };
  const PALETA = ["#2f5d8a", "#c9973f", "#3f8f86", "#8a6aa8", "#b5533c", "#6f9a4a"];
  const f1 = (n) => RM.formato(n, 1), f0 = (n) => RM.formato(n, 0);

  try {
    const [mundo, preguntas] = await Promise.all([
      RM.json("datos/mundo/paises-50m.json"),
      C.cuestionario ? RM.json(carpeta(C.cuestionario)).catch(() => null) : Promise.resolve(null),
    ]);
    const paisesGeo = topojson.feature(mundo, mundo.objects.paises).features;
    const NOMBRE = new Map(paisesGeo.map((f) => [f.properties.id, f.properties.nombre]));
    const nombre = (id) => ANTIGUOS[id] || NOMBRE.get(id) || id;
    const regionPaises = new Set(R.ficha.paises);
    const agr = C.agregado || null;

    // ---------- Pestañas ----------
    const tabs = ["produccion", "energia", "agrario", "preguntas"];
    function abrir(id) {
      tabs.forEach((t) => {
        document.getElementById("t-" + t).setAttribute("aria-selected", t === id ? "true" : "false");
        document.getElementById("s-" + t).hidden = t !== id;
      });
      history.replaceState(null, "", "#" + id);
    }
    tabs.forEach((t) => document.getElementById("t-" + t).addEventListener("click", () => abrir(t)));

    // =====================================================================
    // Producción mundial
    // =====================================================================
    const indice = await RM.json("datos/produccion/indice.json").catch(() => ({ productos: [] }));
    const disponibles = new Set(indice.productos.map((p) => p.id));
    const prods = (await Promise.all((C.productos || []).filter((id) => disponibles.has(id)).map((id) =>
      RM.json("datos/produccion/" + id + ".json").catch(() => null)))).filter(Boolean);
    const estadoP = { producto: prods.length ? prods[0].id : null, anio: null };
    const proyP = d3.geoEqualEarth().rotate([-10, 0]);
    const WM = 900, HM = 440;
    proyP.fitExtent([[4, 4], [WM - 4, HM - 4]], { type: "Sphere" });
    const rutaP = d3.geoPath(proyP);
    const svgM = d3.select("#mapa-produccion").attr("viewBox", [0, 0, WM, HM]);
    svgM.append("path").attr("d", rutaP({ type: "Sphere" })).attr("fill", "var(--mar)");
    const gPaises = svgM.append("g");
    const ficha = RM.fichaFlotante();
    const CORTES = [0.5, 2, 5, 10, 20];
    const COLORES = ["#e8eee9", "#c6dccf", "#8fbfa8", "#4f9a84", "#2a6f63", "#123f3c"];
    const colorCuota = (c) => c == null ? "#f1f2ee" : COLORES[d3.bisectRight(CORTES, c)];

    function formatoValor(v, unidad, corta) {
      if (v == null) return "—";
      if (unidad === "t") {
        if (v >= 1e6) return f1(v / 1e6) + " Mt";
        if (v >= 1e3) return f0(v / 1e3) + " kt";
        return f0(v) + " t";
      }
      return RM.formato(v, v < 100 ? 1 : 0) + " " + (corta || unidad);
    }
    const producto = () => prods.find((p) => p.id === estadoP.producto);
    const cuota = (p, id, a) => {
      const v = p.paises[id] ? p.paises[id][a] : null;
      return v != null && p.mundo[a] ? (v / p.mundo[a]) * 100 : null;
    };
    function valorAgregado(p, a) {
      if (!agr) return null;
      if (p.agregados && p.agregados[agr.clave] && p.agregados[agr.clave][a] != null) return { v: p.agregados[agr.clave][a], aprox: false };
      const lista = agr.paises || [];
      const vals = lista.map((id) => p.paises[id] ? p.paises[id][a] : null).filter((x) => x != null);
      return vals.length ? { v: d3.sum(vals), aprox: true } : null;
    }

    function pintarSelectorProductos() {
      const el = document.getElementById("productos");
      el.innerHTML = Object.entries(GRUPOS).map(([g, t]) => {
        const ps = prods.filter((p) => p.grupo === g);
        return ps.length ? '<div class="grupo"><span>' + t + "</span>" + ps.map((p) => '<button type="button" data-p="' + p.id + '" aria-pressed="' +
          (p.id === estadoP.producto) + '">' + RM.esc(p.nombre) + "</button>").join("") + "</div>" : "";
      }).join("");
      el.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { estadoP.producto = b.dataset.p; estadoP.anio = null; pintarProduccion(); }));
    }

    function pintarProduccion() {
      const p = producto();
      if (!p) { document.getElementById("s-produccion").innerHTML = '<p class="guia">Todavía no hay datos de producción para esta región.</p>'; return; }
      pintarSelectorProductos();
      const anios = p.anios.map(String);
      if (!anios.includes(estadoP.anio)) estadoP.anio = anios[anios.length - 1];
      const a = estadoP.anio;
      const est = (p.estimado || []).map(String);
      document.getElementById("titulo-producto").innerHTML = RM.esc(p.nombre) + "<small>" + formatoValor(p.mundo[a], p.unidad, p.unidadCorta) + " en el mundo (" + a + (est.includes(a) ? ", estimación" : "") + ")</small>";
      document.getElementById("anios").innerHTML = anios.map((y) => '<button type="button" data-a="' + y + '" aria-pressed="' + (y === a) + '">' + y + (est.includes(y) ? "*" : "") + "</button>").join("");
      document.querySelectorAll("#anios button").forEach((b) => b.addEventListener("click", () => { estadoP.anio = b.dataset.a; pintarProduccion(); }));

      // Mapa
      gPaises.selectAll("path").data(paisesGeo).join("path").attr("d", rutaP)
        .attr("class", (f) => "pais-p" + (regionPaises.has(f.properties.id) ? " region" : ""))
        .attr("fill", (f) => colorCuota(cuota(p, f.properties.id, a) ?? (p.mundo[a] ? 0 : null)))
        .on("mousemove", (ev, f) => {
          const c = cuota(p, f.properties.id, a);
          const v = p.paises[f.properties.id] ? p.paises[f.properties.id][a] : null;
          ficha.mostrar("<strong>" + RM.esc(f.properties.nombre) + "</strong>" + (c != null
            ? formatoValor(v, p.unidad, p.unidadCorta) + "<br>" + f1(c) + " % del total mundial (" + a + ")"
            : "Menos del 0,5 % de la producción mundial o sin datos"), ev);
        }).on("mouseleave", () => ficha.ocultar());
      document.getElementById("leyenda-produccion").innerHTML = ["Menos del 0,5 % o sin datos"].concat(CORTES.map((c, i) =>
        i === CORTES.length - 1 ? "20 % o más" : RM.formato(c, 1) + " a " + RM.formato(CORTES[i + 1], 0) + " %"))
        .map((t, i) => '<span><i style="background:' + COLORES[i] + '"></i>' + t + "</span>").join("") +
        '<span><i style="background:transparent;border:1.5px solid var(--tinta)"></i>Países de la región</span>';

      // Ranking
      const filas = Object.keys(p.paises).map((id) => ({ id, v: p.paises[id][a], c: cuota(p, id, a) }))
        .filter((d) => d.c != null && d.c > 0).sort((x, y) => y.c - x.c).slice(0, 12);
      const ag = valorAgregado(p, a);
      if (ag) filas.push({ id: "AGR", v: ag.v, c: (ag.v / p.mundo[a]) * 100, agregado: true, aprox: ag.aprox });
      const W = 420, fila = 24, H = filas.length * fila + 10, izq = 150;
      const x = d3.scaleLinear().domain([0, d3.max(filas, (d) => d.c) || 1]).range([izq, W - 60]);
      const svgR = d3.select("#ranking").attr("viewBox", [0, 0, W, H]);
      svgR.selectAll("*").remove();
      const g = svgR.selectAll("g").data(filas).join("g").attr("transform", (d, i) => "translate(0," + (i * fila + (d.agregado ? 8 : 0)) + ")");
      g.append("text").attr("class", (d) => "rot" + (regionPaises.has(d.id) || d.agregado ? " region" : "")).attr("x", izq - 6).attr("y", 15).attr("text-anchor", "end")
        .text((d) => d.agregado ? (agr.nombre + (d.aprox ? " (aprox.)" : "")) : nombre(d.id));
      g.append("rect").attr("class", (d) => "barra-r" + (d.agregado ? " agregado" : regionPaises.has(d.id) ? " region" : ""))
        .attr("x", izq).attr("y", 4).attr("height", 15).attr("width", (d) => Math.max(1, x(d.c) - izq));
      g.append("text").attr("class", "rot valor").attr("x", (d) => x(d.c) + 5).attr("y", 15).text((d) => f1(d.c) + " %");
      g.append("title").text((d) => (d.agregado ? agr.nombre : nombre(d.id)) + ": " + formatoValor(d.v, p.unidad, p.unidadCorta));

      // Evolución
      const ult = anios[anios.length - 1];
      const top = Object.keys(p.paises).filter((id) => cuota(p, id, ult) != null).sort((u, w) => cuota(p, w, ult) - cuota(p, u, ult)).slice(0, 5);
      const series = top.map((id, i) => ({ id, nombre: nombre(id), color: PALETA[i], v: anios.map((y) => cuota(p, id, y)) }));
      if (agr) {
        const vs = anios.map((y) => { const q = valorAgregado(p, y); return q && p.mundo[y] ? (q.v / p.mundo[y]) * 100 : null; });
        if (vs.some((v) => v != null)) series.push({ id: "AGR", nombre: agr.nombre, color: "#a3245c", v: vs, agregado: true });
      }
      const WE = 520, HE = 250, m = { t: 10, r: 14, b: 26, l: 36 };
      const xe = d3.scalePoint().domain(anios).range([m.l, WE - m.r]).padding(0.2);
      const ye = d3.scaleLinear().domain([0, Math.max(5, d3.max(series.flatMap((s) => s.v)) || 5)]).nice().range([HE - m.b, m.t]);
      const svgE = d3.select("#evolucion").attr("viewBox", [0, 0, WE, HE]);
      svgE.selectAll("*").remove();
      svgE.append("g").selectAll("line").data(ye.ticks(5)).join("line").attr("class", "rejilla-l").attr("x1", m.l).attr("x2", WE - m.r).attr("y1", ye).attr("y2", ye);
      svgE.append("g").attr("class", "eje").attr("transform", "translate(0," + (HE - m.b) + ")").call(d3.axisBottom(xe).tickSize(3));
      svgE.append("g").attr("class", "eje").attr("transform", "translate(" + m.l + ",0)").call(d3.axisLeft(ye).ticks(5).tickSize(3));
      const lin = d3.line().defined((d) => d != null).x((d, i) => xe(anios[i])).y(ye);
      series.forEach((s) => {
        svgE.append("path").attr("class", "linea-e" + (s.agregado ? " agregado" : "")).attr("stroke", s.color).attr("d", lin(s.v));
        svgE.append("g").selectAll("circle").data(s.v.map((v, i) => [v, i]).filter((d) => d[0] != null)).join("circle")
          .attr("cx", (d) => xe(anios[d[1]])).attr("cy", (d) => ye(d[0])).attr("r", 3).attr("fill", s.color)
          .append("title").text((d) => s.nombre + ", " + anios[d[1]] + ": " + f1(d[0]) + " %");
      });
      svgE.append("line").attr("x1", xe(a)).attr("x2", xe(a)).attr("y1", m.t).attr("y2", HE - m.b).attr("stroke", "var(--tinta-3)").attr("stroke-dasharray", "2 3");
      document.getElementById("leyenda-evolucion").innerHTML = series.map((s) => '<span><i class="l' + (s.agregado ? " d" : "") + '" style="border-top-color:' + s.color + '"></i>' + RM.esc(s.nombre) + "</span>").join("");

      // El manual y los datos
      const afirm = (C.manual || []).filter((m2) => m2.producto === p.id);
      document.getElementById("manual-producto").innerHTML = "<h3>El manual y los datos</h3>" + (afirm.length ? afirm.map((m2) => {
        return '<div class="afirmacion"><p class="que">«' + RM.esc(m2.texto) + "»</p><p class=\"hoy\">" + comprobar(p, m2) + '</p><p class="ap">' + (m2.nota ? RM.esc(m2.nota) + " " : "") + "Manual: " + RM.esc(m2.apartado) + "</p></div>";
      }).join("") : '<p class="vacio">El capítulo no da cifras sobre este producto. Usad el mapa y el ranking para describir su distribución mundial.</p>');

      const notaA = est.length ? " * Estimación." : "";
      document.getElementById("fuente-producto").innerHTML = "Fuente: " + (p.url ? '<a href="' + RM.esc(p.url) + '">' + RM.esc(p.fuente) + "</a>" : RM.esc(p.fuente)) +
        ". Unidad: " + RM.esc(p.unidad === "t" ? "toneladas" : p.unidad) + ". " + RM.esc(p.nota || "") + notaA;
    }

    function comprobar(p, m2) {
      const a = String(p.anios[p.anios.length - 1]);
      const W = p.mundo[a];
      if (m2.tipo === "cuota") {
        const q = valorAgregado(p, a);
        if (!q) return "Sin datos para comprobarlo.";
        return "Hoy (" + a + "): " + f0((q.v / W) * 100) + " % del total mundial" + (q.aprox ? " (suma de los países con más del 0,5 %)" : "") + ".";
      }
      if (m2.tipo === "posicion") {
        const q = valorAgregado(p, a);
        if (!q) return "Sin datos para comprobarlo.";
        const miembros = new Set(agr.paises || []);
        const otros = Object.keys(p.paises).filter((id) => !miembros.has(id) && p.paises[id][a] != null)
          .map((id) => ({ n: nombre(id), v: p.paises[id][a] })).concat([{ n: agr.nombre, v: q.v, yo: true }]).sort((u, w) => w.v - u.v);
        const i = otros.findIndex((o) => o.yo);
        return "Hoy (" + a + "): " + agr.nombre + " es " + (i + 1) + ".º productor" + (i > 0 ? ", tras " + otros.slice(0, i).map((o) => o.n + " (" + f0((o.v / W) * 100) + " %)").join(", ") : "") +
          ", con el " + f0((q.v / W) * 100) + " % del total mundial.";
      }
      if (m2.tipo === "ranking") {
        const base = m2.paises === "mundo" ? Object.keys(p.paises) : (m2.paises || agr.paises || []);
        const lista = base.filter((id) => p.paises[id] && p.paises[id][a] != null).sort((u, w) => p.paises[w][a] - p.paises[u][a]).slice(0, m2.n || 4);
        if (!lista.length) return "Ninguno de esos países alcanza el 0,5 % de la producción mundial.";
        return "Hoy (" + a + "): " + lista.map((id) => nombre(id) + " (" + formatoValor(p.paises[id][a], p.unidad, p.unidadCorta) + ")").join(", ") + ".";
      }
      if (m2.tipo === "pais") {
        const v = p.paises[m2.pais] ? p.paises[m2.pais][a] : null;
        return v != null ? "Hoy (" + a + "): " + nombre(m2.pais) + " produce el " + f1((v / W) * 100) + " % del total mundial." : "Hoy no llega al 0,5 % del total mundial.";
      }
      return "";
    }
    if (prods.length) pintarProduccion(); else document.getElementById("t-produccion").hidden = true;

    // =====================================================================
    // Balance energético
    // =====================================================================
    const E = C.energia ? await RM.json(carpeta(C.energia.datos)).catch(() => null) : null;
    const FUENTES = [
      ["coal", "Carbón", "#4b4b4b"], ["oil", "Petróleo", "#8c5a3c"], ["gas", "Gas natural", "#d0a85c"],
      ["nuclear", "Nuclear", "#8a6aa8"], ["hydro", "Hidráulica", "#2f6c8f"], ["wind", "Eólica", "#62a8d6"],
      ["solar", "Solar", "#e8c13a"], ["biofuel", "Biocombustibles y biomasa", "#8fb35a"], ["other_renewable", "Otras renovables", "#5f8f4a"],
    ];
    const FUENTES_E = [
      ["coal", "Carbón", "#4b4b4b"], ["oil", "Petróleo", "#8c5a3c"], ["gas", "Gas natural", "#d0a85c"], ["nuclear", "Nuclear", "#8a6aa8"],
      ["hydro", "Hidráulica", "#2f6c8f"], ["wind", "Eólica", "#62a8d6"], ["solar", "Solar", "#e8c13a"],
      ["biofuel", "Biomasa", "#8fb35a"], ["other_renewable_exc_biofuel", "Otras renovables", "#5f8f4a"],
    ];
    const estadoE = { a: C.energia ? C.energia.porDefecto : null, b: C.energia ? C.energia.comparar : null };
    if (E) {
      const ids = Object.keys(E.paises);
      const enRegion = ids.filter((id) => regionPaises.has(id)).sort((u, w) => nombre(u).localeCompare(nombre(w), "es"));
      const otros = ids.filter((id) => !regionPaises.has(id));
      const opciones = (sel, vacio) => (vacio ? '<option value="">Ningún país</option>' : "") +
        '<optgroup label="' + RM.esc(R.ficha.titulo) + '">' + enRegion.map((id) => '<option value="' + id + '"' + (id === sel ? " selected" : "") + ">" + RM.esc(nombre(id)) + "</option>").join("") + "</optgroup>" +
        '<optgroup label="Comparación">' + otros.map((id) => '<option value="' + id + '"' + (id === sel ? " selected" : "") + ">" + RM.esc(nombre(id)) + "</option>").join("") + "</optgroup>";
      const sa = document.getElementById("pais-a"), sb = document.getElementById("pais-b");
      const rellenar = () => { sa.innerHTML = opciones(estadoE.a); sb.innerHTML = opciones(estadoE.b, true); };
      rellenar();
      sa.addEventListener("change", () => { estadoE.a = sa.value; pintarEnergia(); });
      sb.addEventListener("change", () => { estadoE.b = sb.value || null; pintarEnergia(); });
      document.getElementById("fuente-energia").innerHTML = "Fuente: " + '<a href="' + RM.esc(E.url) + '">' + RM.esc(E.fuente) + "</a>. " + RM.esc(E.nota);
      document.getElementById("leyenda-consumo").innerHTML = FUENTES.map((f) => '<span><i style="background:' + f[2] + '"></i>' + f[1] + "</span>").join("");

      const ultimoValor = (arr) => { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return [arr[i], i]; return [null, -1]; };
      function indicadores(id) {
        const d = E.paises[id];
        const n = d.anios[1] - d.anios[0] + 1, i = n - 1;
        const tot = FUENTES.reduce((s, f) => s + (d.consumo[f[0]][i] || 0), 0);
        const fos = ["coal", "oil", "gas"].reduce((s, k) => s + (d.consumo[k][i] || 0), 0);
        const prod = ["coal", "oil", "gas"].reduce((s, k) => s + (d.produccion[k][i] || 0), 0);
        const pob = ultimoValor(d.poblacion)[0];
        const el = d.electricidad;
        const renE = el ? ["hydro", "wind", "solar", "biofuel", "other_renewable_exc_biofuel"].reduce((s, k) => s + (el.fuentes[k] || 0), 0) / el.total * 100 : null;
        return { anio: d.anios[1], tot, porHab: pob ? tot * 1e6 / pob : null, autos: fos ? prod / fos * 100 : null, fosil: tot ? fos / tot * 100 : null, renE, anioE: el ? el.anio : null };
      }
      function pintarEnergia() {
        const A = estadoE.a, B = estadoE.b && E.paises[estadoE.b] ? estadoE.b : null;
        const ia = indicadores(A), ib = B ? indicadores(B) : null;
        const fila = (t, fa, fb) => "<div><dt>" + t + "</dt><dd>" + fa + (ib ? ' <small>/ ' + fb + "</small>" : "") + "</dd></div>";
        document.getElementById("indicadores-energia").innerHTML = '<dl class="indicadores" style="margin:0">' +
          fila("Consumo de energía primaria (" + ia.anio + ")", f0(ia.tot) + " TWh", ib ? f0(ib.tot) + " TWh" : "") +
          fila("Consumo por habitante", f1(ia.porHab) + " MWh", ib ? f1(ib.porHab) + " MWh" : "") +
          fila("Combustibles fósiles en el consumo", f0(ia.fosil) + " %", ib ? f0(ib.fosil) + " %" : "") +
          fila("Autoabastecimiento de fósiles", f0(ia.autos) + " %", ib ? f0(ib.autos) + " %" : "") +
          fila("Electricidad renovable (" + (ia.anioE || "—") + ")", ia.renE != null ? f0(ia.renE) + " %" : "—", ib && ib.renE != null ? f0(ib.renE) + " %" : "—") +
          "</dl>" + (ib ? '<p class="nota">Primera cifra: ' + RM.esc(nombre(A)) + ". Segunda: " + RM.esc(nombre(B)) + ".</p>" : "");

        // Consumo apilado
        const d = E.paises[A];
        const anios = d3.range(d.anios[0], d.anios[1] + 1);
        const filas = anios.map((y, i) => Object.fromEntries([["anio", y]].concat(FUENTES.map((f) => [f[0], d.consumo[f[0]][i] || 0]))));
        const pila = d3.stack().keys(FUENTES.map((f) => f[0]))(filas);
        const W = 640, H = 300, m = { t: 10, r: 12, b: 26, l: 52 };
        const x = d3.scaleLinear().domain(d3.extent(anios)).range([m.l, W - m.r]);
        const y = d3.scaleLinear().domain([0, d3.max(pila[pila.length - 1], (p) => p[1])]).nice().range([H - m.b, m.t]);
        const svg = d3.select("#consumo").attr("viewBox", [0, 0, W, H]); svg.selectAll("*").remove();
        svg.append("g").selectAll("line").data(y.ticks(5)).join("line").attr("class", "rejilla-l").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y).attr("y2", y);
        const area = d3.area().x((p) => x(p.data.anio)).y0((p) => y(p[0])).y1((p) => y(p[1]));
        svg.append("g").selectAll("path").data(pila).join("path").attr("d", area).attr("fill", (s, i) => FUENTES[i][2])
          .append("title").text((s, i) => FUENTES[i][1]);
        svg.append("g").attr("class", "eje").attr("transform", "translate(0," + (H - m.b) + ")").call(d3.axisBottom(x).ticks(7).tickFormat(d3.format("d")).tickSize(3));
        svg.append("g").attr("class", "eje").attr("transform", "translate(" + m.l + ",0)").call(d3.axisLeft(y).ticks(5).tickSize(3).tickFormat((v) => RM.formato(v, 0)));
        document.getElementById("tit-consumo").textContent = "Consumo de energía primaria por fuente en " + nombre(A) + " (TWh)";

        // Electricidad: barras al 100 %
        const paises = [A].concat(B ? [B] : []).filter((id) => E.paises[id].electricidad);
        const We = 420, fila2 = 54, He = paises.length * fila2 + 70;
        const svgE = d3.select("#electricidad").attr("viewBox", [0, 0, We, He]); svgE.selectAll("*").remove();
        const xe = d3.scaleLinear().domain([0, 100]).range([10, We - 10]);
        paises.forEach((id, k) => {
          const el = E.paises[id].electricidad;
          let acc = 0;
          const yy = k * fila2 + 18;
          svgE.append("text").attr("class", "rot region").attr("x", 10).attr("y", yy - 5).text(nombre(id) + " (" + el.anio + ", " + f0(el.total) + " TWh)");
          FUENTES_E.forEach((f) => {
            const v = (el.fuentes[f[0]] || 0) / el.total * 100;
            if (v <= 0) return;
            svgE.append("rect").attr("x", xe(acc)).attr("width", xe(acc + v) - xe(acc)).attr("y", yy).attr("height", 22).attr("fill", f[2])
              .append("title").text(f[1] + ": " + f1(v) + " %");
            if (v >= 7) svgE.append("text").attr("class", "rot").attr("x", xe(acc) + 3).attr("y", yy + 15).attr("fill", ["coal", "oil", "nuclear", "hydro"].includes(f[0]) ? "#fff" : "#1d2a30").style("font-size", "11px").text(f0(v) + " %");
            acc += v;
          });
        });
        const ley = svgE.append("g").attr("transform", "translate(10," + (paises.length * fila2 + 16) + ")");
        FUENTES_E.forEach((f, i) => {
          const g = ley.append("g").attr("transform", "translate(" + ((i % 3) * 135) + "," + Math.floor(i / 3) * 17 + ")");
          g.append("rect").attr("width", 11).attr("height", 9).attr("fill", f[2]);
          g.append("text").attr("class", "rot").attr("x", 15).attr("y", 9).style("font-size", "11px").text(f[1]);
        });
        document.getElementById("tit-electricidad").textContent = "Generación eléctrica por fuente (%)";

        // Producción frente a consumo de fósiles
        const cont = document.getElementById("fosiles"); cont.innerHTML = "";
        [["coal", "Carbón"], ["oil", "Petróleo"], ["gas", "Gas natural"]].forEach(([k, t]) => {
          const fig = document.createElement("figure");
          fig.innerHTML = "<figcaption>" + t + "</figcaption><svg></svg>";
          cont.appendChild(fig);
          const Ws = 320, Hs = 180, ms = { t: 8, r: 8, b: 22, l: 44 };
          const cons = d.consumo[k];
          // La fuente deja de registrar a los productores pequeños: sin dato se toma como producción nula
          const prod = d.produccion[k].map((v, i) => v != null ? v : (cons[i] != null ? 0 : null));
          const xs = d3.scaleLinear().domain(d3.extent(anios)).range([ms.l, Ws - ms.r]);
          const ys = d3.scaleLinear().domain([0, d3.max(prod.concat(cons).map((v) => v || 0)) || 1]).nice().range([Hs - ms.b, ms.t]);
          const s = d3.select(fig.querySelector("svg")).attr("viewBox", [0, 0, Ws, Hs]);
          const def = (i) => prod[i] != null && cons[i] != null;
          s.append("path").attr("class", "hueco").attr("d", d3.area().defined((v, i) => def(i)).x((v, i) => xs(anios[i])).y0((v, i) => ys(Math.min(prod[i], cons[i]))).y1((v, i) => ys(cons[i]))(anios));
          s.append("path").attr("class", "excedente").attr("d", d3.area().defined((v, i) => def(i)).x((v, i) => xs(anios[i])).y0((v, i) => ys(Math.min(prod[i], cons[i]))).y1((v, i) => ys(prod[i]))(anios));
          s.append("path").attr("class", "prod").attr("d", d3.line().defined((v) => v != null).x((v, i) => xs(anios[i])).y(ys)(prod));
          s.append("path").attr("class", "cons").attr("d", d3.line().defined((v) => v != null).x((v, i) => xs(anios[i])).y(ys)(cons));
          s.append("g").attr("class", "eje").attr("transform", "translate(0," + (Hs - ms.b) + ")").call(d3.axisBottom(xs).ticks(4).tickFormat(d3.format("d")).tickSize(3));
          s.append("g").attr("class", "eje").attr("transform", "translate(" + ms.l + ",0)").call(d3.axisLeft(ys).ticks(4).tickSize(3).tickFormat((v) => RM.formato(v, 0)));
        });
        const leyF = document.createElement("div"); leyF.className = "leyenda-linea"; leyF.style.gridColumn = "1 / -1";
        leyF.innerHTML = '<span><i class="l" style="border-top-color:#2f6c8f"></i>Producción</span><span><i class="l" style="border-top-color:#9c3a1f"></i>Consumo</span>' +
          '<span><i style="background:#f1d2c3"></i>Importación neta</span><span><i style="background:#cfe0e8"></i>Excedente exportable</span>' +
          '<span>Si la fuente no registra producción en un año, se toma como nula: son países con producción insignificante.</span>';
        cont.appendChild(leyF);
      }
      pintarEnergia();
      window.__pintarEnergia = (a, b) => { estadoE.a = a || estadoE.a; estadoE.b = b === undefined ? estadoE.b : b; rellenar(); pintarEnergia(); };
    } else document.getElementById("t-energia").hidden = true;

    // =====================================================================
    // Sector agrario
    // =====================================================================
    const AG = C.agrario ? await RM.json(carpeta(C.agrario.datos)).catch(() => null) : null;
    let indicadorActual = null;
    if (AG) {
      const claves = Object.keys(AG.indicadores);
      indicadorActual = claves[0];
      const sel = document.getElementById("indicador");
      sel.innerHTML = claves.map((k) => '<option value="' + k + '">' + RM.esc(AG.indicadores[k].nombre) + "</option>").join("");
      sel.addEventListener("change", () => { indicadorActual = sel.value; pintarAgrario(); });
      function pintarAgrario() {
        sel.value = indicadorActual;
        const ind = AG.indicadores[indicadorActual];
        document.getElementById("explica-indicador").textContent = ind.explicacion || "";
        const comp = new Set(C.agrario.comparadores || []);
        const filas = Object.entries(AG.paises).map(([id, d]) => {
          const s = d[indicadorActual] || {};
          const ys = Object.keys(s).sort();
          const ini = ys.find((y) => +y <= 2002), fin = ys[ys.length - 1];
          return { id, comp: comp.has(id), a: ini ? s[ini] : null, ya: ini, b: fin && fin !== ini ? s[fin] : null, yb: fin };
        }).filter((d) => d.b != null);
        const reg = filas.filter((d) => !d.comp).sort((u, w) => w.b - u.b);
        const cmp = filas.filter((d) => d.comp).sort((u, w) => w.b - u.b);
        const todas = reg.concat(cmp);
        const W = 820, fila = 19, sepH = cmp.length ? 18 : 0, H = todas.length * fila + sepH + 40, izq = 170;
        const max = d3.max(todas.flatMap((d) => [d.a, d.b].filter((v) => v != null)));
        const x = (ind.escala === "log" ? d3.scaleLog().domain([d3.min(todas.flatMap((d) => [d.a, d.b].filter((v) => v > 0))), max]) : d3.scaleLinear().domain([0, max])).nice().range([izq, W - 110]);
        const svg = d3.select("#pesas").attr("viewBox", [0, 0, W, H]); svg.selectAll("*").remove();
        svg.append("g").attr("class", "eje").attr("transform", "translate(0,22)").call(d3.axisTop(x).ticks(6, ind.escala === "log" ? "~s" : undefined).tickSize(3));
        const yPos = (i) => 34 + i * fila + (i >= reg.length ? sepH : 0);
        if (cmp.length) svg.append("line").attr("class", "sep").attr("x1", 10).attr("x2", W - 10).attr("y1", yPos(reg.length) - sepH / 2 - 4).attr("y2", yPos(reg.length) - sepH / 2 - 4);
        const g = svg.selectAll("g.f").data(todas).join("g").attr("class", "f").attr("transform", (d, i) => "translate(0," + yPos(i) + ")");
        g.append("text").attr("class", (d) => "rot" + (d.comp ? " region" : "")).attr("x", izq - 8).attr("y", 4).attr("text-anchor", "end").text((d) => nombre(d.id));
        g.filter((d) => d.a != null).append("line").attr("class", "pesa-l").attr("x1", (d) => x(d.a)).attr("x2", (d) => x(d.b));
        g.filter((d) => d.a != null).append("circle").attr("class", "pesa-a").attr("cx", (d) => x(d.a)).attr("r", 4.5).append("title").text((d) => d.ya + ": " + RM.formato(d.a, ind.decimales || 1));
        g.append("circle").attr("class", (d) => "pesa-b" + (d.comp ? " comp" : "")).attr("cx", (d) => x(d.b)).attr("r", 5).append("title").text((d) => d.yb + ": " + RM.formato(d.b, ind.decimales || 1));
        g.append("text").attr("class", "rot valor").attr("x", (d) => Math.max(x(d.b), d.a != null ? x(d.a) : 0) + 10).attr("y", 4).text((d) => RM.formato(d.b, ind.decimales || 1) + " (" + d.yb + ")");
        document.getElementById("fuente-agrario").innerHTML = '<svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" fill="#f8f8f4" stroke="#4b5a60" stroke-width="1.5"/></svg> 2000 ' +
          '<svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="#1d2a30"/></svg> último año disponible. Los comparadores (en magenta) aparecen al final. Fuente: ' + RM.esc(ind.fuente) + ".";
      }
      pintarAgrario();
      window.__pintarAgrario = (k) => { if (AG.indicadores[k]) indicadorActual = k; pintarAgrario(); };
    } else document.getElementById("t-agrario").hidden = true;

    // =====================================================================
    // Preguntas
    // =====================================================================
    if (preguntas) {
      const cont = document.getElementById("cuestionario");
      const ir = document.createElement("p");
      cont.parentNode.insertBefore(ir, cont);
      new RM.Cuestionario(cont, preguntas.preguntas, {
        clave: "recursos:" + R.ficha.id,
        alMostrar: (q) => {
          const v = q.vista;
          ir.innerHTML = "";
          if (!v) return;
          const b = document.createElement("button");
          b.type = "button"; b.className = "principal";
          b.textContent = v.pestana === "energia" ? "Abrir el balance energético de " + nombre(v.paisA) : v.pestana === "agrario" ? "Abrir el indicador agrario" : "Abrir la producción de " + ((prods.find((p) => p.id === v.producto) || {}).nombre || "").toLowerCase();
          b.addEventListener("click", () => {
            if (v.pestana === "produccion") { estadoP.producto = v.producto; estadoP.anio = v.anio ? String(v.anio) : null; pintarProduccion(); }
            if (v.pestana === "energia" && window.__pintarEnergia) window.__pintarEnergia(v.paisA, v.paisB || null);
            if (v.pestana === "agrario" && window.__pintarAgrario) window.__pintarAgrario(v.indicador);
            abrir(v.pestana);
            window.scrollTo({ top: 0 });
          });
          ir.appendChild(b);
        },
      });
    } else document.getElementById("t-preguntas").hidden = true;

    const h = location.hash.slice(1);
    if (tabs.includes(h) && !document.getElementById("t-" + h).hidden) abrir(h);
  } catch (e) {
    RM.error(main, e);
  }
})();
