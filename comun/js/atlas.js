/* Motor «Atlas de lectura cruzada».
   Lee la sección "atlas" de regiones/<id>/config.json y dibuja sus capas.
   Tipos de capa: poligonos, koppen, coropleta, categorias (por país), puntos. */
(async function () {
  "use strict";
  const barra = document.getElementById("barra");
  let R;
  try { R = await RM.region(); } catch (e) { RM.cabecera(barra); RM.error(document.getElementById("atlas"), e); return; }
  RM.cabecera(barra, R.ficha, "atlas", R.ficha.motores);
  document.title = "Atlas de lectura cruzada. " + R.ficha.titulo;

  const A = R.config.atlas;
  const carpeta = (ruta) => R.carpeta + ruta;

  try {
    // ---------- Carga de datos ----------
    const archivos = new Set();
    A.capas.forEach((c) => { if (c.archivo) archivos.add(c.archivo); if (c.datos) archivos.add(c.datos); });
    const ref = A.referencia || {};
    ["rios", "lagos"].forEach((k) => ref[k] && archivos.add(ref[k].archivo));
    if (ref.puntos) archivos.add(ref.puntos);
    const lista = [...archivos];
    const cargados = await Promise.all(lista.map((a) => RM.json(carpeta(a))));
    const D = Object.fromEntries(lista.map((a, i) => [a, cargados[i]]));
    const [mundo, koppen, preguntas] = await Promise.all([
      RM.json("datos/mundo/paises-50m.json"), RM.json("datos/koppen.json"),
      A.cuestionario ? RM.json(carpeta(A.cuestionario)).catch(() => null) : Promise.resolve(null),
    ]);

    // ---------- Mapa ----------
    const mapa = new RM.Mapa(document.getElementById("mapa"), R.config, mundo, { zoom: true });
    const W = mapa.W, H = mapa.H;
    document.querySelector(".atlas-mapa").style.setProperty("--proporcion", (W / H).toFixed(3));
    mapa.defs.append("pattern").attr("id", "rayado").attr("width", 6).attr("height", 6)
      .attr("patternUnits", "userSpaceOnUse").attr("patternTransform", "rotate(45)")
      .call((p) => { p.append("rect").attr("width", 6).attr("height", 6).attr("fill", "#eef0ec");
        p.append("line").attr("y2", 6).attr("stroke", "#c8cfcc").attr("stroke-width", 2); });

    // Lado derecho de la cortinilla: un segundo marco recortado que comparte el zoom
    const idClipDer = mapa.idClip + "-der";
    const rectDer = mapa.defs.append("clipPath").attr("id", idClipDer).append("rect").attr("height", H).attr("width", W / 2).attr("x", W / 2);
    const marcoDer = mapa.svg.append("g").attr("clip-path", "url(#" + idClipDer + ")").style("display", "none");
    marcoDer.append("rect").attr("class", "mar").attr("width", W).attr("height", H);
    const vistaDer = marcoDer.append("g").attr("class", "vista");
    mapa.vistas.push(vistaDer);
    vistaDer.append("g").selectAll("path").data(mapa.paises).join("path").attr("class", "tierra").attr("d", mapa.ruta);
    const grupoDer = vistaDer.append("g");
    const fronterasDer = vistaDer.append("g"); mapa.fronteras(fronterasDer);

    // Superposiciones comunes (ríos, fronteras, puntos) por encima de los dos lados
    const marcoSup = mapa.svg.append("g").attr("clip-path", "url(#" + mapa.idClip + ")");
    const vistaSup = marcoSup.append("g").attr("class", "vista");
    mapa.vistas.push(vistaSup);

    // ---------- Utilidades de capa ----------
    const porId = new Map(mapa.paises.map((f) => [f.properties.id, f]));
    const cajas = new WeakMap();
    function contiene(f, ll) {
      let b = cajas.get(f);
      if (!b) { b = d3.geoBounds(f); cajas.set(f, b); }
      const [[x0, y0], [x1, y1]] = b;
      const dentroX = x0 <= x1 ? ll[0] >= x0 && ll[0] <= x1 : ll[0] >= x0 || ll[0] <= x1;
      if (!dentroX || ll[1] < y0 || ll[1] > y1) return false;
      return d3.geoContains(f, ll);
    }
    function paisEn(ll) { return mapa.paises.find((f) => contiene(f, ll)); }
    function clase(v, cortes) { let i = 0; while (i < cortes.length && v >= cortes[i]) i++; return i; }
    function rangos(cortes, unidad) {
      const r = [];
      for (let i = 0; i <= cortes.length; i++) {
        if (i === 0) r.push("menos de " + RM.formato(cortes[0]) + " " + unidad);
        else if (i === cortes.length) r.push(RM.formato(cortes[i - 1]) + " o más");
        else r.push(RM.formato(cortes[i - 1]) + " a " + RM.formato(cortes[i]));
      }
      return r;
    }
    const caja = (color) => '<span class="caja" style="background:' + color + '"></span>';

    // Cada capa expone: dibujar(grupo), leyenda(), info(ll, pais)
    const capas = A.capas.map((c) => {
      const capa = { def: c, id: c.id, nombre: c.nombre };
      if (c.tipo === "poligonos" || c.tipo === "koppen") {
        const topo = D[c.archivo];
        const feats = topojson.feature(topo, topo.objects[c.objeto]).features;
        const cat = c.tipo === "koppen" ? koppen.tipos : c.categorias;
        capa.color = (f) => (cat[f.properties[c.campo]] || {}).color || "#ccc";
        capa.dibujar = (g) => {
          g.selectAll("path").data(feats).join("path").attr("class", "poligono").attr("d", mapa.ruta).attr("fill", capa.color);
          if (c.puntos && D[ref.puntos]) dibujarExtras(g, c.puntos);
        };
        capa.info = (ll) => {
          const f = feats.find((x) => contiene(x, ll));
          if (!f) return null;
          const k = f.properties[c.campo];
          if (c.tipo === "koppen") return "<b>" + k + "</b> " + RM.esc((cat[k] || {}).nombre || "");
          return "<b>" + RM.esc(f.properties[c.etiqueta]) + "</b><br>" + RM.esc((cat[k] || {}).nombre || "");
        };
        capa.leyenda = () => {
          if (c.tipo !== "koppen") return "<ul>" + Object.values(cat).map((v) => "<li>" + caja(v.color) + RM.esc(v.nombre) + "</li>").join("") + "</ul>";
          const presentes = new Set(feats.map((f) => f.properties[c.campo]));
          const grupos = {};
          Object.entries(cat).forEach(([k, v]) => { if (presentes.has(k)) (grupos[v.grupo] = grupos[v.grupo] || []).push([k, v]); });
          return Object.entries(grupos).map(([g, items]) => '<div class="grupo">' + RM.esc(koppen.grupos[g]) + "</div><ul>" +
            items.map(([k, v]) => "<li>" + caja(v.color) + "<span><b>" + k + "</b> " + RM.esc(v.nombre) + "</span></li>").join("") + "</ul>").join("");
        };
      } else if (c.tipo === "coropleta") {
        const datos = D[c.datos].paises;
        const valor = (iso) => datos[iso] ? datos[iso][c.campo] : null;
        const color = (v) => v == null ? null : c.colores[clase(v, c.clases)];
        capa.dibujar = (g) => {
          g.selectAll("path").data(mapa.paises).join("path").attr("d", mapa.ruta)
            .attr("class", (f) => "poligono" + (valor(f.properties.id) == null ? " sindatos" : ""))
            .attr("fill", (f) => color(valor(f.properties.id)) || "url(#rayado)");
        };
        capa.info = (ll, pais) => {
          if (!pais) return null;
          const d = datos[pais.properties.id];
          if (!d || d[c.campo] == null) return RM.esc(c.nombre) + ": sin datos";
          const anio = c.anio && c.anio.startsWith("campo:") ? d[c.anio.slice(6)] : c.anio;
          let t = RM.esc(c.nombre.replace(/\s*\(\d{4}\)$/, "")) + ": <b>" + RM.formato(d[c.campo], c.decimales) + " " + c.unidad + "</b>" + (anio ? " (" + anio + ")" : "");
          if (c.comparar && d[c.comparar.campo] != null) t += "<br>" + RM.esc(c.comparar.texto) + ": " + RM.formato(d[c.comparar.campo], c.decimales) + " " + c.unidad;
          return t;
        };
        capa.leyenda = () => "<ul>" + rangos(c.clases, c.unidad).map((r, i) => "<li>" + caja(c.colores[i]) + RM.esc(r) + "</li>").join("") +
          '<li><span class="caja sin" style="background:#eef0ec"></span>Sin datos</li></ul>' +
          '<p class="nota">Medias por país. Fuentes y notas en la pestaña Capas y en la presentación de la región.</p>';
      } else if (c.tipo === "categorias") {
        const datos = D[c.datos];
        const cat = (iso) => datos.paises[iso];
        capa.dibujar = (g) => {
          g.selectAll("path").data(mapa.paises).join("path").attr("d", mapa.ruta).attr("class", "poligono")
            .attr("fill", (f) => (datos.categorias[cat(f.properties.id)] || {}).color || "#eef0ec");
        };
        capa.info = (ll, pais) => {
          if (!pais) return null;
          const k = cat(pais.properties.id);
          const extra = datos.notas && datos.notas[pais.properties.id];
          return k ? "<b>" + RM.esc(datos.categorias[k].nombre) + "</b>" + (extra ? "<br>" + RM.esc(extra) : "") : null;
        };
        capa.leyenda = () => "<ul>" + Object.values(datos.categorias).map((v) => "<li>" + caja(v.color) + RM.esc(v.nombre) + "</li>").join("") + "</ul>";
      } else if (c.tipo === "puntos") {
        const pts = D[c.archivo][c.clave];
        capa.dibujar = (g) => {
          (c.lineas || []).forEach((l) => {
            g.append("path").datum({ type: "LineString", coordinates: l.coords }).attr("class", "banda")
              .attr("d", mapa.ruta).attr("stroke-width", 26).datum({ properties: { n: l.nombre, nota: l.nota } });
          });
          g.selectAll("circle").data(pts).join("circle").attr("class", "simbolo")
            .attr("cx", (d) => mapa.proy(d.geometry.coordinates)[0]).attr("cy", (d) => mapa.proy(d.geometry.coordinates)[1])
            .attr("fill", (d) => c.categorias[d.properties[c.campo]].color);
          ajustarSimbolos();
        };
        capa.info = () => null;
        capa.leyenda = () => "<ul>" + Object.values(c.categorias).map((v) => '<li><span class="punto" style="background:' + v.color + '"></span>' + RM.esc(v.nombre) + "</li>").join("") +
          (c.lineas || []).map((l) => '<li><span class="caja" style="background:rgba(163,36,92,.3);border:0"></span>' + RM.esc(l.nombre) + "</li>").join("") + "</ul>";
        capa.esPuntos = true;
      }
      return capa;
    });
    const capaPor = new Map(capas.map((c) => [c.id, c]));

    function dibujarExtras(g, claves) {
      const P = D[ref.puntos];
      if (claves.includes("cuencas")) {
        g.selectAll("text.cuenca").data(P.cuencas).join("text").attr("class", "etiqueta cursiva cuenca")
          .attr("x", (d) => mapa.proy(d.geometry.coordinates)[0]).attr("y", (d) => mapa.proy(d.geometry.coordinates)[1])
          .attr("text-anchor", "middle").text((d) => d.properties.n);
      }
      if (claves.includes("picos")) {
        const s = g.selectAll("g.pico").data(P.picos).join("g").attr("class", "pico-g")
          .attr("transform", (d) => "translate(" + mapa.proy(d.geometry.coordinates) + ")");
        s.append("path").attr("class", "pico").attr("d", "M0,-4L4,3L-4,3Z");
        s.append("text").attr("class", "etiqueta pico-t").attr("x", 6).attr("y", 3).text((d) => d.properties.n + " " + RM.formato(d.properties.h) + " m");
      }
      ajustarSimbolos();
    }

    // ---------- Capas de referencia ----------
    const gRios = vistaSup.append("g").attr("class", "ref-rios");
    if (ref.rios) {
      const t = D[ref.rios.archivo]; gRios.append("path").attr("class", "rio").attr("d", mapa.ruta(topojson.mesh(t, t.objects[ref.rios.objeto])));
    }
    if (ref.lagos) {
      const t = D[ref.lagos.archivo]; gRios.append("path").attr("class", "lago").attr("d", mapa.ruta(topojson.feature(t, t.objects[ref.lagos.objeto])));
    }
    const gFronteras = vistaSup.append("g"); mapa.fronteras(gFronteras);
    const gPuntos = vistaSup.append("g");
    const gCiudades = vistaSup.append("g").attr("class", "ref-ciudades");
    if (ref.puntos) {
      const ciu = D[ref.puntos].ciudades || [];
      const sc = gCiudades.selectAll("g").data(ciu).join("g")
        .attr("transform", (d) => "translate(" + mapa.proy(d.geometry.coordinates) + ")")
        .attr("class", (d) => "ciudad-g" + (d.properties.cap ? " es-capital" : ""));
      sc.append("circle").attr("class", (d) => "ciudad" + (d.properties.cap ? " capital" : ""));
      sc.append("text").attr("class", "etiqueta").text((d) => d.properties.n);
    }
    function ajustarSimbolos() {
      const k = mapa.k;
      const fs = (px) => (px / k).toFixed(2);
      mapa.svg.selectAll(".simbolo").attr("r", 5.5 / k).attr("stroke-width", 1.2 / k);
      mapa.svg.selectAll(".banda").attr("stroke-width", 26 / Math.sqrt(k));
      gCiudades.selectAll("circle").attr("r", (d) => (d.properties.cap ? 3.2 : 2.4) / k).attr("stroke-width", 1 / k);
      gCiudades.selectAll("text").attr("font-size", fs(11)).attr("x", 5 / k).attr("y", 3.5 / k).attr("stroke-width", 2.5 / k)
        .style("display", (d) => (k >= 2.2 || (k >= 1.4 && d.properties.cap) || PRINCIPALES.has(d.properties.n)) ? null : "none");
      mapa.svg.selectAll(".cuenca").attr("font-size", fs(11)).attr("stroke-width", 2.5 / k);
      mapa.svg.selectAll(".pico-g").each(function () {
        const g = d3.select(this);
        g.select("path").attr("transform", "scale(" + (1 / k) + ")");
        g.select("text").attr("font-size", fs(10)).attr("x", 6 / k).attr("y", 3 / k).attr("stroke-width", 2.5 / k).style("display", k >= 1.8 ? null : "none");
      });
    }
    const PRINCIPALES = new Set(["Londres", "París", "Madrid", "Roma", "Berlín", "Varsovia", "Moscú", "Kiev", "Estambul", "Estocolmo",
      "Atenas", "Bucarest", "Lisboa", "Oslo", "Helsinki", "Viena", "Budapest", "Dublín"]);
    mapa.alZoom = () => { ajustarSimbolos(); colocarCortinilla(); };

    // ---------- Estado ----------
    const estado = RM.memoria.leer("atlas:" + R.ficha.id, null) || {
      modo: "superponer", activas: [capas[0].id], opacidad: {}, izq: capas[0].id, der: (capas[1] || capas[0]).id,
      rios: true, ciudades: true, corte: 0.5,
    };
    const grupos = new Map();
    capas.forEach((c) => {
      const g = c.esPuntos ? gPuntos.append("g") : mapa.capa("c-" + c.id);
      c.dibujar(g); grupos.set(c.id, g);
    });

    // Cortinilla
    const cort = mapa.svg.append("g").attr("class", "cortinilla").style("display", "none");
    const linea = cort.append("line").attr("y1", 0).attr("y2", H);
    const asa = cort.append("g");
    asa.append("rect").attr("class", "asa").attr("width", 26).attr("height", 44).attr("x", -13).attr("y", -22).attr("rx", 4);
    asa.append("path").attr("class", "asa-flecha").attr("d", "M-5,-6L-9,0L-5,6M5,-6L9,0L5,6");
    const rotIzq = cort.append("text").attr("class", "rotulo-lado").attr("y", 22).attr("text-anchor", "end");
    const rotDer = cort.append("text").attr("class", "rotulo-lado").attr("y", 22);
    asa.call(d3.drag().on("drag", (ev) => {
      const [x] = d3.pointer(ev, mapa.svg.node());
      estado.corte = Math.min(0.97, Math.max(0.03, x / W)); colocarCortinilla(); guardar();
    }));
    function colocarCortinilla() {
      const x = estado.corte * W;
      rectDer.attr("x", x).attr("width", W - x);
      linea.attr("x1", x).attr("x2", x);
      asa.attr("transform", "translate(" + x + "," + H / 2 + ")");
      rotIzq.attr("x", x - 10); rotDer.attr("x", x + 10);
    }
    function guardar() { RM.memoria.guardar("atlas:" + R.ficha.id, estado); }

    function aplicar() {
      const comparar = estado.modo === "comparar";
      capas.forEach((c) => {
        const visible = comparar ? (c.id === estado.izq || (c.esPuntos && c.id === estado.der)) : estado.activas.includes(c.id);
        grupos.get(c.id).style("display", visible ? null : "none")
          .style("opacity", comparar ? 1 : (estado.opacidad[c.id] != null ? estado.opacidad[c.id] : (c.esPuntos ? 1 : 0.85)));
      });
      marcoDer.style("display", comparar ? null : "none");
      cort.style("display", comparar ? null : "none");
      grupoDer.selectAll("*").remove();
      if (comparar) {
        const d = capaPor.get(estado.der);
        if (!d.esPuntos) d.dibujar(grupoDer);
        rotIzq.text(capaPor.get(estado.izq).nombre.split(":")[0]);
        rotDer.text(d.nombre.split(":")[0]);
        colocarCortinilla();
      }
      gRios.style("display", estado.rios ? null : "none");
      gCiudades.style("display", estado.ciudades ? null : "none");
      ajustarSimbolos();
      leyenda();
      panelCapas();
      guardar();
    }

    // ---------- Leyenda sobre el mapa ----------
    function leyenda() {
      const el = document.getElementById("leyenda");
      const ids = estado.modo === "comparar" ? [estado.izq, estado.der] : estado.activas;
      el.classList.toggle("plegada", !!estado.leyendaPlegada);
      el.innerHTML = (ids.length ? '<button type="button" class="plegar" aria-expanded="' + !estado.leyendaPlegada + '">' +
        (estado.leyendaPlegada ? "Mostrar la leyenda" : "Ocultar la leyenda") + "</button>" : "") + '<div class="cuerpo">' + ids.map((id, i) => {
        const c = capaPor.get(id);
        const lado = estado.modo === "comparar" ? '<span class="lado">' + (i === 0 ? "Izquierda" : "Derecha") + ".</span> " : "";
        return "<h4>" + lado + RM.esc(c.nombre) + "</h4>" + c.leyenda();
      }).join("") + "</div>";
      const b = el.querySelector(".plegar");
      if (b) b.addEventListener("click", () => { estado.leyendaPlegada = !estado.leyendaPlegada; leyenda(); guardar(); });
    }

    // ---------- Panel de capas ----------
    const panel = document.getElementById("panel-capas");
    function panelCapas() {
      const comparables = capas;
      panel.innerHTML =
        '<fieldset class="modo" aria-label="Modo de lectura"><legend class="oculto">Modo de lectura</legend>' +
        '<label><input type="radio" name="modo" value="superponer"' + (estado.modo === "superponer" ? " checked" : "") + ">Superponer</label>" +
        '<label><input type="radio" name="modo" value="comparar"' + (estado.modo === "comparar" ? " checked" : "") + ">Comparar con cortinilla</label></fieldset>" +
        (estado.modo === "superponer"
          ? '<ul class="lista-capas">' + capas.map((c) => {
            const on = estado.activas.includes(c.id);
            const op = estado.opacidad[c.id] != null ? estado.opacidad[c.id] : (c.esPuntos ? 1 : 0.85);
            return '<li><label class="cab"><input type="checkbox" data-capa="' + c.id + '"' + (on ? " checked" : "") + ">" + RM.esc(c.nombre) + "</label>" +
              (on ? '<div class="detalle"><div class="opacidad"><label for="op-' + c.id + '">Opacidad</label><input id="op-' + c.id +
                '" type="range" min="0.15" max="1" step="0.05" value="' + op + '" data-op="' + c.id + '"></div>' +
                "<p>" + RM.esc(c.def.fuente) + "</p>" + (c.def.manual ? "<p>Manual: " + RM.esc(c.def.manual) + "</p>" : "") + "</div>" : "") + "</li>";
          }).join("") + "</ul>" +
          '<p class="nota">Con varias capas activas, las de abajo de la lista se dibujan encima. Bajad la opacidad para ver a través.</p>'
          : '<div class="comparar"><label for="izq">Capa de la izquierda</label><select id="izq">' +
            comparables.filter((c) => !c.esPuntos).map((c) => '<option value="' + c.id + '"' + (c.id === estado.izq ? " selected" : "") + ">" + RM.esc(c.nombre) + "</option>").join("") +
            '</select><label for="der">Capa de la derecha</label><select id="der">' +
            comparables.map((c) => '<option value="' + c.id + '"' + (c.id === estado.der ? " selected" : "") + ">" + RM.esc(c.nombre) + "</option>").join("") +
            "</select><p>Arrastrad la barra central para desplazar el corte. Si elegís una capa de puntos a la derecha, se dibuja sobre la izquierda.</p></div>") +
        '<div class="referencias"><h3>Referencias</h3>' +
        '<label><input type="checkbox" data-ref="rios"' + (estado.rios ? " checked" : "") + ">Ríos y lagos</label>" +
        '<label><input type="checkbox" data-ref="ciudades"' + (estado.ciudades ? " checked" : "") + ">Ciudades</label></div>";

      panel.querySelectorAll('input[name="modo"]').forEach((i) => i.addEventListener("change", () => { estado.modo = i.value; aplicar(); }));
      panel.querySelectorAll("input[data-capa]").forEach((i) => i.addEventListener("change", () => {
        const id = i.dataset.capa;
        estado.activas = i.checked ? capas.map((c) => c.id).filter((x) => x === id || estado.activas.includes(x)) : estado.activas.filter((x) => x !== id);
        aplicar();
      }));
      panel.querySelectorAll("input[data-op]").forEach((i) => i.addEventListener("input", () => {
        estado.opacidad[i.dataset.op] = +i.value; grupos.get(i.dataset.op).style("opacity", +i.value); guardar();
      }));
      const si = panel.querySelector("#izq"), sd = panel.querySelector("#der");
      if (si) si.addEventListener("change", () => { estado.izq = si.value; aplicar(); });
      if (sd) sd.addEventListener("change", () => { estado.der = sd.value; aplicar(); });
      panel.querySelectorAll("input[data-ref]").forEach((i) => i.addEventListener("change", () => { estado[i.dataset.ref] = i.checked; aplicar(); }));
    }

    // ---------- Ficha al pasar ----------
    const ficha = RM.fichaFlotante();
    let pendiente = null, temporizador = null;
    function infoEn(ev) {
      const t = ev.target;
      const dato = t && t.__data__;
      if (dato && dato.properties && dato.properties.nota) {
        return "<strong>" + RM.esc(dato.properties.n) + "</strong>" + RM.esc(dato.properties.nota);
      }
      const ll = mapa.lonlat(ev);
      if (!ll || isNaN(ll[0])) return null;
      const pais = paisEn(ll);
      const comparar = estado.modo === "comparar";
      let ids = comparar ? [estado.izq, estado.der] : estado.activas.slice();
      if (comparar) {
        const [x] = d3.pointer(ev, mapa.svg.node());
        ids = [x < estado.corte * W ? estado.izq : estado.der];
      }
      const lineas = ids.map((id) => capaPor.get(id)).filter((c) => !c.esPuntos).map((c) => c.info(ll, pais)).filter(Boolean);
      if (!pais && !lineas.length) return null;
      return (pais ? "<strong>" + RM.esc(pais.properties.nombre) + "</strong>" : "") + lineas.join("<br>");
    }
    mapa.svg.on("mousemove", (ev) => {
      if (pendiente) return;
      pendiente = requestAnimationFrame(() => {
        pendiente = null;
        const h = infoEn(ev);
        h ? ficha.mostrar(h, ev) : ficha.ocultar();
      });
    }).on("mouseleave", () => ficha.ocultar())
      .on("click", (ev) => { const h = infoEn(ev); if (h) { ficha.mostrar(h, ev); clearTimeout(temporizador); temporizador = setTimeout(() => ficha.ocultar(), 4000); } });

    document.querySelectorAll("[data-zoom]").forEach((b) => b.addEventListener("click", () => {
      const z = b.dataset.zoom; z === "inicio" ? mapa.restablecer() : mapa.acercar(z === "mas" ? 1.6 : 1 / 1.6);
    }));

    // ---------- Pestañas ----------
    const tabs = [["tab-capas", "panel-capas"], ["tab-preguntas", "panel-preguntas"]];
    tabs.forEach(([t, p]) => document.getElementById(t).addEventListener("click", () => {
      tabs.forEach(([t2, p2]) => {
        document.getElementById(t2).setAttribute("aria-selected", t2 === t ? "true" : "false");
        document.getElementById(p2).hidden = p2 !== p;
      });
    }));

    // ---------- Preguntas guiadas ----------
    if (preguntas) {
      new RM.Cuestionario(document.getElementById("cuestionario"), preguntas.preguntas, {
        clave: "atlas:" + R.ficha.id,
        alMostrar: (q) => {
          if (!q.mapa) return;
          estado.modo = q.mapa.modo || "superponer";
          if (q.mapa.capas) estado.activas = capas.map((c) => c.id).filter((id) => q.mapa.capas.includes(id));
          if (q.mapa.izq) estado.izq = q.mapa.izq;
          if (q.mapa.der) estado.der = q.mapa.der;
          if (q.mapa.ciudades != null) estado.ciudades = q.mapa.ciudades;
          if (q.mapa.corte != null) estado.corte = q.mapa.corte;
          aplicar();
        },
      });
    } else {
      document.getElementById("tab-preguntas").hidden = true;
    }

    aplicar();
  } catch (e) {
    RM.error(document.getElementById("atlas"), e);
  }
})();
