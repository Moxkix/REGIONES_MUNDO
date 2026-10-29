/* Portada: mapamundi de las regiones del temario y lista de capítulos. */
(async function () {
  "use strict";
  RM.cabecera(document.getElementById("barra"));
  try {
    const [catalogo, mundo] = await Promise.all([RM.json("datos/regiones.json"), RM.json("datos/mundo/paises-110m.json")]);
    const regionDe = new Map();
    catalogo.regiones.forEach((r) => r.paises.forEach((p) => regionDe.set(p, r)));

    const paises = topojson.feature(mundo, mundo.objects.paises).features;
    const W = 1200, H = 560;
    const proy = d3.geoEqualEarth().rotate([-10, 0]).fitExtent([[10, 10], [W - 10, H - 10]], { type: "Sphere" });
    const ruta = d3.geoPath(proy);
    const svg = d3.select("#mapamundi").attr("viewBox", [0, 0, W, H]);
    svg.append("path").attr("class", "reticula").attr("d", ruta(d3.geoGraticule10()));
    svg.append("path").attr("class", "contorno").attr("d", ruta({ type: "Sphere" }));

    const ficha = RM.fichaFlotante();
    const capas = svg.append("g").selectAll("path").data(paises).join("path")
      .attr("d", ruta)
      .attr("class", (d) => {
        const r = regionDe.get(d.properties.id);
        return "pais" + (r ? " region" : "") + (r && r.disponible ? " disponible" : "");
      })
      .style("fill", (d) => { const r = regionDe.get(d.properties.id); return r ? r.color : null; })
      .on("mousemove", (ev, d) => {
        const r = regionDe.get(d.properties.id);
        if (!r) { ficha.mostrar("<strong>" + RM.esc(d.properties.nombre) + "</strong>Fuera de las regiones del temario", ev); return; }
        resaltar(r.id);
        ficha.mostrar("<strong>Capítulo " + r.capitulo + ". " + RM.esc(r.titulo) + "</strong>" + RM.esc(d.properties.nombre) +
          "<br>" + (r.disponible ? "Pulsad para entrar" : "En preparación"), ev);
      })
      .on("mouseleave", () => { ficha.ocultar(); resaltar(null); })
      .on("click", (ev, d) => {
        const r = regionDe.get(d.properties.id);
        if (r && r.disponible) location.href = RM.url("region.html?r=" + r.id);
      });

    // Número de capítulo sobre el centro de cada región
    const numeros = svg.append("g");
    catalogo.regiones.forEach((r) => {
      const fc = { type: "FeatureCollection", features: paises.filter((p) => regionDe.get(p.properties.id) === r) };
      // centro del país mayor de la región, más estable que el centroide del conjunto
      const mayor = fc.features.slice().sort((a, b) => d3.geoArea(b) - d3.geoArea(a))[0];
      if (!mayor) return;
      const c = proy(r.centroEtiqueta || d3.geoCentroid(mayor));
      numeros.append("text").attr("class", "numero" + (r.disponible ? " disponible" : ""))
        .attr("x", c[0]).attr("y", c[1]).attr("text-anchor", "middle").attr("dominant-baseline", "middle")
        .attr("font-size", r.disponible ? 34 : 28).text(r.capitulo);
    });

    function resaltar(id) {
      capas.classed("apagado", (d) => {
        const r = regionDe.get(d.properties.id);
        return id != null && (!r || r.id !== id);
      });
      document.querySelectorAll("#capitulos .fila").forEach((f) => f.classList.toggle("activo", f.dataset.id === id));
    }

    // Lista de capítulos
    const lista = document.getElementById("capitulos");
    lista.innerHTML = catalogo.regiones.map((r) => {
      const dentro = '<span class="n">' + r.capitulo + '</span><span><span class="t"><span class="muestra" style="background:' + r.color +
        '"></span>' + RM.esc(r.titulo) + '</span><span class="s">' + RM.esc(r.subtitulo) + '</span></span><span class="estado">' +
        (r.disponible ? "Abrir" : "En preparación") + "</span>";
      return "<li>" + (r.disponible
        ? '<a class="fila" data-id="' + r.id + '" href="' + RM.url("region.html?r=" + r.id) + '">' + dentro + "</a>"
        : '<div class="fila" data-id="' + r.id + '">' + dentro + "</div>") + "</li>";
    }).join("");
    lista.querySelectorAll(".fila").forEach((f) => {
      f.addEventListener("mouseenter", () => resaltar(f.dataset.id));
      f.addEventListener("mouseleave", () => resaltar(null));
      f.addEventListener("focus", () => resaltar(f.dataset.id));
      f.addEventListener("blur", () => resaltar(null));
    });
  } catch (e) {
    RM.error(document.querySelector("main"), e);
  }
})();
