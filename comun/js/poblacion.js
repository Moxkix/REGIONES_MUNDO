/* Motor «Población y desarrollo»: pirámides, transición demográfica y explorador de indicadores.
   Lee la sección "poblacion" de regiones/<id>/config.json.
   Datos mundiales compartidos: datos/poblacion/<ID>.json (WPP 2024) y datos/indicadores/*.json. */
(async function () {
  "use strict";
  const barra = document.getElementById("barra");
  const main = document.getElementById("poblacion");
  let R;
  try { R = await RM.region(); } catch (e) { RM.cabecera(barra); RM.error(main, e); return; }
  RM.cabecera(barra, R.ficha, "poblacion", R.ficha.motores);
  document.title = "Población y desarrollo. " + R.ficha.titulo;
  const C = R.config.poblacion || {};
  const carpeta = (r) => R.carpeta + r;
  const f0 = (n) => RM.formato(n, 0), f1 = (n) => RM.formato(n, 1);
  const reducido = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const AGR = { MUNDO: "Mundo", AFR: "África", ASI: "Asia", EUR: "Europa", LAC: "América Latina y el Caribe", NAM: "América del Norte", OCE: "Oceanía" };

  try {
    const [mundo, catalogo, indice, wpp, wdi, preguntas] = await Promise.all([
      RM.json("datos/mundo/paises-50m.json"), RM.json("datos/regiones.json"), RM.json("datos/poblacion/indice.json"),
      RM.json("datos/indicadores/wpp.json"), RM.json("datos/indicadores/wdi.json").catch(() => null),
      C.cuestionario ? RM.json(carpeta(C.cuestionario)).catch(() => null) : Promise.resolve(null),
    ]);
    const geo = topojson.feature(mundo, mundo.objects.paises).features;
    const NOMBRE = new Map(geo.map((f) => [f.properties.id, f.properties.nombre]));
    Object.entries(AGR).forEach(([k, v]) => NOMBRE.set(k, v));
    const nombre = (id) => NOMBRE.get(id) || id;
    const disponibles = new Set(indice.paises);
    const regionDe = new Map();
    catalogo.regiones.forEach((r) => r.paises.forEach((p) => regionDe.set(p, r)));
    const enRegion = new Set(R.ficha.paises);
    const fuenteWPP = indice.fuente;

    // ---------- Pestañas ----------
    const tabs = ["piramides", "transicion", "explorador", "preguntas"];
    const repintar = {};
    function abrir(id) {
      tabs.forEach((t) => {
        document.getElementById("t-" + t).setAttribute("aria-selected", t === id ? "true" : "false");
        document.getElementById("s-" + t).hidden = t !== id;
      });
      history.replaceState(null, "", "#" + id);
      if (repintar[id]) repintar[id]();
    }
    tabs.forEach((t) => document.getElementById("t-" + t).addEventListener("click", () => abrir(t)));
    const anchoDe = (sel, min, max) => {
      const el = document.querySelector(sel);
      const w = el && el.parentNode ? el.parentNode.clientWidth : max;
      return Math.max(min, Math.min(max, w || max));
    };

    // ---------- Selectores de país ----------
    const propios = R.ficha.paises.filter((id) => disponibles.has(id)).sort((a, b) => nombre(a).localeCompare(nombre(b), "es"));
    const comparadores = (C.comparadores || []).filter((id) => disponibles.has(id));
    const agregados = Object.keys(AGR).filter((id) => disponibles.has(id));
    function opciones(sel, vacio) {
      const op = (id) => '<option value="' + id + '"' + (id === sel ? " selected" : "") + ">" + RM.esc(nombre(id)) + "</option>";
      return (vacio ? '<option value="">Ninguno</option>' : "") +
        '<optgroup label="' + RM.esc(R.ficha.titulo) + '">' + propios.map(op).join("") + "</optgroup>" +
        (comparadores.length ? '<optgroup label="Otros países">' + comparadores.map(op).join("") + "</optgroup>" : "") +
        '<optgroup label="Continentes y mundo">' + agregados.map(op).join("") + "</optgroup>";
    }
    const datosPais = (id) => RM.json("datos/poblacion/" + id + ".json");

    // =====================================================================
    // Pirámides
    // =====================================================================
    const P = { a: C.porDefecto || propios[0], b: C.comparar || "", anio: 2025, escala: "pct", play: null };
    const selA = document.getElementById("pir-a"), selB = document.getElementById("pir-b");
    const rango = document.getElementById("pir-anio");
    function rellenarPir() { selA.innerHTML = opciones(P.a); selB.innerHTML = opciones(P.b, true); rango.value = P.anio; }
    rellenarPir();
    selA.addEventListener("change", () => { P.a = selA.value; pintarPiramide(); });
    selB.addEventListener("change", () => { P.b = selB.value; pintarPiramide(); });
    rango.addEventListener("input", () => { P.anio = +rango.value; pintarPiramide(); });
    document.querySelectorAll('input[name="escala-pir"]').forEach((i) => i.addEventListener("change", () => { P.escala = i.value; pintarPiramide(); }));
    const botonPlay = document.getElementById("pir-play");
    botonPlay.addEventListener("click", () => {
      if (P.play) { clearInterval(P.play); P.play = null; botonPlay.textContent = "Reproducir"; return; }
      if (P.anio >= 2100) P.anio = 1950;
      botonPlay.textContent = "Pausa";
      P.play = setInterval(() => {
        P.anio += 5; rango.value = P.anio; pintarPiramide();
        if (P.anio >= 2100) { clearInterval(P.play); P.play = null; botonPlay.textContent = "Reproducir"; }
      }, reducido ? 1200 : 450);
    });

    function estructura(d, anio) {
      const i = d.aniosPiramide.indexOf(anio);
      const H = d.hombres[i], M = d.mujeres[i];
      const g = H.map((h, k) => h + M[k]);
      const tot = d3.sum(g);
      const jov = d3.sum(g.slice(0, 3)), adu = d3.sum(g.slice(3, 13)), may = d3.sum(g.slice(13));
      const acum = d3.cumsum(g).map((v) => v / tot);
      const k = acum.findIndex((v) => v >= 0.5), antes = k > 0 ? acum[k - 1] : 0;
      const j = anio - d.anios[0];
      return {
        H, M, tot, jov: jov / tot * 100, adu: adu / tot * 100, may: may / tot * 100,
        mediana: 5 * k + 5 * (0.5 - antes) / (acum[k] - antes),
        dep: (jov + may) / adu * 100, depV: may / adu * 100,
        tfr: d.fecundidad[j], e0: d.esperanza_vida[j], tbn: d.natalidad[j], tbm: d.mortalidad[j],
      };
    }

    async function pintarPiramide() {
      const [A, B] = await Promise.all([datosPais(P.a), P.b ? datosPais(P.b) : Promise.resolve(null)]);
      const ea = estructura(A, P.anio), eb = B ? estructura(B, P.anio) : null;
      const proy = P.anio > A.ultimoObservado;
      document.getElementById("pir-anio-txt").innerHTML = P.anio + (proy ? "<small>proyección</small>" : "");
      const val = (e, arr) => P.escala === "pct" ? arr.map((v) => v / e.tot * 100) : arr;
      const Ha = val(ea, ea.H), Ma = val(ea, ea.M);
      const Hb = eb ? val(eb, eb.H) : null, Mb = eb ? val(eb, eb.M) : null;
      const W = anchoDe("#piramide", 340, 760), alto = 17, H = 20 * alto + 40, centro = W / 2, hueco = 34;
      const max = d3.max([].concat(Ha, Ma, Hb || [], Mb || []));
      const x = d3.scaleLinear().domain([0, max * 1.05]).range([0, centro - hueco - 8]);
      const svg = d3.select("#piramide").attr("viewBox", [0, 0, W, H]); svg.selectAll("*").remove();
      const y = (k) => H - 26 - (k + 1) * alto;
      A.grupos.forEach((g, k) => {
        svg.append("rect").attr("class", "barra-h").attr("x", centro - hueco - x(Ha[k])).attr("width", x(Ha[k])).attr("y", y(k) + 1).attr("height", alto - 2)
          .append("title").text("Hombres " + g + ": " + (P.escala === "pct" ? f1(Ha[k]) + " %" : f0(Ha[k]) + " mil"));
        svg.append("rect").attr("class", "barra-m").attr("x", centro + hueco).attr("width", x(Ma[k])).attr("y", y(k) + 1).attr("height", alto - 2)
          .append("title").text("Mujeres " + g + ": " + (P.escala === "pct" ? f1(Ma[k]) + " %" : f0(Ma[k]) + " mil"));
        if (k % 2 === 0 || W > 500) svg.append("text").attr("class", "edad").attr("x", centro).attr("y", y(k) + alto - 5).attr("text-anchor", "middle").text(g);
      });
      if (eb) {
        const esc = (arr, lado) => {
          const pts = [];
          arr.forEach((v, k) => {
            const xx = lado < 0 ? centro - hueco - x(v) : centro + hueco + x(v);
            pts.push([xx, y(k) + alto], [xx, y(k)]);
          });
          return d3.line()(pts);
        };
        svg.append("path").attr("class", "contorno-b").attr("d", esc(Hb, -1));
        svg.append("path").attr("class", "contorno-b").attr("d", esc(Mb, 1));
      }
      const fmt = P.escala === "pct" ? (v) => f1(v) + " %" : (v) => (v >= 1000 ? f1(v / 1000) + " M" : f0(v) + " mil");
      const ticks = x.ticks(4).filter((t) => t > 0);
      ticks.forEach((t) => {
        [centro - hueco - x(t), centro + hueco + x(t)].forEach((xx) => {
          svg.append("line").attr("x1", xx).attr("x2", xx).attr("y1", 14).attr("y2", H - 26).attr("stroke", "#dfe4e2").lower();
          svg.append("text").attr("class", "edad").attr("x", xx).attr("y", H - 10).attr("text-anchor", "middle").text(fmt(t));
        });
      });
      svg.append("text").attr("class", "rot region").attr("x", centro - hueco).attr("y", 11).attr("text-anchor", "end").text("Hombres");
      svg.append("text").attr("class", "rot region").attr("x", centro + hueco).attr("y", 11).text("Mujeres");
      document.getElementById("leyenda-piramide").innerHTML = '<span><i style="background:#4a7aa0"></i>Hombres</span><span><i style="background:#c2665a"></i>Mujeres</span>' +
        (eb ? '<span><i style="background:transparent;border:1.6px solid var(--tinta)"></i>' + RM.esc(nombre(P.b)) + " (contorno)</span>" : "");

      const fila = (t, va, vb) => "<div><dt>" + t + "</dt><dd>" + va + (eb ? "<small>" + RM.esc(nombre(P.b)) + ": " + vb + "</small>" : "") + "</dd></div>";
      const pobTxt = (e) => e.tot >= 1000 ? f1(e.tot / 1000) + " millones" : f0(e.tot) + " mil";
      document.getElementById("ind-piramide").innerHTML =
        fila("Población de " + nombre(P.a) + " (" + P.anio + ")", pobTxt(ea), eb && pobTxt(eb)) +
        fila("Edad mediana", f1(ea.mediana) + " años", eb && f1(eb.mediana) + " años") +
        fila("Menores de 15 años", f1(ea.jov) + " %", eb && f1(eb.jov) + " %") +
        fila("De 65 años y más", f1(ea.may) + " %", eb && f1(eb.may) + " %") +
        fila("Tasa de dependencia", f0(ea.dep) + " %", eb && f0(eb.dep) + " %") +
        fila("Dependencia de los mayores", f0(ea.depV) + " %", eb && f0(eb.depV) + " %") +
        fila("Fecundidad", RM.formato(ea.tfr, 2) + " hijos por mujer", eb && RM.formato(eb.tfr, 2)) +
        fila("Esperanza de vida", f1(ea.e0) + " años", eb && f1(eb.e0) + " años");
      document.getElementById("nota-piramide").textContent = "Tasa de dependencia: menores de 15 y mayores de 64 por cada 100 personas de 15 a 64 años. Dependencia de los mayores: solo los de 65 y más. " +
        "Fuente: " + fuenteWPP + ". Las cifras de Naciones Unidas pueden diferir de las de los institutos nacionales.";
    }
    repintar.piramides = pintarPiramide;

    // =====================================================================
    // Transición demográfica
    // =====================================================================
    const T = { a: C.porDefecto || propios[0], b: C.transicionComparar || "" };
    const trA = document.getElementById("tr-a"), trB = document.getElementById("tr-b");
    function rellenarTr() { trA.innerHTML = opciones(T.a); trB.innerHTML = opciones(T.b, true); }
    rellenarTr();
    trA.addEventListener("change", () => { T.a = trA.value; pintarTransicion(); });
    trB.addEventListener("change", () => { T.b = trB.value; pintarTransicion(); });

    async function pintarTransicion() {
      const [A, B] = await Promise.all([datosPais(T.a), T.b ? datosPais(T.b) : Promise.resolve(null)]);
      const anios = d3.range(A.anios[0], A.anios[1] + 1);
      const W = anchoDe("#transicion", 340, 680), H = 320, m = { t: 12, r: 18, b: 26, l: 36 };
      const x = d3.scaleLinear().domain(d3.extent(anios)).range([m.l, W - m.r]);
      const todo = A.natalidad.concat(A.mortalidad, B ? B.natalidad.concat(B.mortalidad) : []).filter((v) => v != null);
      const y = d3.scaleLinear().domain([0, d3.max(todo)]).nice().range([H - m.b, m.t]);
      const svg = d3.select("#transicion").attr("viewBox", [0, 0, W, H]); svg.selectAll("*").remove();
      svg.append("g").selectAll("line").data(y.ticks(6)).join("line").attr("class", "rejilla-l").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y).attr("y2", y);
      const n = A.natalidad, d = A.mortalidad;
      svg.append("path").attr("class", "crece").attr("d", d3.area().defined((v, i) => n[i] != null && d[i] != null && n[i] >= d[i])
        .x((v, i) => x(anios[i])).y0((v, i) => y(d[i])).y1((v, i) => y(n[i]))(anios));
      svg.append("path").attr("class", "decrece").attr("d", d3.area().defined((v, i) => n[i] != null && d[i] != null && n[i] < d[i])
        .x((v, i) => x(anios[i])).y0((v, i) => y(n[i])).y1((v, i) => y(d[i]))(anios));
      const linea = (arr) => d3.line().defined((v) => v != null).x((v, i) => x(anios[i])).y(y)(arr);
      svg.append("path").attr("class", "tbn").attr("d", linea(n));
      svg.append("path").attr("class", "tbm").attr("d", linea(d));
      if (B) { svg.append("path").attr("class", "tbn b").attr("d", linea(B.natalidad)); svg.append("path").attr("class", "tbm b").attr("d", linea(B.mortalidad)); }
      const xc = x(A.ultimoObservado + 0.5);
      svg.append("line").attr("class", "corte").attr("x1", xc).attr("x2", xc).attr("y1", m.t).attr("y2", H - m.b);
      svg.append("text").attr("class", "rot-corte").attr("x", xc + 4).attr("y", m.t + 10).text("proyección");
      svg.append("text").attr("class", "rot-corte").attr("x", xc - 4).attr("y", m.t + 10).attr("text-anchor", "end").text("estimación");
      svg.append("g").attr("class", "eje").attr("transform", "translate(0," + (H - m.b) + ")").call(d3.axisBottom(x).ticks(W < 500 ? 4 : 8).tickFormat(d3.format("d")).tickSize(3));
      svg.append("g").attr("class", "eje").attr("transform", "translate(" + m.l + ",0)").call(d3.axisLeft(y).ticks(6).tickSize(3));
      document.getElementById("tit-transicion").textContent = "Tasas brutas de natalidad y mortalidad (‰), " + nombre(T.a) + (B ? " y " + nombre(T.b) : "");
      document.getElementById("leyenda-transicion").innerHTML =
        '<span><i class="l" style="border-top-color:#2f6c8f"></i>Natalidad</span><span><i class="l" style="border-top-color:#9c3a1f"></i>Mortalidad</span>' +
        '<span><i style="background:#cfe0e8"></i>Crecimiento natural positivo</span><span><i style="background:#f1d2c3"></i>Negativo</span>' +
        (B ? '<span><i class="l d" style="border-top-color:#4b5a60"></i>' + RM.esc(nombre(T.b)) + "</span>" : "");

      // pequeños múltiplos
      const cont = document.getElementById("tr-pequenos"); cont.innerHTML = "";
      [["fecundidad", "Fecundidad (hijos por mujer)", 2], ["esperanza_vida", "Esperanza de vida al nacer (años)", 1], ["poblacion", "Población (millones)", 1]].forEach(([k, t]) => {
        const fig = document.createElement("figure");
        fig.innerHTML = "<figcaption>" + t + "</figcaption><svg></svg>";
        cont.appendChild(fig);
        const Ws = 320, Hs = 170, ms = { t: 8, r: 16, b: 22, l: 40 };
        const conv = (arr) => k === "poblacion" ? arr.map((v) => v == null ? null : v / 1000) : arr;
        const sa = conv(A[k]), sb = B ? conv(B[k]) : null;
        const xs = d3.scaleLinear().domain(d3.extent(anios)).range([ms.l, Ws - ms.r]);
        const vals = sa.concat(sb || []).filter((v) => v != null);
        const ys = d3.scaleLinear().domain([k === "esperanza_vida" ? Math.min(30, d3.min(vals)) : 0, d3.max(vals)]).nice().range([Hs - ms.b, ms.t]);
        const s = d3.select(fig.querySelector("svg")).attr("viewBox", [0, 0, Ws, Hs]);
        if (k === "fecundidad") s.append("line").attr("x1", ms.l).attr("x2", Ws - ms.r).attr("y1", ys(2.1)).attr("y2", ys(2.1)).attr("class", "corte");
        const l = (arr) => d3.line().defined((v) => v != null).x((v, i) => xs(anios[i])).y(ys)(arr);
        s.append("path").attr("d", l(sa)).attr("fill", "none").attr("stroke", "#1d2a30").attr("stroke-width", 2);
        if (sb) s.append("path").attr("d", l(sb)).attr("fill", "none").attr("stroke", "#a3245c").attr("stroke-width", 1.8).attr("stroke-dasharray", "5 3");
        s.append("line").attr("class", "corte").attr("x1", xs(A.ultimoObservado + 0.5)).attr("x2", xs(A.ultimoObservado + 0.5)).attr("y1", ms.t).attr("y2", Hs - ms.b);
        s.append("g").attr("class", "eje").attr("transform", "translate(0," + (Hs - ms.b) + ")").call(d3.axisBottom(xs).ticks(4).tickFormat(d3.format("d")).tickSize(3));
        s.append("g").attr("class", "eje").attr("transform", "translate(" + ms.l + ",0)").call(d3.axisLeft(ys).ticks(4).tickSize(3).tickFormat((v) => RM.formato(v, k === "fecundidad" ? 1 : 0)));
      });
      const ley = document.createElement("div"); ley.className = "leyenda-linea"; ley.style.gridColumn = "1 / -1";
      ley.innerHTML = '<span><i class="l" style="border-top-color:#1d2a30"></i>' + RM.esc(nombre(T.a)) + "</span>" +
        (B ? '<span><i class="l d" style="border-top-color:#a3245c"></i>' + RM.esc(nombre(T.b)) + "</span>" : "") +
        "<span>En la fecundidad, la línea punteada marca el nivel de reemplazo (2,1 hijos por mujer).</span>";
      cont.appendChild(ley);
      document.getElementById("fuente-transicion").textContent = "Fuente: " + fuenteWPP + ".";
    }
    repintar.transicion = pintarTransicion;

    // =====================================================================
    // Explorador de indicadores
    // =====================================================================
    const fuentes = [wpp].concat(wdi ? [wdi] : []);
    const IND = {};
    fuentes.forEach((f) => Object.entries(f.indicadores).forEach(([k, v]) => { IND[k] = Object.assign({}, v, { valores: f.valores[k] }); }));
    const aniosEx = wpp.anios.map(String);
    const proyectados = (wpp.proyectados || []).map(String);
    const X = Object.assign({ x: "fecundidad", y: "esperanza_vida", anio: "2024", elegido: null, rastro: false, play: null }, C.explorador || {});
    X.anio = String(X.anio);
    const sx = document.getElementById("ex-x"), sy = document.getElementById("ex-y");
    const opInd = (sel) => Object.entries(IND).filter(([k]) => k !== "poblacion").map(([k, v]) => '<option value="' + k + '"' + (k === sel ? " selected" : "") + ">" + RM.esc(v.nombre) + "</option>").join("");
    function rellenarEx() {
      sx.innerHTML = opInd(X.x); sy.innerHTML = opInd(X.y);
      document.getElementById("ex-anios").innerHTML = aniosEx.map((a) => '<button type="button" data-a="' + a + '" aria-pressed="' + (a === X.anio) + '">' + a + (proyectados.includes(a) ? "*" : "") + "</button>").join("");
      document.querySelectorAll("#ex-anios button").forEach((b) => b.addEventListener("click", () => { X.anio = b.dataset.a; rellenarEx(); pintarExplorador(true); }));
    }
    rellenarEx();
    sx.addEventListener("change", () => { X.x = sx.value; pintarExplorador(false); });
    sy.addEventListener("change", () => { X.y = sy.value; pintarExplorador(false); });
    document.getElementById("ex-rastro").addEventListener("change", (e) => { X.rastro = e.target.checked; pintarExplorador(false); });
    const playEx = document.getElementById("ex-play");
    playEx.addEventListener("click", () => {
      if (X.play) { clearInterval(X.play); X.play = null; playEx.textContent = "Reproducir"; return; }
      let i = aniosEx.indexOf(X.anio); if (i >= aniosEx.length - 1) i = -1;
      playEx.textContent = "Pausa";
      const paso = () => {
        i += 1; X.anio = aniosEx[i]; rellenarEx(); pintarExplorador(true);
        if (i >= aniosEx.length - 1) { clearInterval(X.play); X.play = null; playEx.textContent = "Reproducir"; }
      };
      paso(); X.play = setInterval(paso, reducido ? 1500 : 1100);
    });

    const valor = (k, id, a) => { const v = IND[k] && IND[k].valores[id] && IND[k].valores[id][a]; return v ? v : null; };
    const svgD = d3.select("#dispersion");
    const fichaF = RM.fichaFlotante();
    const colorRegion = (id) => (regionDe.get(id) || {}).color || "#b9c0bd";

    function escala(k, dominio, rango) {
      const log = IND[k].escala === "log";
      if (log) return d3.scaleLog().domain([Math.max(dominio[0], 1e-3) / 1.15, dominio[1] * 1.15]).range(rango);
      const e = (dominio[1] - dominio[0]) * 0.04, pct = /%/.test(IND[k].nombre);
      let d = d3.scaleLinear().domain([dominio[0] - e, dominio[1] + e]).nice().domain();
      if (dominio[0] >= 0) d[0] = Math.max(d[0], 0);
      if (pct && dominio[1] <= 100) d[1] = Math.min(d[1], 100);
      return d3.scaleLinear().domain(d).range(rango);
    }
    function pintarExplorador(animar) {
      const W = anchoDe("#dispersion", 340, 1100), H = Math.round(Math.min(560, Math.max(320, W * 0.55))), m = { t: 16, r: 18, b: 46, l: 58 };
      const ids = Object.keys(IND[X.x].valores).filter((id) => !AGR[id] && NOMBRE.has(id));
      const todos = ids.flatMap((id) => aniosEx.map((a) => [valor(X.x, id, a), valor(X.y, id, a)])).filter((p) => p[0] && p[1]);
      const dx = d3.extent(todos, (p) => p[0][0]), dy = d3.extent(todos, (p) => p[1][0]);
      const x = escala(X.x, dx, [m.l, W - m.r]);
      const y = escala(X.y, dy, [H - m.b, m.t]);
      const r = d3.scaleSqrt().domain([0, 1.45e6]).range([0, W < 500 ? 26 : 42]);
      svgD.attr("viewBox", [0, 0, W, H]);
      if (svgD.select("g.ejes").empty()) {
        svgD.append("text").attr("class", "anio-fondo");
        svgD.append("g").attr("class", "ejes");
        svgD.append("g").attr("class", "rastros");
        svgD.append("g").attr("class", "burbujas");
        svgD.append("g").attr("class", "rotulos");
      }
      svgD.select(".anio-fondo").attr("x", W - m.r - 8).attr("y", H - m.b - 14).attr("text-anchor", "end").attr("font-size", Math.round(W / 9)).text(X.anio + (proyectados.includes(X.anio) ? "*" : ""));
      const ejes = svgD.select("g.ejes"); ejes.selectAll("*").remove();
      ejes.append("g").attr("class", "eje").attr("transform", "translate(0," + (H - m.b) + ")").call(d3.axisBottom(x).ticks(W < 500 ? 4 : 8, IND[X.x].escala === "log" ? "~s" : undefined).tickSize(-(H - m.b - m.t)))
        .call((g) => g.selectAll(".tick line").style("stroke", "#e3e7e5"));
      ejes.append("g").attr("class", "eje").attr("transform", "translate(" + m.l + ",0)").call(d3.axisLeft(y).ticks(6, IND[X.y].escala === "log" ? "~s" : undefined).tickSize(-(W - m.l - m.r)))
        .call((g) => g.selectAll(".tick line").style("stroke", "#e3e7e5"));
      ejes.append("text").attr("class", "rot region").attr("x", W - m.r).attr("y", H - 8).attr("text-anchor", "end").text(IND[X.x].nombre);
      ejes.append("text").attr("class", "rot region").attr("x", m.l).attr("y", m.t - 4).text(IND[X.y].nombre);

      const puntos = ids.map((id) => {
        const vx = valor(X.x, id, X.anio), vy = valor(X.y, id, X.anio), vp = valor("poblacion", id, X.anio);
        return vx && vy ? { id, x: vx[0], y: vy[0], ax: vx[1], ay: vy[1], p: vp ? vp[0] : 0 } : null;
      }).filter(Boolean).sort((a, b) => b.p - a.p);
      const t = svgD.transition().duration(animar && !reducido ? 900 : 0).ease(d3.easeCubicInOut);
      const sel = svgD.select("g.burbujas").selectAll("circle").data(puntos, (d) => d.id);
      sel.exit().transition(t).attr("r", 0).remove();
      sel.enter().append("circle").attr("class", "burbuja").attr("cx", (d) => x(d.x)).attr("cy", (d) => y(d.y)).attr("r", 0)
        .on("mousemove", (ev, d) => fichaF.mostrar("<strong>" + RM.esc(nombre(d.id)) + "</strong>" + RM.esc(IND[X.x].nombre) + ": " + RM.formato(d.x, d.x < 100 ? 1 : 0) + (d.ax != +X.anio ? " (" + d.ax + ")" : "") +
          "<br>" + RM.esc(IND[X.y].nombre) + ": " + RM.formato(d.y, d.y < 100 ? 1 : 0) + (d.ay != +X.anio ? " (" + d.ay + ")" : "") +
          "<br>Población: " + (d.p >= 1000 ? f1(d.p / 1000) + " millones" : f0(d.p) + " mil") + "<br>" + RM.esc((regionDe.get(d.id) || { titulo: "Fuera del temario" }).titulo), ev))
        .on("mouseleave", () => fichaF.ocultar())
        .on("click", (ev, d) => { X.elegido = X.elegido === d.id ? null : d.id; pintarExplorador(false); })
        .merge(sel)
        .attr("fill", (d) => colorRegion(d.id))
        .classed("fuera", (d) => !enRegion.has(d.id) && d.id !== X.elegido)
        .classed("elegida", (d) => d.id === X.elegido)
        .transition(t).attr("cx", (d) => x(d.x)).attr("cy", (d) => y(d.y)).attr("r", (d) => Math.max(2.5, r(d.p)));
      svgD.select("g.burbujas").selectAll("circle").sort((a, b) => b.p - a.p);

      // rótulos: los países más poblados de la región y el elegido
      // rótulos sin solapes: se recorren por población y se descartan los que chocan con uno ya puesto
      const candidatos = (X.elegido ? puntos.filter((d) => d.id === X.elegido) : []).concat(puntos.filter((d) => enRegion.has(d.id) && d.id !== X.elegido && d.p >= 1500));
      const puestos = [];
      const rotular = new Set();
      candidatos.forEach((d) => {
        const px = x(d.x), py = y(d.y), ancho = nombre(d.id).length * 6.2;
        if (rotular.size >= (W < 500 ? 5 : 10)) return;
        if (puestos.some((q) => Math.abs(q[1] - py) < 13 && px < q[0] + q[2] + 6 && px + ancho + 6 > q[0])) return;
        puestos.push([px, py, ancho]); rotular.add(d.id);
      });
      const rot = svgD.select("g.rotulos").selectAll("text").data(puntos.filter((d) => rotular.has(d.id)), (d) => d.id);
      rot.exit().remove();
      rot.enter().append("text").attr("class", "rotulo-b").attr("x", (d) => x(d.x)).attr("y", (d) => y(d.y)).merge(rot)
        .text((d) => nombre(d.id)).transition(t).attr("x", (d) => x(d.x) + Math.max(2.5, r(d.p)) + 3).attr("y", (d) => y(d.y) + 4);

      // trayectoria
      const gR = svgD.select("g.rastros"); gR.selectAll("*").remove();
      if (X.rastro && X.elegido) {
        const pts = aniosEx.map((a) => [valor(X.x, X.elegido, a), valor(X.y, X.elegido, a), a]).filter((p) => p[0] && p[1]);
        gR.append("path").attr("class", "rastro").attr("d", d3.line()(pts.map((p) => [x(p[0][0]), y(p[1][0])])));
        gR.selectAll("text").data(pts).join("text").attr("class", "rotulo-b").attr("x", (p) => x(p[0][0]) + 4).attr("y", (p) => y(p[1][0]) - 4).text((p) => p[2]);
      }

      // leyenda por regiones del temario
      document.getElementById("leyenda-dispersion").innerHTML = catalogo.regiones.map((rg) => '<span><i style="background:' + rg.color + ';border-radius:50%"></i>' + rg.capitulo + ". " + RM.esc(rg.titulo) + "</span>").join("") +
        '<span><i style="background:#b9c0bd;border-radius:50%"></i>Fuera del temario</span>' +
        (proyectados.includes(X.anio) ? "<span>* Proyección de Naciones Unidas: solo indicadores demográficos.</span>" : "");
      pintarMapaEx();
      document.getElementById("fuente-ex").textContent = "Fuentes: " + [IND[X.x].fuente, IND[X.y].fuente].filter((v, i, a) => a.indexOf(v) === i).join("; ") + ". Los círculos de " + R.ficha.titulo + " aparecen destacados.";
    }

    // mapa del indicador vertical
    const proyM = d3.geoEqualEarth().rotate([-10, 0]);
    const WM = 900, HM = 440;
    proyM.fitExtent([[4, 4], [WM - 4, HM - 4]], { type: "Sphere" });
    const rutaM = d3.geoPath(proyM);
    const svgM = d3.select("#mapa-ex").attr("viewBox", [0, 0, WM, HM]);
    svgM.append("path").attr("d", rutaM({ type: "Sphere" })).attr("fill", "var(--mar)");
    const gM = svgM.append("g");
    const COLS = ["#e9eef0", "#c3d6de", "#8fb3c4", "#5a8aa6", "#2f5d80", "#173a57"];
    function pintarMapaEx() {
      const k = X.y;
      const vals = Object.keys(IND[k].valores).filter((id) => !AGR[id]).map((id) => valor(k, id, X.anio)).filter(Boolean).map((v) => v[0]).sort(d3.ascending);
      const cortes = [0.2, 0.4, 0.6, 0.8].map((q) => d3.quantile(vals, q));
      const color = (v) => v == null ? "#f1f2ee" : COLS[1 + d3.bisectRight(cortes, v)];
      gM.selectAll("path").data(geo.filter((f) => f.properties.id !== "ATA")).join("path").attr("d", rutaM).attr("class", (f) => "pais-p" + (enRegion.has(f.properties.id) ? " region" : ""))
        .attr("fill", (f) => { const v = valor(k, f.properties.id, X.anio); return color(v ? v[0] : null); })
        .on("mousemove", (ev, f) => { const v = valor(k, f.properties.id, X.anio); fichaF.mostrar("<strong>" + RM.esc(f.properties.nombre) + "</strong>" + (v ? RM.esc(IND[k].nombre) + ": " + RM.formato(v[0], v[0] < 100 ? 1 : 0) + " (" + v[1] + ")" : "Sin datos"), ev); })
        .on("mouseleave", () => fichaF.ocultar());
      document.getElementById("tit-mapa-ex").textContent = IND[k].nombre + " en " + X.anio + " (quintiles)";
      const lim = [vals[0]].concat(cortes, [vals[vals.length - 1]]);
      document.getElementById("leyenda-mapa-ex").innerHTML = [1, 2, 3, 4, 5].map((i) => '<span><i style="background:' + COLS[i] + '"></i>' + RM.formato(lim[i - 1], lim[i - 1] < 100 ? 1 : 0) + " a " + RM.formato(lim[i], lim[i] < 100 ? 1 : 0) + "</span>").join("") +
        '<span><i style="background:#f1f2ee"></i>Sin datos</span>';
    }
    repintar.explorador = () => pintarExplorador(false);

    // =====================================================================
    // Preguntas
    // =====================================================================
    if (preguntas) {
      const cont = document.getElementById("cuestionario");
      const ir = document.createElement("p");
      cont.parentNode.insertBefore(ir, cont);
      new RM.Cuestionario(cont, preguntas.preguntas, {
        clave: "poblacion:" + R.ficha.id,
        alMostrar: (q) => {
          const v = q.vista; ir.innerHTML = "";
          if (!v) return;
          const b = document.createElement("button");
          b.type = "button"; b.className = "principal";
          b.textContent = v.pestana === "piramides" ? "Abrir la pirámide de " + nombre(v.pais) : v.pestana === "transicion" ? "Abrir la transición de " + nombre(v.pais) : "Abrir el explorador";
          b.addEventListener("click", () => {
            if (v.pestana === "piramides") { P.a = v.pais; P.b = v.comparar || ""; P.anio = v.anio || P.anio; rellenarPir(); }
            if (v.pestana === "transicion") { T.a = v.pais; T.b = v.comparar || ""; rellenarTr(); }
            if (v.pestana === "explorador") { X.x = v.x || X.x; X.y = v.y || X.y; X.anio = String(v.anio || X.anio); X.elegido = v.pais || null; X.rastro = !!v.rastro; document.getElementById("ex-rastro").checked = X.rastro; rellenarEx(); }
            abrir(v.pestana); window.scrollTo({ top: 0 });
          });
          ir.appendChild(b);
        },
      });
    } else document.getElementById("t-preguntas").hidden = true;

    pintarPiramide();
    const h = location.hash.slice(1);
    if (tabs.includes(h)) abrir(h);
  } catch (e) {
    RM.error(main, e);
  }
})();
