/* Motor «Lectura de paisajes»: una fotografía y tres pasos, como el ejercicio de paisajes de la PEC.
   1) localizar el paisaje en el mapa, 2) identificar el clima, 3) vegetación y actividad económica.
   Lee la sección "paisajes" de regiones/<id>/config.json:
     { "archivo": "datos/paisajes.json", "estacionesExtra": "datos/estaciones_paisajes.json" }
   Las estaciones se buscan en el archivo de los climogramas (climas.estaciones) y en estacionesExtra. */
(async function () {
  "use strict";
  const barra = document.getElementById("barra");
  const main = document.getElementById("paisajes");
  let R;
  try { R = await RM.region(); } catch (e) { RM.cabecera(barra); RM.error(main, e); return; }
  RM.cabecera(barra, R.ficha, "paisajes", R.ficha.motores);
  document.title = "Lectura de paisajes. " + R.ficha.titulo;
  const C = R.config.paisajes;
  const carpeta = (r) => R.carpeta + r;

  try {
    const capaK = (R.config.atlas && R.config.atlas.capas || []).find((c) => c.tipo === "koppen");
    const estClimas = R.config.climas && R.config.climas.estaciones;
    const [mundo, koppen, datos, topoK, est1, est2] = await Promise.all([
      RM.json("datos/mundo/paises-50m.json"), RM.json("datos/koppen.json"), RM.json(carpeta(C.archivo)),
      capaK ? RM.json(carpeta(capaK.archivo)) : Promise.resolve(null),
      estClimas ? RM.json(carpeta(estClimas)).catch(() => null) : Promise.resolve(null),
      C.estacionesExtra ? RM.json(carpeta(C.estacionesExtra)).catch(() => null) : Promise.resolve(null),
    ]);
    const P = datos.paisajes;
    const porId = new Map(P.map((p, i) => [p.id, Object.assign(p, { n: i + 1 })]));
    const estaciones = new Map([].concat(est1 ? est1.estaciones : [], est2 ? est2.estaciones : []).map((e) => [e.id, e]));
    const climasK = topoK ? topojson.feature(topoK, topoK.objects[capaK.objeto]).features : [];
    const colorK = (c) => (koppen.tipos[c] || {}).color || "#ccc";
    const nombreK = (c) => (koppen.tipos[c] || {}).nombre || "";
    const f0 = (n) => RM.formato(n, 0);
    const km = (a, b) => d3.geoDistance(a, b) * 6371;
    const claveMem = "paisajes:" + R.ficha.id;
    const estado = RM.memoria.leer(claveMem, {});
    const guardar = () => RM.memoria.guardar(claveMem, estado);
    let reto = RM.memoria.leer(claveMem + ":reto", false);

    function koppenEn(lonlat) {
      const f = climasK.find((g) => d3.geoContains(g, lonlat));
      return f ? f.properties[capaK.campo] : null;
    }
    // orden estable de las opciones (mismo criterio que el cuestionario)
    function barajar(lista, semilla) {
      let h = 2166136261;
      for (const ch of semilla) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
      return lista.map((v, i) => [v, (Math.imul(h ^ (i * 2654435761), 2246822507) >>> 0)]).sort((a, b) => a[1] - b[1]).map((d) => d[0]);
    }
    const titulo = (p) => (reto && !(estado[p.id] && estado[p.id].visto) ? "Paisaje " + p.n : p.titulo);

    // Fotografía: copia local (si existe), url explícita o archivo de Wikimedia Commons
    const COMMONS = "https://commons.wikimedia.org/wiki/";
    const nombreArchivo = (f) => (f.archivo || "").replace(/^(File|Archivo):/i, "").trim();
    function fuentesFoto(f, ancho) {
      const lista = [];
      if (f.local) lista.push(carpeta(f.local));
      // Wikimedia solo sirve miniaturas en anchos normalizados (250, 330, 500, 960, 1280, 1920...)
      if (f.url) lista.push(ancho < 1000 && /\/\d+px-/.test(f.url) ? f.url.replace(/\/(\d+)px-/, "/" + ancho + "px-") : f.url);
      if (nombreArchivo(f)) lista.push(COMMONS + "Special:FilePath/" + encodeURIComponent(nombreArchivo(f)) + "?width=" + ancho);
      return lista;
    }
    const paginaFoto = (f) => f.pagina || (nombreArchivo(f) ? COMMONS + "File:" + encodeURIComponent(nombreArchivo(f).replace(/ /g, "_")) : null);
    const busqueda = (f) => f.buscar ? "https://commons.wikimedia.org/w/index.php?title=Special:MediaSearch&type=image&search=" + encodeURIComponent(f.buscar) : null;

    function imagen(img, foto, op) {
      const fuentes = fuentesFoto(foto, op && op.mini ? 500 : 1920);
      let i = 0;
      img.alt = foto.alt || "";
      const fallo = (pendiente) => {
        const aviso = document.createElement("div");
        aviso.className = "sin-foto" + (op && op.mini ? " mini" : "");
        const pag = paginaFoto(foto), bus = busqueda(foto);
        aviso.innerHTML = pendiente
          ? "<span>Fotografía pendiente de incorporar.</span>" + (!(op && op.mini) && bus ? ' <a href="' + bus + '" target="_blank" rel="noopener">Buscar en Wikimedia Commons</a>' : "")
          : "<span>No se ha podido cargar la fotografía.</span>" + (pag ? ' <a href="' + pag + '" target="_blank" rel="noopener">Abrirla en Wikimedia Commons</a>' : "");
        img.replaceWith(aviso);
      };
      if (!fuentes.length) { fallo(true); return; }
      img.onerror = () => { i += 1; if (i < fuentes.length) img.src = fuentes[i]; else { img.onerror = null; fallo(false); } };
      img.src = fuentes[0];
    }
    function credito(f) {
      const pag = paginaFoto(f);
      if (!pag && !f.autor) return "";
      return "Foto: " + (f.autor ? RM.esc(f.autor) : "véase el autor en Commons") +
        (f.licencia ? ", " + (f.licencia_url ? '<a href="' + f.licencia_url + '" target="_blank" rel="noopener">' + RM.esc(f.licencia) + "</a>" : RM.esc(f.licencia)) : "") +
        (pag ? ', <a href="' + pag + '" target="_blank" rel="noopener">Wikimedia Commons</a>' : "");
    }
    const hayFoto = (f) => fuentesFoto(f, 1920).length > 0;

    // ---------- Pestañas ----------
    const tabs = ["lectura", "mapa"];
    function abrir(id) {
      tabs.forEach((t) => {
        document.getElementById("t-" + t).setAttribute("aria-selected", t === id ? "true" : "false");
        document.getElementById("s-" + t).hidden = t !== id;
      });
      if (id === "mapa") pintarMapaGeneral();
    }
    tabs.forEach((t) => document.getElementById("t-" + t).addEventListener("click", () => { abrir(t); if (t === "lectura") volver(); }));

    // ---------- Visor ----------
    const visor = document.getElementById("visor");
    document.getElementById("visor-cerrar").addEventListener("click", () => visor.close());
    visor.addEventListener("click", (ev) => { if (ev.target === visor) visor.close(); });
    function ampliar(p) {
      const img = document.getElementById("visor-img");
      imagen(img, p.foto);
      document.getElementById("visor-pie").innerHTML = credito(p.foto);
      if (visor.showModal) visor.showModal();
    }

    // ---------- Galería ----------
    const casilla = document.getElementById("reto");
    casilla.checked = reto;
    casilla.addEventListener("change", () => { reto = casilla.checked; RM.memoria.guardar(claveMem + ":reto", reto); pintarGaleria(); });
    function hechos(p) {
      const e = estado[p.id] || {};
      return (e.loc != null ? 1 : 0) + (e.k ? 1 : 0) + (e.preg ? 1 : 0);
    }
    function pintarGaleria() {
      const ol = document.getElementById("rejilla-paisajes");
      ol.innerHTML = "";
      P.forEach((p) => {
        const li = document.createElement("li");
        const b = document.createElement("button");
        b.type = "button"; b.className = "tarjeta-paisaje";
        const img = document.createElement("img");
        img.loading = "lazy";
        b.appendChild(img);
        imagen(img, p.foto, { mini: true });
        const h = hechos(p);
        const pie = document.createElement("span");
        pie.className = "pie-tarjeta";
        pie.innerHTML = '<span class="num">' + p.n + "</span><span class=\"tit\">" + RM.esc(titulo(p)) + "</span>" +
          '<span class="avance' + (h === 3 ? " completo" : "") + '" title="Pasos resueltos">' + (h === 3 ? "✓" : h + "/3") + "</span>";
        b.appendChild(pie);
        b.addEventListener("click", () => mostrar(p.id));
        li.appendChild(b); ol.appendChild(li);
      });
    }

    // ---------- Ejercicio ----------
    const art = document.getElementById("ejercicio");
    function volver() {
      art.hidden = true; art.innerHTML = "";
      document.getElementById("galeria").hidden = false;
      pintarGaleria();
      history.replaceState(null, "", location.pathname + location.search);
    }

    function mostrar(id) {
      const p = porId.get(id);
      if (!p) return;
      abrir("lectura");
      document.getElementById("galeria").hidden = true;
      art.hidden = false;
      history.replaceState(null, "", "#p=" + id);
      const e = (estado[p.id] = estado[p.id] || {});
      const i = P.indexOf(p);
      const ant = P[(i - 1 + P.length) % P.length], sig = P[(i + 1) % P.length];
      art.innerHTML =
        '<nav class="nav-ejercicio"><button type="button" data-ir="galeria">← Todos los paisajes</button>' +
        '<span><button type="button" data-ir="' + ant.id + '" aria-label="Paisaje anterior">‹</button>' +
        '<span class="cuenta">' + p.n + " de " + P.length + "</span>" +
        '<button type="button" data-ir="' + sig.id + '" aria-label="Paisaje siguiente">›</button></span></nav>' +
        '<h2 id="tit-paisaje"></h2>' +
        '<div class="rejilla-ejercicio">' +
        '<div class="col-foto"><figure class="foto"><button type="button" class="ampliar" aria-label="Ampliar la fotografía"><img></button>' +
        '<figcaption class="nota">' + credito(p.foto) + "</figcaption></figure>" +
        '<details class="mirar"><summary>Qué mirar en la fotografía</summary><ul>' + (p.mirar || []).map((t) => "<li>" + t + "</li>").join("") + "</ul></details></div>" +
        '<div class="col-pasos">' +
        '<section class="paso" id="paso-loc"><h3><span class="n">1</span> ¿Dónde está?</h3>' +
        '<p class="consigna">Pulsad en el mapa el lugar donde creéis que se tomó la fotografía.</p>' +
        '<div class="marco-mapa"><svg id="mapa-loc" role="img" aria-label="Mapa para localizar el paisaje"></svg></div>' +
        '<div class="fila-botones"><label class="conmutador"><input type="checkbox" id="ver-climas"> Ver los climas de Köppen</label>' +
        '<button type="button" id="ver-ubicacion">Ver la ubicación</button></div>' +
        '<div class="respuesta" id="r-loc" aria-live="polite"></div></section>' +
        '<section class="paso" id="paso-k"><h3><span class="n">2</span> ¿Qué clima tiene?</h3>' +
        '<p class="consigna">Elegid el tipo de Köppen que corresponde al paisaje.</p>' +
        '<div class="opciones-k" id="opciones-k"></div>' +
        '<div class="respuesta" id="r-k" aria-live="polite"></div></section>' +
        '<section class="paso" id="paso-v"><h3><span class="n">3</span> Vegetación y actividad económica</h3>' +
        '<div id="cuestionario-paisaje"></div></section>' +
        '<details class="modelo"><summary>Respuesta modelo (como en la PEC)</summary>' +
        ["a", "b", "c"].filter((k) => p.modelo && p.modelo[k]).map((k) => "<p><strong>" + k + ") " + ({ a: "Localización.", b: "Clima.", c: "Vegetación y actividad." })[k] + "</strong> " + p.modelo[k] + "</p>").join("") +
        (p.manual ? '<p class="nota">Manual: ' + RM.esc(p.manual) + "</p>" : "") + "</details>" +
        (p.enlaces && p.enlaces.length ? '<div class="enlaces"><h3>Para seguir</h3><ul>' + p.enlaces.map((l) =>
          '<li><a href="' + RM.url(l.pagina + (l.pagina.includes("?") ? "&" : "?") + "r=" + R.ficha.id + (l.ancla ? "#" + l.ancla : "")) + '">' + RM.esc(l.texto) + "</a></li>").join("") + "</ul></div>" : "") +
        "</div></div>";

      art.querySelectorAll("[data-ir]").forEach((b) => b.addEventListener("click", () => {
        if (b.dataset.ir === "galeria") volver(); else mostrar(b.dataset.ir);
        window.scrollTo({ top: 0 });
      }));
      const tit = () => { art.querySelector("#tit-paisaje").textContent = titulo(p) + (titulo(p) === p.titulo && p.lugar ? " · " + p.lugar : ""); };
      tit();
      const img = art.querySelector(".ampliar img");
      imagen(img, p.foto);
      if (hayFoto(p.foto)) art.querySelector(".ampliar").addEventListener("click", () => ampliar(p));
      else art.querySelector(".ampliar").disabled = true;
      const desvelar = () => { if (!e.visto) { e.visto = true; guardar(); tit(); } };

      // --- Paso 1: localizar ---
      const mapa = new RM.Mapa(art.querySelector("#mapa-loc"), R.config, mundo, { ancho: 700, zoom: true });
      const gK = mapa.capa("koppen").style("display", "none");
      gK.selectAll("path").data(climasK).join("path").attr("class", "poligono").attr("d", mapa.ruta)
        .attr("fill", (f) => colorK(f.properties[capaK.campo])).attr("opacity", 0.55);
      mapa.fronteras(mapa.capa("fronteras"));
      const gM = mapa.capa("marcas");
      art.querySelector("#ver-climas").addEventListener("change", (ev) => gK.style("display", ev.target.checked ? null : "none"));
      if (!climasK.length) art.querySelector("#ver-climas").parentNode.hidden = true;
      const real = [p.lon, p.lat];
      const rLoc = art.querySelector("#r-loc");

      function marcaReal() {
        const [x, y] = mapa.proy(real);
        const g = gM.append("g").attr("class", "marca-real").attr("transform", "translate(" + x + "," + y + ")");
        g.append("circle").attr("r", 9);
        g.append("text").attr("class", "etiqueta").attr("x", 13).attr("y", 5).attr("font-size", 15).text(p.titulo);
      }
      function resolverLoc(lonlat) {
        gM.selectAll("*").remove();
        let html = "";
        if (lonlat) {
          const d = km(lonlat, real);
          const kc = koppenEn(lonlat);
          const [x, y] = mapa.proy(lonlat);
          gM.append("line").attr("class", "distancia").attr("x1", x).attr("y1", y)
            .attr("x2", mapa.proy(real)[0]).attr("y2", mapa.proy(real)[1]);
          gM.append("circle").attr("class", "marca-alumno").attr("cx", x).attr("cy", y).attr("r", 7);
          const tol = p.tolerancia || 250;
          html += '<p class="veredicto ' + (d <= tol ? "bien" : "mal") + '">' +
            (d <= tol ? "Bien localizado: estáis a " + f0(d) + " km." : "Os habéis alejado " + f0(d) + " km del lugar de la foto.") + "</p>";
          if (kc) html += '<p>Según el mapa de Köppen, el punto que habéis marcado tiene clima <b>' + kc + "</b> (" + RM.esc(nombreK(kc)) + ').</p>';
          e.loc = Math.round(d);
        } else if (e.loc == null) e.loc = -1;
        marcaReal();
        html += "<p><b>" + RM.esc(p.lugar || p.titulo) + "</b>" + (p.pais ? " (" + RM.esc(p.pais) + ")" : "") + ". " + (p.localizacion || "") + "</p>";
        rLoc.innerHTML = html;
        desvelar(); guardar();
      }
      mapa.svg.on("click", (ev) => { if (ev.defaultPrevented) return; resolverLoc(mapa.lonlat(ev)); });
      art.querySelector("#ver-ubicacion").addEventListener("click", () => resolverLoc(null));
      if (e.loc != null) {
        rLoc.innerHTML = '<p class="nota">Ya resolvisteis este paso' + (e.loc >= 0 ? " (a " + f0(e.loc) + " km)" : "") + ". Podéis volver a intentarlo.</p>";
        marcaReal();
      }

      // --- Paso 2: clima ---
      const opciones = barajar([p.koppen].concat(p.distractores || []), p.id);
      const cajaK = art.querySelector("#opciones-k");
      const rK = art.querySelector("#r-k");
      cajaK.innerHTML = opciones.map((c) => '<button type="button" data-k="' + c + '"><span class="muestra" style="background:' + colorK(c) + '"></span><b>' + c + "</b> " + RM.esc(nombreK(c)) + "</button>").join("");
      function resolverK(elegido) {
        cajaK.querySelectorAll("button").forEach((b) => {
          b.disabled = true;
          if (b.dataset.k === p.koppen) b.classList.add("correcta");
          else if (b.dataset.k === elegido) b.classList.add("incorrecta");
        });
        const est = estaciones.get(p.estacion);
        let html = elegido ? '<p class="veredicto ' + (elegido === p.koppen ? "bien" : "mal") + '">' + (elegido === p.koppen ? "Correcto." : "No es ese: la respuesta está marcada en verde.") + "</p>" : "";
        html += "<p>" + (p.clima || "") + "</p>" + (p.notaKoppen ? '<p class="nota">' + p.notaKoppen + "</p>" : "");
        rK.innerHTML = html;
        if (est) {
          const k = RM.koppen(est.t, est.p, est.lat).codigo;
          const fig = document.createElement("figure");
          fig.className = "climograma-ref";
          const d = km([est.lon, est.lat], real);
          fig.innerHTML = '<svg role="img" aria-label="Climograma de ' + RM.esc(est.nombre) + '"></svg><figcaption class="nota">Estación de referencia: <b>' + RM.esc(est.nombre) + "</b> (" + RM.esc(est.pais || "") + "), " +
            f0(est.altitud) + " m, a " + f0(d) + " km del paisaje. Periodo " + RM.esc(est.periodo) + ". Köppen calculado: <b>" + k + "</b>. " +
            "Media anual " + RM.formato(d3.mean(est.t), 1) + " °C; " + f0(d3.sum(est.p)) + " mm. Fuente: " + RM.esc(est.fuente) + "." +
            (est.nota ? " " + RM.esc(est.nota) : "") + (p.notaEstacion ? " " + p.notaEstacion : "") + "</figcaption>";
          rK.appendChild(fig);
          RM.climograma(fig.querySelector("svg"), est);
        }
        if (elegido) e.k = elegido === p.koppen ? "ok" : "mal"; else if (!e.k) e.k = "visto";
        guardar();
      }
      cajaK.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => resolverK(b.dataset.k)));
      const verK = document.createElement("button");
      verK.type = "button"; verK.textContent = "Ver la solución"; verK.className = "ver-k";
      verK.addEventListener("click", () => { resolverK(null); verK.remove(); });
      cajaK.after(verK);
      if (e.k) { resolverK(null); verK.remove(); }

      // --- Paso 3: preguntas ---
      new RM.Cuestionario(art.querySelector("#cuestionario-paisaje"), p.preguntas || [], {
        clave: claveMem + ":" + p.id,
        alMostrar: () => { if (!e.preg) { e.preg = true; guardar(); } },
      });
    }

    // ---------- Mapa general ----------
    let mapaGeneral = null;
    function pintarMapaGeneral() {
      if (mapaGeneral) return;
      mapaGeneral = new RM.Mapa(document.getElementById("mapa-paisajes"), R.config, mundo, { ancho: 1000, zoom: true });
      mapaGeneral.capa("koppen").selectAll("path").data(climasK).join("path").attr("class", "poligono").attr("d", mapaGeneral.ruta)
        .attr("fill", (f) => colorK(f.properties[capaK.campo])).attr("opacity", 0.6);
      mapaGeneral.fronteras(mapaGeneral.capa("fronteras"));
      const g = mapaGeneral.capa("paisajes").selectAll("g").data(P).join("g").attr("class", "punto-paisaje")
        .attr("transform", (p) => "translate(" + mapaGeneral.proy([p.lon, p.lat]) + ")")
        .on("click", (ev, p) => { ev.stopPropagation(); mostrar(p.id); window.scrollTo({ top: 0 }); });
      g.append("circle").attr("r", 13);
      g.append("text").attr("class", "num").attr("text-anchor", "middle").attr("dy", "0.35em").text((p) => p.n);
      const derecha = (p) => mapaGeneral.proy([p.lon, p.lat])[0] > mapaGeneral.W * 0.7;
      g.append("text").attr("class", "etiqueta").attr("x", (p) => (derecha(p) ? -17 : 17)).attr("y", 5).attr("font-size", 14)
        .attr("text-anchor", (p) => (derecha(p) ? "end" : "start")).text((p) => p.titulo);
      g.append("title").text((p) => p.titulo + " (" + p.koppen + ")");
      const usados = Array.from(new Set(P.map((p) => p.koppen))).sort();
      document.getElementById("leyenda-mapa-paisajes").innerHTML = "<span>Clima de cada paisaje:</span>" +
        usados.map((c) => '<span><i style="background:' + colorK(c) + '"></i>' + c + " " + RM.esc(nombreK(c)) + "</span>").join("") +
        '<span class="nota">Fondo: Köppen-Geiger 1986-2010 (Rubel et al., 2017).</span>';
    }

    window.addEventListener("hashchange", () => {
      const m = location.hash.match(/^#p=([\w-]+)/);
      if (m && porId.has(m[1])) mostrar(m[1]);
    });
    const h = location.hash.match(/^#p=([\w-]+)/);
    if (h && porId.has(h[1])) mostrar(h[1]); else pintarGaleria();
    if (location.hash === "#mapa") abrir("mapa");
  } catch (e) {
    RM.error(main, e);
  }
})();
