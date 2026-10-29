/* Climograma de Gaussen con la escala de Walter-Lieth: 1 °C = 2 mm hasta 100 mm
   y, por encima de 100 mm, escala reducida a 1/10 (1 °C = 20 mm).
   Los meses en que la curva de temperatura queda por encima de las barras (P < 2T) son secos.

   RM.climograma(svg, estacion, { comparar, mini }) */
(function () {
  "use strict";
  const MESES = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  const MESES_L = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

  // precipitación → «grados equivalentes» del eje común
  const pEq = (p) => (p <= 100 ? p / 2 : 50 + (p - 100) / 20);

  function climograma(svgEl, e, op) {
    op = op || {};
    const mini = !!op.mini;
    const W = mini ? 240 : 640, H = mini ? 170 : 400;
    const m = mini ? { t: 10, r: 26, b: 18, l: 26 } : { t: 26, r: 56, b: 36, l: 48 };
    const svg = d3.select(svgEl).attr("viewBox", [0, 0, W, H]).attr("class", "climograma");
    svg.selectAll("*").remove();

    const series = [e].concat(op.comparar ? [op.comparar] : []);
    const tmin = Math.min(0, ...series.map((s) => Math.min(...s.t)));
    const pmaxEq = Math.max(...series.map((s) => Math.max(...s.p.map(pEq))));
    const tmax = Math.max(...series.map((s) => Math.max(...s.t)));
    const arriba = Math.max(30, Math.ceil(Math.max(tmax, pmaxEq) / 10) * 10);
    const abajo = Math.floor(tmin / 10) * 10;

    const x = d3.scaleBand().domain(d3.range(12)).range([m.l, W - m.r]).padding(0.18);
    const y = d3.scaleLinear().domain([abajo, arriba]).range([H - m.b, m.t]);

    // meses secos (P < 2T) de la estación principal
    e.t.forEach((t, i) => {
      if (e.p[i] < 2 * t) svg.append("rect").attr("class", "seco").attr("x", x(i) - x.step() * x.padding() / 2).attr("width", x.step())
        .attr("y", y(arriba)).attr("height", y(abajo) - y(arriba));
    });

    // rejilla
    const ticksT = d3.range(abajo, arriba + 1, 10);
    svg.append("g").selectAll("line").data(ticksT).join("line").attr("class", (d) => "rejilla" + (d === 0 ? " cero" : ""))
      .attr("x1", m.l).attr("x2", W - m.r).attr("y1", y).attr("y2", y);

    // barras de precipitación (por encima de 100 mm, tramo con escala reducida)
    const bw = op.comparar ? x.bandwidth() / 2 : x.bandwidth();
    series.forEach((s, k) => {
      const g = svg.append("g").attr("class", "barras" + (k ? " comparada" : ""));
      s.p.forEach((p, i) => {
        const x0 = x(i) + k * bw;
        const h1 = Math.min(p, 100);
        g.append("rect").attr("class", "p").attr("x", x0).attr("width", bw).attr("y", y(h1 / 2)).attr("height", y(0) - y(h1 / 2))
          .append("title").text(MESES_L[i] + ": " + RM.formato(p, 0) + " mm");
        if (p > 100) g.append("rect").attr("class", "p alta").attr("x", x0).attr("width", bw).attr("y", y(pEq(p))).attr("height", y(50) - y(pEq(p)))
          .append("title").text(MESES_L[i] + ": " + RM.formato(p, 0) + " mm (escala reducida)");
      });
    });

    // curvas de temperatura
    const linea = d3.line().x((d, i) => x(i) + x.bandwidth() / 2).y((d) => y(d));
    series.forEach((s, k) => {
      svg.append("path").attr("class", "t" + (k ? " comparada" : "")).attr("d", linea(s.t));
      if (!mini) svg.append("g").selectAll("circle").data(s.t).join("circle").attr("class", "tp" + (k ? " comparada" : ""))
        .attr("cx", (d, i) => x(i) + x.bandwidth() / 2).attr("cy", y).attr("r", 3)
        .append("title").text((d, i) => MESES_L[i] + ": " + RM.formato(d, 1) + " °C");
    });

    // ejes
    const fs = mini ? 10 : 13;
    svg.append("g").attr("class", "eje").attr("transform", "translate(" + m.l + ",0)")
      .call(d3.axisLeft(y).tickValues(ticksT).tickSize(3).tickFormat((d) => d)).attr("font-size", fs);
    const ticksP = [0, 20, 40, 60, 80, 100, 200, 300, 400, 500, 600].filter((p) => pEq(p) <= arriba && (!mini || [0, 50, 100, 200, 300, 400].includes(p) || p === 0));
    const ticksPm = mini ? [0, 50, 100].filter((p) => pEq(p) <= arriba) : ticksP;
    svg.append("g").attr("class", "eje eje-p").attr("transform", "translate(" + (W - m.r) + ",0)")
      .call(d3.axisRight(d3.scaleLinear().domain([abajo, arriba]).range(y.range())).tickValues(ticksPm.map(pEq)).tickSize(3)
        .tickFormat((d) => { const p = d <= 50 ? d * 2 : 100 + (d - 50) * 20; return RM.formato(p, 0); })).attr("font-size", fs);
    svg.append("g").attr("class", "eje").attr("transform", "translate(0," + (H - m.b) + ")")
      .call(d3.axisBottom(x).tickFormat((i) => MESES[i]).tickSize(0)).attr("font-size", fs).call((g) => g.select(".domain").remove());
    if (!mini) {
      svg.append("text").attr("class", "titulo-eje").attr("x", m.l - 36).attr("y", m.t - 10).text("°C");
      svg.append("text").attr("class", "titulo-eje").attr("x", W - m.r + 8).attr("y", m.t - 10).text("mm");
      if (series.some((s) => s.p.some((p) => p > 100)))
        svg.append("line").attr("class", "corte-escala").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(50)).attr("y2", y(50));
    }
    return svg;
  }

  window.RM.climograma = climograma;
  window.RM.MESES = MESES_L;
})();
