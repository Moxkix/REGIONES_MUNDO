/* Motor «Ciudades y redes urbanas»: mapa de ciudades, jerarquía urbana (rango-tamaño),
   urbanización, el manual frente a los datos y preguntas.
   Lee la sección "ciudades" de regiones/<id>/config.json.
   Datos compartidos: datos/ciudades/*.json (World Urbanization Prospects 2025) y datos/poblacion/<ID>.json (WPP 2024).
   Una región puede usar sus propias ciudades con "archivo" (misma estructura que datos/ciudades/ciudades.json; un séptimo
   campo opcional guarda el nombre oficial) y ajustar "periodos" (variación del mapa), "tramos" (ficha de cada ciudad)
   y "umbralJerarquia" (miles de habitantes); "ventana" encuadra el mapa urbano en una parte de la región. Así lo hace Norteamérica con las áreas metropolitanas oficiales. */
(async function () {
  "use strict";
  const barra = document.getElementById("barra");
  const main = document.getElementById("ciudades");
  let R;
  try { R = await RM.region(); } catch (e) { RM.cabecera(barra); RM.error(main, e); return; }
  RM.cabecera(barra, R.ficha, "ciudades", R.ficha.motores);
  document.title = "Ciudades y redes urbanas. " + R.ficha.titulo;
  const C = R.config.ciudades || {};
  const carpeta = (r) => R.carpeta + r;
  const f0 = (n) => RM.formato(n, 0), f1 = (n) => RM.formato(n, 1), f2 = (n) => RM.formato(n, 2);
  const PALETA = ["#a3245c", "#2f6c8f", "#c98a2b", "#2f6b4f", "#6a4c93", "#9c3a1f", "#4b5a60", "#d1609a", "#5aa0c8", "#8a9a3a"];

  try {
    const [mundo, D, U, T, preguntas, propios] = await Promise.all([
      RM.json("datos/mundo/paises-50m.json"), RM.json(C.archivo ? carpeta(C.archivo) : "datos/ciudades/ciudades.json"),
      RM.json("datos/ciudades/urbanizacion.json"), RM.json("datos/ciudades/tamano.json"),
      C.cuestionario ? RM.json(carpeta(C.cuestionario)).catch(() => null) : Promise.resolve(null),
      C.datos ? RM.json(carpeta(C.datos)).catch(() => null) : Promise.resolve(null),
    ]);
    const geo = topojson.feature(mundo, mundo.objects.paises).features;
    const NOMBRE = new Map(geo.map((f) => [f.properties.id, f.properties.nombre]));
    Object.entries(U.agregados).forEach(([k, v]) => NOMBRE.set(k, v));
    NOMBRE.set(R.ficha.id, R.ficha.titulo);
    const nombre = (id) => NOMBRE.get(id) || id;

    const Y = D.anios, iy = (y) => Y.indexOf(+y), ULT = D.ultimoEstimado || 2025;
    const REGION = C.paises || R.ficha.paises;
    const todas = D.ciudades.map((c, i) => ({ i, pais: c[0], nombre: c[1], lon: c[2], lat: c[3], cap: !!c[4], v: c[5], oficial: c[6], clave: c[0] + "|" + c[1] }));
    // Periodos de variación del mapa y de la ficha de cada ciudad (configurables para series más cortas)
    const PERIODOS = C.periodos || [[2000, 2025], [1975, 2000]];
    const TRAMOS = C.tramos || [[1975, 2000], [2000, 2025], [2025, 2050]];
    const UMBRAL_J = C.umbralJerarquia || 100;  // miles de habitantes
    const hayProy = Y[Y.length - 1] > ULT;
    const ciudades = todas.filter((c) => REGION.includes(c.pais));
    const porClave = new Map(ciudades.map((c) => [c.clave, c]));
    const val = (c, y) => c.v[iy(y)];
    const fuenteC = '<a href="' + D.url + '">' + RM.esc(D.fuente) + "</a>";
    const ficha = RM.fichaFlotante();
    const habitantes = (miles) => miles >= 1000 ? f2(miles / 1000) + " millones" : f0(miles * 1000);

    // ---------- Pestañas ----------
    const tabs = ["mapa", "jerarquia", "urbanizacion", "manual", "preguntas"];
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

    function botonesAnio(el, anios, actual, alElegir) {
      el.innerHTML = anios.map((y) => '<button type="button" data-a="' + y + '" aria-pressed="' + (+y === +actual) + '"' +
        (y > ULT ? ' title="Proyección"' : "") + ">" + y + (y > ULT ? "*" : "") + "</button>").join("");
      el.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
        el.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
        alElegir(+b.dataset.a);
      }));
    }
    const marcarAnio = (el, y) => el.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", +x.dataset.a === +y ? "true" : "false"));

    // =====================================================================
    // Mapa urbano
    // =====================================================================
    const M = { anio: ULT, color: String(PERIODOS[0][0]), elegida: null };
    document.getElementById("mapa-color").innerHTML = '<legend class="oculto">Color de los círculos</legend>' + PERIODOS.map((p, i) =>
      '<label><input type="radio" name="color-c" value="' + p[0] + '"' + (i ? "" : " checked") + ">Variación " + p[0] + "-" + p[1] + "</label>").join("");
    const periodo = () => PERIODOS.find((p) => String(p[0]) === M.color) || PERIODOS[0];
    const mapa = new RM.Mapa(document.getElementById("mapa-ciudades"), C.ventana ? Object.assign({}, R.config, { ventana: C.ventana }) : R.config, mundo, { ancho: 1000, zoom: true });
    mapa.fronteras(mapa.capa("fronteras"));
    const gTraz = mapa.capa("trazados"), gCirc = mapa.capa("circulos"), gRot = mapa.capa("rotulos");
    const maxPob = d3.max(ciudades, (c) => d3.max(c.v)) || 1;
    const radio = d3.scaleSqrt().domain([0, maxPob]).range([0, Math.max(18, Math.min(30, 30 * Math.sqrt(maxPob / 15000)))]);
    const CORTES = [-20, -5, 5, 25, 50];
    const COLORES = ["#9c3a1f", "#d9906f", "#e9e4d6", "#a9c8d6", "#5c97b5", "#1f5a7a"];
    const colorVar = d3.scaleThreshold().domain(CORTES).range(COLORES);
    function variacion(c) {
      const [a, b] = periodo();
      const va = val(c, a), vb = val(c, b);
      if (va == null && vb == null) return null;
      if (va == null) return 999;
      if (vb == null) return -99;
      return (vb - va) / va * 100;
    }
    const enMapa = (c) => {
      const p = mapa.proy([c.lon, c.lat]);
      return p && p[0] >= -5 && p[0] <= mapa.W + 5 && p[1] >= -5 && p[1] <= mapa.H + 5 ? p : null;
    };
    ciudades.forEach((c) => { c.xy = enMapa(c); });

    // trazados opcionales (megalópolis, ejes, ferrocarriles)
    const trazados = (C.trazados || []).filter((t) => RM.enVista(t));
    const elTraz = document.getElementById("mapa-trazados");
    elTraz.innerHTML = trazados.map((t, i) => '<label><input type="checkbox" data-t="' + i + '"' + (t.visible ? " checked" : "") + "> " + RM.esc(t.nombre) + "</label>").join("");
    function pintarTrazados() {
      gTraz.selectAll("*").remove();
      elTraz.querySelectorAll("input").forEach((inp) => {
        if (!inp.checked) return;
        const t = trazados[+inp.dataset.t];
        const coords = t.tipo === "area" ? t.coords.concat([t.coords[0]]) : t.coords;
        const d = "M" + coords.map((p) => mapa.proy(p).join(",")).join("L") + (t.tipo === "area" ? "Z" : "");
        gTraz.append("path").attr("class", "trazado" + (t.tipo === "area" ? " area" : "")).attr("d", d).append("title").text(t.nota || t.nombre);
        const p0 = mapa.proy(t.rotulo || t.coords[0]);
        gTraz.append("text").attr("class", "rot-trazado").attr("x", p0[0]).attr("y", p0[1] - 6).attr("font-size", 12 / mapa.k).text(t.nombre);
      });
    }
    elTraz.addEventListener("change", pintarTrazados);

    function pintarMapa() {
      const k = mapa.k || 1;
      const visibles = ciudades.filter((c) => c.xy && val(c, M.anio) != null).sort((a, b) => val(b, M.anio) - val(a, M.anio));
      gCirc.selectAll("circle").data(visibles, (c) => c.clave).join("circle")
        .attr("class", (c) => "circ" + (c.cap ? " capital" : "") + (M.elegida === c ? " elegida" : ""))
        .attr("cx", (c) => c.xy[0]).attr("cy", (c) => c.xy[1])
        .attr("r", (c) => Math.max(1.6, radio(val(c, M.anio))) / Math.sqrt(k))
        .attr("fill", (c) => { const g = variacion(c); return g == null ? "#ccc" : colorVar(g); })
        .on("mousemove", (ev, c) => ficha.mostrar(fichaHTML(c), ev))
        .on("mouseleave", () => ficha.ocultar())
        .on("click", (ev, c) => elegir(c));
      // rótulos sin solaparse
      const umbral = C.etiquetas || 1000, fs = 11 / k, ocupado = [];
      const cand = visibles.filter((c) => val(c, M.anio) >= umbral / Math.max(1, k * k) || (c.cap && val(c, M.anio) >= 250 / k) || c === M.elegida);
      const rot = [];
      cand.forEach((c) => {
        const r = Math.max(1.6, radio(val(c, M.anio))) / Math.sqrt(k);
        const w = c.nombre.length * fs * .56, h = fs * 1.1;
        const caja = [c.xy[0] + r + 2 / k, c.xy[1] - h / 2, c.xy[0] + r + 2 / k + w, c.xy[1] + h / 2];
        if (caja[2] > mapa.W) { caja[0] = c.xy[0] - r - 2 / k - w; caja[2] = c.xy[0] - r - 2 / k; }
        if (ocupado.some((o) => !(caja[2] < o[0] || caja[0] > o[2] || caja[3] < o[1] || caja[1] > o[3]))) return;
        ocupado.push(caja); rot.push({ c, x: caja[0], y: c.xy[1] + fs * .35 });
      });
      gRot.selectAll("text").data(rot, (d) => d.c.clave).join("text")
        .attr("class", (d) => "rot-ciudad" + (d.c.cap ? " capital" : "")).attr("x", (d) => d.x).attr("y", (d) => d.y)
        .attr("font-size", fs).text((d) => d.c.nombre);
      document.getElementById("tit-ranking").textContent = "Las mayores ciudades en " + M.anio + (M.anio > ULT ? " (proyección)" : "") + " · millones de hab. (oscuras: capitales)";
      pintarRanking(visibles);
      leyendaMapa();
    }
    mapa.alZoom = () => { clearTimeout(mapa._t); mapa._t = setTimeout(() => { pintarMapa(); pintarTrazados(); }, 80); };
    document.getElementById("mapa-mas").addEventListener("click", () => mapa.acercar(1.6));
    document.getElementById("mapa-menos").addEventListener("click", () => mapa.acercar(1 / 1.6));
    document.getElementById("mapa-inicio").addEventListener("click", () => mapa.restablecer());

    function fichaHTML(c) {
      const g = variacion(c);
      return "<strong>" + RM.esc(c.nombre) + "</strong>" + RM.esc(nombre(c.pais)) + (c.cap ? " · capital" : "") + "<br>" +
        M.anio + ": " + (val(c, M.anio) != null ? habitantes(val(c, M.anio)) + " hab." : "sin dato") +
        (c.oficial ? '<br><span class="pais">' + RM.esc(c.oficial) + "</span>" : "") +
        (g == null ? "" : "<br>" + periodo().join("-") + ": " + (g === 999 ? "ciudad nueva (no llegaba a 50.000)" : g === -99 ? "baja de 50.000 hab." : (g > 0 ? "+" : "") + f0(g) + " %"));
    }

    function leyendaMapa() {
      const txt = ["menos de −20 %", "−20 a −5 %", "−5 a +5 %", "+5 a +25 %", "+25 a +50 %", "más de +50 % o ciudad nueva"];
      document.getElementById("leyenda-mapa-ciudades").innerHTML =
        "<span><b>Variación " + periodo().join("-") + ":</b></span>" +
        COLORES.map((c, i) => '<span><i style="background:' + c + '"></i>' + txt[i] + "</span>").join("") +
        '<span><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5.5" fill="#fff" stroke="#1d2a30" stroke-width="1.6"/></svg> capital</span>' +
        "<span>El tamaño del círculo es proporcional a la población del año elegido.</span>";
    }

    function pintarRanking(visibles) {
      const top = visibles.slice(0, 15);
      const W = 420, fila = 22, izq = 150, H = top.length * fila + 8;
      const x = d3.scaleLinear().domain([0, d3.max(top, (c) => val(c, M.anio)) || 1]).range([izq, W - 50]);
      const svg = d3.select("#ranking-ciudades").attr("viewBox", [0, 0, W, H]);
      svg.selectAll("*").remove();
      const g = svg.selectAll("g").data(top).join("g").attr("transform", (c, i) => "translate(0," + (i * fila + 4) + ")")
        .style("cursor", "pointer").on("click", (ev, c) => elegir(c));
      g.append("text").attr("class", "rot").attr("x", izq - 6).attr("y", 13).attr("text-anchor", "end")
        .text((c) => c.nombre.length > 22 ? c.nombre.slice(0, 21) + "…" : c.nombre).append("title").text((c) => c.nombre + " (" + nombre(c.pais) + ")");
      g.append("rect").attr("class", (c) => "barra-c" + (c.cap ? " capital" : "") + (M.elegida === c ? " elegida" : ""))
        .attr("x", izq).attr("y", 3).attr("height", 14).attr("width", (c) => Math.max(1, x(val(c, M.anio)) - izq));
      g.append("text").attr("class", "rot valor").attr("x", (c) => x(val(c, M.anio)) + 5).attr("y", 14).text((c) => f1(val(c, M.anio) / 1000));
    }

    function elegir(c) {
      M.elegida = c;
      pintarMapa();
      const el = document.getElementById("ficha-ciudad");
      const pts = Y.map((y, i) => ({ y, v: c.v[i] })).filter((d) => d.v != null);
      el.innerHTML = "<h3>" + RM.esc(c.nombre) + '</h3><p class="pais">' + RM.esc(nombre(c.pais)) + (c.cap ? " · capital" : "") + (c.oficial ? "<br>" + RM.esc(c.oficial) : "") + "</p>" +
        '<svg id="serie-ciudad" role="img" aria-label="Evolución de la población de ' + RM.esc(c.nombre) + '"></svg>' +
        '<dl class="indicadores">' + TRAMOS.map(([a, b]) => {
          const va = val(c, a), vb = val(c, b);
          return "<div><dt>" + a + "-" + b + (b > ULT ? " (proy.)" : "") + "</dt><dd>" + (va && vb ? ((vb >= va ? "+" : "") + f0((vb - va) / va * 100) + " %") : "—") + "</dd></div>";
        }).join("") + "</dl>";
      const W = 420, H = 170, m = { l: 44, r: 18, t: 12, b: 24 };
      const x = d3.scaleLinear().domain([Y[0], Y[Y.length - 1]]).range([m.l, W - m.r]);
      const y = d3.scaleLinear().domain([0, d3.max(pts, (d) => d.v) * 1.1]).nice().range([H - m.b, m.t]);
      const svg = d3.select("#serie-ciudad").attr("viewBox", [0, 0, W, H]);
      if (hayProy) {
        svg.append("rect").attr("class", "zona-proy").attr("x", x(ULT)).attr("y", m.t).attr("width", x(Y[Y.length - 1]) - x(ULT)).attr("height", H - m.b - m.t);
        svg.append("text").attr("class", "rot-proy").attr("x", x(ULT) + 4).attr("y", m.t + 10).text("proyección");
      }
      svg.append("g").attr("class", "eje").attr("transform", "translate(0," + (H - m.b) + ")").call(d3.axisBottom(x).tickValues(Y).tickFormat(d3.format("d")).tickSizeOuter(0));
      svg.append("g").attr("class", "eje").attr("transform", "translate(" + m.l + ",0)").call(d3.axisLeft(y).ticks(4).tickFormat((d) => d === 0 ? "0" : d >= 1000 ? f1(d / 1000) + " M" : f0(d) + " k"));
      const lin = d3.line().x((d) => x(d.y)).y((d) => y(d.v));
      svg.append("path").attr("class", "serie-c").attr("d", lin(pts.filter((d) => d.y <= ULT)));
      svg.append("path").attr("class", "serie-c proy").attr("d", lin(pts.filter((d) => d.y >= ULT)));
      svg.selectAll("circle").data(pts).join("circle").attr("class", "punto-c").attr("cx", (d) => x(d.y)).attr("cy", (d) => y(d.v)).attr("r", 3)
        .append("title").text((d) => d.y + ": " + habitantes(d.v) + " hab.");
    }

    botonesAnio(document.getElementById("mapa-anios"), Y, M.anio, (a) => { M.anio = a; pintarMapa(); });
    document.querySelectorAll('input[name="color-c"]').forEach((i) => i.addEventListener("change", () => { M.color = i.value; pintarMapa(); }));
    document.getElementById("fuente-mapa").innerHTML = "Fuente: " + fuenteC + ". " + RM.esc(D.nota) + " " + RM.esc(D.notaMapa || "Se muestran las ciudades de 100.000 habitantes o más en algún año.");
    pintarTrazados();
    pintarMapa();
    document.getElementById("ficha-ciudad").innerHTML = '<p class="vacio">Pulsad una ciudad en el mapa o en la lista para ver su evolución desde ' + Y[0] + '.</p>';

    // =====================================================================
    // Jerarquía urbana
    // =====================================================================
    const J = { a: C.porDefecto || REGION[0], b: C.comparar || "", anio: ULT };
    const paisesJ = REGION.filter((p) => ciudades.filter((c) => c.pais === p && (val(c, ULT) || 0) >= UMBRAL_J).length >= 2)
      .sort((u, w) => nombre(u).localeCompare(nombre(w), "es"));
    const selJA = document.getElementById("je-a"), selJB = document.getElementById("je-b");
    const opcJ = (sel, vacio) => (vacio ? '<option value="">Ninguno</option>' : "") +
      paisesJ.map((p) => '<option value="' + p + '"' + (p === sel ? " selected" : "") + ">" + RM.esc(nombre(p)) + "</option>").join("");
    selJA.innerHTML = opcJ(J.a); selJB.innerHTML = opcJ(J.b, true);
    selJA.addEventListener("change", () => { J.a = selJA.value; pintarJerarquia(); });
    selJB.addEventListener("change", () => { J.b = selJB.value; pintarJerarquia(); });
    botonesAnio(document.getElementById("je-anios"), Y, J.anio, (a) => { J.anio = a; pintarJerarquia(); });
    const pobTotal = {};
    async function totalPais(p, y) {
      if (!(p in pobTotal)) pobTotal[p] = await RM.json("datos/poblacion/" + p + ".json").catch(() => null);
      const d = pobTotal[p];
      return d ? d.poblacion[y - d.anios[0]] : null;
    }
    const lista = (p, y) => ciudades.filter((c) => c.pais === p && (val(c, y) || 0) >= UMBRAL_J).sort((u, w) => val(w, y) - val(u, y));
    function tipoRed(l, y) {
      if (l.length < 2) return { prim: null, i4: null, txt: "Solo una ciudad supera los " + f0(UMBRAL_J * 1000) + " habitantes: no hay red que comparar." };
      const P = l.map((c) => val(c, y));
      const prim = P[0] / P[1], i4 = l.length >= 4 ? P[0] / (P[1] + P[2] + P[3]) : null, p23 = P.length >= 3 ? P[1] / P[2] : null;
      let txt;
      if (prim >= 2.5) txt = "Macrocefalia: la primera ciudad multiplica por " + f1(prim) + " a la segunda (modelo parisino).";
      else if (prim >= 1.6) txt = "Jerarquía próxima a la regla rango-tamaño: la primera ciudad dobla aproximadamente a la segunda.";
      else if (p23 != null && p23 >= 1.6) txt = "Red bicéfala: dos ciudades de tamaño parecido destacan sobre las demás.";
      else txt = "Red policéntrica: varias ciudades grandes de tamaño parecido, sin una dominante (modelo renano).";
      return { prim, i4, txt };
    }
    async function pintarJerarquia() {
      const y = J.anio;
      const series = [J.a, J.b].filter(Boolean).map((p, k) => ({ p, k, l: lista(p, y) }));
      const W = 640, H = 420, m = { l: 62, r: 16, t: 14, b: 40 };
      const nMax = d3.max(series, (s) => s.l.length) || 2;
      const vMax = d3.max(series, (s) => s.l.length ? val(s.l[0], y) : 0) || 1000;
      const x = d3.scaleLog().domain([1, Math.max(10, nMax * 1.15)]).range([m.l, W - m.r]);
      const yS = d3.scaleLog().domain([UMBRAL_J * 0.9, vMax * 1.3]).range([H - m.b, m.t]);
      const svg = d3.select("#rango").attr("viewBox", [0, 0, W, H]);
      svg.selectAll("*").remove();
      svg.append("g").attr("class", "eje").attr("transform", "translate(0," + (H - m.b) + ")")
        .call(d3.axisBottom(x).tickValues([1, 2, 3, 5, 10, 20, 50, 100].filter((t) => t <= x.domain()[1])).tickFormat(d3.format("d")));
      svg.append("g").attr("class", "eje").attr("transform", "translate(" + m.l + ",0)")
        .call(d3.axisLeft(yS).tickValues([100, 200, 500, 1000, 2000, 5000, 10000, 20000].filter((t) => t >= yS.domain()[0] && t <= yS.domain()[1])).tickFormat((d) => d >= 1000 ? f0(d / 1000) + " M" : f0(d) + " k"));
      svg.append("text").attr("class", "rot").attr("x", W - m.r).attr("y", H - 6).attr("text-anchor", "end").text("Puesto de la ciudad en su país");
      svg.append("text").attr("class", "rot").attr("x", 12).attr("y", m.t + 4).attr("transform", "rotate(-90 12 " + (m.t + 4) + ")").attr("text-anchor", "end").text("Habitantes");
      series.forEach((s) => {
        if (!s.l.length) return;
        const P1 = val(s.l[0], y), lado = s.k ? "b" : "a";
        const rs = d3.range(1, Math.max(2, s.l.length) + 1).filter((r) => P1 / r >= UMBRAL_J * 0.9 && r <= x.domain()[1]);
        svg.append("path").attr("class", "zipf " + lado).attr("d", d3.line().x((r) => x(r)).y((r) => yS(P1 / r))(rs));
        svg.append("g").selectAll("circle").data(s.l).join("circle").attr("class", "pt-" + lado)
          .attr("cx", (c, i) => x(i + 1)).attr("cy", (c) => yS(val(c, y))).attr("r", 4.5)
          .on("mousemove", (ev, c) => ficha.mostrar("<strong>" + RM.esc(c.nombre) + "</strong>" + RM.esc(nombre(c.pais)) + "<br>Puesto " + (s.l.indexOf(c) + 1) + " · " + habitantes(val(c, y)) + " hab.<br>Regla rango-tamaño: " + habitantes(P1 / (s.l.indexOf(c) + 1)), ev))
          .on("mouseleave", () => ficha.ocultar());
        s.l.slice(0, 3).forEach((c, i) => svg.append("text").attr("class", "rot").attr("x", x(i + 1) + 7).attr("y", yS(val(c, y)) - 6 + (s.k ? 14 : 0)).text(c.nombre));
      });
      document.getElementById("leyenda-rango").innerHTML = series.map((s) =>
        '<span><i style="background:' + (s.k ? "#2f6c8f" : "#a3245c") + ';border-radius:50%"></i>' + RM.esc(nombre(s.p)) + "</span>" +
        '<span><i class="l d" style="border-color:' + (s.k ? "#2f6c8f" : "#a3245c") + '"></i>regla rango-tamaño</span>').join("");
      const tarjetas = await Promise.all(series.map(async (s) => {
        const t = tipoRed(s.l, y), tot = await totalPais(s.p, y);
        const P1 = s.l.length ? val(s.l[0], y) : null;
        return '<div class="tarjeta-red' + (s.k ? " b" : "") + '"><h3>' + RM.esc(nombre(s.p)) + " · " + y + (y > ULT ? " (proyección)" : "") + "</h3>" +
          '<p class="tipo">' + RM.esc(t.txt) + "</p>" +
          '<dl class="indicadores"><div><dt>Ciudades de ' + f0(UMBRAL_J * 1000) + ' hab. o más</dt><dd>' + s.l.length + "</dd></div>" +
          "<div><dt>Índice de primacía</dt><dd>" + (t.prim ? f2(t.prim) : "—") + "</dd></div>" +
          "<div><dt>Índice de las cuatro ciudades</dt><dd>" + (t.i4 ? f2(t.i4) : "—") + "</dd></div>" +
          "<div><dt>La mayor, sobre la población del país</dt><dd>" + (P1 && tot ? f1(P1 / tot * 100) + " %" : "—") + "</dd></div></dl>" +
          "<ol>" + s.l.slice(0, 8).map((c) => "<li>" + RM.esc(c.nombre) + " <small>" + f1(val(c, y) / 1000) + " M</small></li>").join("") + "</ol></div>";
      }));
      document.getElementById("je-indicadores").innerHTML = tarjetas.join("");
    }
    repintar.jerarquia = pintarJerarquia;
    document.getElementById("fuente-jerarquia").innerHTML = "Fuente: " + fuenteC + "; población de los países: Naciones Unidas, World Population Prospects 2024. " +
      RM.esc(D.notaJerarquia || "Las ciudades se delimitan con el grado de urbanización, no con los límites municipales.");
    const elUmbral = document.getElementById("je-umbral");
    if (elUmbral) elUmbral.textContent = f0(UMBRAL_J * 1000);

    // =====================================================================
    // Urbanización
    // =====================================================================
    const CU = C.urbanizacion || {};
    const UA = U.anios;
    const elegidas = new Set(CU.porDefecto || [R.ficha.id, "WLD"]);
    const grupos = [
      ["Conjuntos", (CU.agregados || [R.ficha.id, "EUR", "WLD"]).filter((k) => U.series[k])],
      ["Países de la región", REGION.filter((p) => U.series[p]).sort((u, w) => nombre(u).localeCompare(nombre(w), "es"))],
      ["Otros países", (CU.comparadores || ["USA", "CHN", "JPN", "IND", "BRA"]).filter((k) => U.series[k])],
    ];
    const colorSerie = new Map();
    function colorDe(k) { if (!colorSerie.has(k)) colorSerie.set(k, PALETA[colorSerie.size % PALETA.length]); return colorSerie.get(k); }
    const elSeries = document.getElementById("series-urb");
    function pintarListaSeries() {
      elSeries.innerHTML = "<legend>Series</legend>" + grupos.map(([t, l]) => l.length ? '<span class="grupo">' + t + "</span>" +
        l.map((k) => '<label><input type="checkbox" value="' + k + '"' + (elegidas.has(k) ? " checked" : "") + ">" +
          (elegidas.has(k) ? '<i style="background:' + colorDe(k) + '"></i>' : "") + RM.esc(nombre(k)) + "</label>").join("") : "").join("");
    }
    elSeries.addEventListener("change", (ev) => {
      if (ev.target.checked) elegidas.add(ev.target.value); else { elegidas.delete(ev.target.value); colorSerie.delete(ev.target.value); }
      pintarUrbanizacion();
    });
    function pintarUrbanizacion() {
      pintarListaSeries();
      const W = 680, H = 360, m = { l: 40, r: 16, t: 14, b: 28 };
      const x = d3.scaleLinear().domain([UA[0], UA[UA.length - 1]]).range([m.l, W - m.r]);
      const y = d3.scaleLinear().domain([0, 100]).range([H - m.b, m.t]);
      const svg = d3.select("#urbanizacion").attr("viewBox", [0, 0, W, H]);
      svg.selectAll("*").remove();
      svg.append("rect").attr("class", "zona-proy").attr("x", x(ULT)).attr("y", m.t).attr("width", x(UA[UA.length - 1]) - x(ULT)).attr("height", H - m.b - m.t);
      svg.append("text").attr("class", "rot-proy").attr("x", x(ULT) + 4).attr("y", m.t + 10).text("proyección");
      svg.append("g").attr("class", "eje").attr("transform", "translate(0," + (H - m.b) + ")").call(d3.axisBottom(x).ticks(10).tickFormat(d3.format("d")));
      svg.append("g").attr("class", "eje").attr("transform", "translate(" + m.l + ",0)").call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat((d) => d + " %"))
        .call((g) => g.selectAll(".tick line").attr("class", "rejilla-l")).call((g) => g.select(".domain").remove());
      svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(50)).attr("y2", y(50)).attr("stroke", "#77868b").attr("stroke-dasharray", "2 3");
      const lin = d3.line().defined((d) => d[1] != null).x((d) => x(d[0])).y((d) => y(d[1]));
      [...elegidas].filter((k) => U.series[k]).forEach((k) => {
        const pts = UA.map((a, i) => [a, U.series[k][i]]);
        const agregado = !REGION.includes(k) && !(CU.comparadores || []).includes(k);
        svg.append("path").attr("class", "linea-e" + (agregado ? " agregado" : "")).attr("stroke", colorDe(k)).attr("d", lin(pts.filter((d) => d[0] <= ULT)));
        svg.append("path").attr("class", "linea-e").attr("stroke", colorDe(k)).attr("stroke-dasharray", "2 3").attr("d", lin(pts.filter((d) => d[0] >= ULT)));
        svg.append("g").selectAll("circle").data(pts.filter((d) => d[1] != null)).join("circle").attr("cx", (d) => x(d[0])).attr("cy", (d) => y(d[1])).attr("r", 2.6).attr("fill", colorDe(k))
          .on("mousemove", (ev, d) => ficha.mostrar("<strong>" + RM.esc(nombre(k)) + "</strong>" + d[0] + ": " + f1(d[1]) + " % urbano", ev)).on("mouseleave", () => ficha.ocultar());
      });
      document.getElementById("leyenda-urbanizacion").innerHTML = [...elegidas].filter((k) => U.series[k]).map((k) => '<span><i class="l" style="border-color:' + colorDe(k) + '"></i>' + RM.esc(nombre(k)) + "</span>").join("") +
        "<span>Línea de puntos: 50 % de población urbana</span>";
      pintarTamano();
    }
    document.getElementById("nota-urbanizacion").innerHTML = RM.esc(U.nota) + ' Fuente: <a href="' + U.url + '">' + RM.esc(U.fuente) + "</a>.";

    const CT = C.tamano || {};
    const TA = T.anios;
    let anioT = ULT;
    botonesAnio(document.getElementById("tam-anios"), TA, anioT, (a) => { anioT = a; pintarTamano(); });
    function pintarTamano() {
      const y = String(anioT);
      const filas = [];
      const add = (k, tipo) => { if (T.paises[k] && T.paises[k][y] && !filas.some((f) => f.k === k)) filas.push({ k, tipo, d: T.paises[k][y] }); };
      add(R.ficha.id, "region");
      REGION.filter((p) => T.paises[p]).sort((u, w) => (T.paises[w][y] ? T.paises[w][y].ciudades : 0) - (T.paises[u][y] ? T.paises[u][y].ciudades : 0)).forEach((p) => add(p, "pais"));
      (CT.comparadores || ["UE27", "URSS15", "USA", "CHN", "JPN", "WLD"]).forEach((k) => add(k, "comp"));
      const W = 820, fila = 21, izq = 190, sep = 14;
      const nReg = filas.filter((f) => f.tipo !== "comp").length;
      const H = filas.length * fila + 2 * sep + 30;
      const x = d3.scaleLinear().domain([0, Math.max(60, d3.max(filas, (f) => f.d.ciudades) || 60)]).nice().range([izq, W - 60]);
      const svg = d3.select("#tamano").attr("viewBox", [0, 0, W, H]);
      svg.selectAll("*").remove();
      svg.append("g").attr("class", "eje").attr("transform", "translate(0,20)").call(d3.axisTop(x).ticks(6).tickFormat((d) => d + " %").tickSize(3));
      const yPos = (i) => 28 + i * fila + (i >= 1 ? sep : 0) + (i >= nReg ? sep : 0);
      const g = svg.selectAll("g.fila-tam").data(filas).join("g").attr("class", (f) => "fila-tam " + f.tipo).attr("transform", (f, i) => "translate(0," + yPos(i) + ")");
      g.append("text").attr("class", "rot").attr("x", izq - 8).attr("y", 13).attr("text-anchor", "end").text((f) => nombre(f.k));
      const segs = (f) => [["seg-1m", 0, f.d.c1m], ["seg-200", f.d.c1m, f.d.c200], ["seg-50", f.d.c200, f.d.ciudades]];
      g.each(function (f) {
        const gg = d3.select(this);
        segs(f).forEach(([cl, a, b]) => {
          if (b - a <= 0) return;
          gg.append("rect").attr("class", cl).attr("x", x(a)).attr("y", 2).attr("height", 15).attr("width", x(b) - x(a));
          if (x(b) - x(a) > 26) gg.append("text").attr("class", "etq-seg" + (cl === "seg-50" ? " osc" : "")).attr("x", (x(a) + x(b)) / 2).attr("y", 13).attr("text-anchor", "middle").text(f0(b - a));
        });
        gg.append("text").attr("class", "rot valor").attr("x", x(f.d.ciudades) + 6).attr("y", 13).text(f1(f.d.ciudades) + " %");
        gg.append("title").text(nombre(f.k) + ", " + y + ": " + f1(f.d.ciudades) + " % en ciudades; " + f1(f.d.c200) + " % en ciudades de 200.000 o más; " +
          f1(f.d.c1m) + " % en ciudades de un millón o más (" + f.d.n1m + " ciudades millonarias, " + f.d.n500 + " de medio millón o más)");
      });
      document.getElementById("leyenda-tamano").innerHTML = '<span><i style="background:#a3245c"></i>ciudades de un millón o más</span><span><i style="background:#c97b9c"></i>de 200.000 a un millón</span><span><i style="background:#e8c3d2"></i>de 50.000 a 200.000</span><span>El resto de la población vive en ciudades pequeñas, suburbios y zonas rurales.</span>';
    }
    document.getElementById("nota-tamano").innerHTML = RM.esc(T.nota) + " Las ciudades se delimitan con el grado de urbanización: por eso Estados Unidos, con grandes periferias de baja densidad, no aparece por delante de Europa. Fuente: " + RM.esc(T.fuente) + ".";
    repintar.urbanizacion = pintarUrbanizacion;

    // =====================================================================
    // El manual y los datos
    // =====================================================================
    function pintarManual() {
      const el = document.getElementById("manual-ciudades");
      if (!propios) { el.innerHTML = '<p class="vacio">Esta región todavía no tiene afirmaciones del manual comprobadas.</p>'; return; }
      let html = "";
      if (propios.afirmaciones && propios.afirmaciones.length) {
        html += "<h2>Afirmaciones del manual</h2>" + propios.afirmaciones.map((a) =>
          '<div class="afirmacion"><p class="que">«' + RM.esc(a.texto) + '»</p><p class="hoy">' + RM.esc(a.hoy) + '</p><p class="ap">' +
          (a.nota ? RM.esc(a.nota) + " " : "") + "Manual: " + RM.esc(a.apartado) + "</p></div>").join("");
      }
      // Uno o varios cuadros del manual comparados con hoy ("cuadro" o "cuadros")
      (propios.cuadros || (propios.cuadro ? [propios.cuadro] : [])).forEach((q) => {
        html += "<h2>" + RM.esc(q.titulo) + '</h2><div class="tabla-desplazable"><table class="tabla-ciudades"><thead><tr><th>Ciudad</th>' +
          q.columnas.map((c) => "<th>" + RM.esc(c) + "</th>").join("") + '<th class="hoy">' + RM.esc(q.columnaHoy || "Hoy (oficial)") + '</th><th class="wup">' +
          (q.columnaDatos ? RM.esc(q.columnaDatos) : "ONU 2025<br>(ciudad continua)") + "</th></tr></thead><tbody>" +
          q.filas.map((f) => {
            const c = f.wup ? porClave.get(f.wup) : null;
            return "<tr><td>" + RM.esc(f.nombre) + "</td>" + f.manual.map((v) => "<td>" + (v == null ? "—" : f0(v)) + "</td>").join("") +
              '<td class="hoy">' + (f.hoy ? f0(f.hoy.valor) + "<small>" + RM.esc(f.hoy.fecha) + "</small>" : "—") + "</td>" +
              '<td class="wup">' + (c && val(c, ULT) != null ? f0(val(c, ULT) * (q.escalaDatos || 1)) : "—") + "</td></tr>";
          }).join("") + "</tbody></table></div>" +
          '<p class="nota">' + RM.esc(q.nota || "") + "</p>";
      });
      el.innerHTML = html;
    }
    repintar.manual = pintarManual;

    // =====================================================================
    // Preguntas
    // =====================================================================
    if (preguntas && preguntas.preguntas && preguntas.preguntas.length) {
      const cont = document.getElementById("cuestionario");
      const ir = document.createElement("p");
      cont.parentNode.insertBefore(ir, cont);
      new RM.Cuestionario(cont, preguntas.preguntas, {
        clave: "ciudades:" + R.ficha.id,
        alMostrar: (q) => {
          const v = q.vista;
          ir.innerHTML = "";
          if (!v) return;
          const b = document.createElement("button");
          b.type = "button"; b.className = "principal";
          b.textContent = { mapa: "Abrir el mapa urbano", jerarquia: "Abrir la jerarquía urbana", urbanizacion: "Abrir la urbanización", manual: "Abrir el manual y los datos" }[v.pestana] || "Abrir la vista";
          b.addEventListener("click", () => {
            if (v.pestana === "mapa") {
              if (v.anio) { M.anio = v.anio; marcarAnio(document.getElementById("mapa-anios"), v.anio); }
              if (v.color) { M.color = String(v.color); document.querySelectorAll('input[name="color-c"]').forEach((i) => { i.checked = i.value === M.color; }); }
              if (v.trazados) elTraz.querySelectorAll("input").forEach((inp) => { inp.checked = v.trazados.includes(trazados[+inp.dataset.t].nombre); });
              pintarTrazados();
              if (v.ciudad && porClave.get(v.ciudad)) elegir(porClave.get(v.ciudad)); else pintarMapa();
            }
            if (v.pestana === "jerarquia") {
              if (v.pais) { J.a = v.pais; selJA.value = v.pais; }
              J.b = v.comparar || ""; selJB.value = J.b;
              if (v.anio) { J.anio = v.anio; marcarAnio(document.getElementById("je-anios"), v.anio); }
            }
            if (v.pestana === "urbanizacion") {
              if (v.series) { elegidas.clear(); colorSerie.clear(); v.series.forEach((k) => elegidas.add(k)); }
              if (v.anio) { anioT = v.anio; marcarAnio(document.getElementById("tam-anios"), v.anio); }
            }
            abrir(v.pestana);
            window.scrollTo({ top: 0 });
          });
          ir.appendChild(b);
        },
      });
    } else document.getElementById("t-preguntas").hidden = true;

    const h = location.hash.slice(1);
    if (tabs.includes(h)) abrir(h);
  } catch (e) {
    RM.error(main, e);
  }
})();
