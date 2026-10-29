/* Clasificación climática de Köppen-Geiger a partir de normales mensuales.
   Criterios de Kottek et al. (2006), los mismos que usa el mapa de Rubel et al. (2017):
   límite C/D en −3 °C y umbral de aridez según el reparto estacional de la lluvia.

   RM.koppen(t[12], p[12], lat) → { codigo, pasos: [{ texto, resultado }], ind: {...} } */
(function () {
  "use strict";
  const f1 = (n) => RM.formato(n, 1), f0 = (n) => RM.formato(n, 0);

  function indicadores(t, p, lat) {
    const norte = lat >= 0;
    const verano = norte ? [3, 4, 5, 6, 7, 8] : [9, 10, 11, 0, 1, 2];
    const invierno = norte ? [9, 10, 11, 0, 1, 2] : [3, 4, 5, 6, 7, 8];
    const suma = (a) => a.reduce((x, y) => x + y, 0);
    const Pv = verano.map((i) => p[i]), Pi = invierno.map((i) => p[i]);
    const Tann = suma(t) / 12, Pann = suma(p);
    return {
      Tann, Pann, Tmax: Math.max(...t), Tmin: Math.min(...t),
      Pmin: Math.min(...p), Pmax: Math.max(...p),
      Psmin: Math.min(...Pv), Psmax: Math.max(...Pv), Pwmin: Math.min(...Pi), Pwmax: Math.max(...Pi),
      Pverano: suma(Pv), Pinvierno: suma(Pi),
      meses10: t.filter((x) => x >= 10).length,
      mesesSecos: t.map((x, i) => (p[i] < 2 * x ? i : -1)).filter((i) => i >= 0),
      mesesHelada: t.filter((x) => x < 0).length,
      amplitud: Math.max(...t) - Math.min(...t),
      mesMaxP: p.indexOf(Math.max(...p)), mesMinP: p.indexOf(Math.min(...p)),
      norte,
    };
  }

  function koppen(t, p, lat) {
    const I = indicadores(t, p, lat);
    const pasos = [];
    const MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const semestre = I.norte ? "abril-septiembre" : "octubre-marzo";

    // E: polares
    if (I.Tmax < 10) {
      pasos.push({ texto: "El mes más cálido no llega a 10 °C (" + f1(I.Tmax) + " °C): clima polar (E).", resultado: "E" });
      const c = I.Tmax >= 0 ? "ET" : "EF";
      pasos.push({ texto: I.Tmax >= 0 ? "El mes más cálido supera 0 °C: tundra (ET)." : "Ningún mes supera 0 °C: hielo perpetuo (EF).", resultado: c });
      return { codigo: c, pasos, ind: I };
    }
    pasos.push({ texto: "El mes más cálido supera 10 °C (" + f1(I.Tmax) + " °C): no es un clima polar.", resultado: "" });

    // B: secos
    const fv = I.Pverano / I.Pann;
    let extra, motivo;
    if (fv >= 2 / 3) { extra = 28; motivo = "al menos dos tercios de la lluvia caen en el semestre cálido (" + semestre + "), se suma 28"; }
    else if (fv <= 1 / 3) { extra = 0; motivo = "al menos dos tercios caen en el semestre frío, no se suma nada"; }
    else { extra = 14; motivo = "la lluvia está repartida entre los dos semestres (" + f0(fv * 100) + " % en el cálido), se suma 14"; }
    const Pth = 2 * I.Tann + extra;
    const umbral = 10 * Pth;
    pasos.push({ texto: "Umbral de aridez: 2 × temperatura media anual (" + f1(I.Tann) + " °C) y, como " + motivo + ": " + f1(Pth) +
      ". Es seco (B) si la lluvia anual es menor que 10 × umbral = " + f0(umbral) + " mm.", resultado: "" });
    if (I.Pann < umbral) {
      const W = I.Pann < 5 * Pth;
      const c = "B" + (W ? "W" : "S") + (I.Tann >= 18 ? "h" : "k");
      pasos.push({ texto: "Llueven " + f0(I.Pann) + " mm, menos de " + f0(umbral) + " mm: clima seco (B).", resultado: "B" });
      pasos.push({ texto: W ? "Además no llega a la mitad (" + f0(5 * Pth) + " mm): desierto (BW)." : "Supera la mitad del límite (" + f0(5 * Pth) + " mm): estepa (BS).", resultado: c.slice(0, 2) });
      pasos.push({ texto: I.Tann >= 18 ? "Temperatura media anual de 18 °C o más: cálido (h)." : "Temperatura media anual inferior a 18 °C: frío (k).", resultado: c });
      return { codigo: c, pasos, ind: I };
    }
    pasos.push({ texto: "Llueven " + f0(I.Pann) + " mm, más de " + f0(umbral) + " mm: no es un clima seco.", resultado: "" });

    // A, C, D según el mes más frío
    let g;
    if (I.Tmin >= 18) g = "A";
    else if (I.Tmin > -3) g = "C";
    else g = "D";
    pasos.push({ texto: "Mes más frío: " + f1(I.Tmin) + " °C. " + (g === "A" ? "Igual o superior a 18 °C: tropical (A)."
      : g === "C" ? "Entre −3 y 18 °C: templado (C)." : "Igual o inferior a −3 °C: continental o frío (D)."), resultado: g });

    let c = g;
    if (g === "A") {
      if (I.Pmin >= 60) { c += "f"; pasos.push({ texto: "El mes más seco recibe 60 mm o más: sin estación seca (Af).", resultado: c }); }
      else if (I.Pann >= 25 * (100 - I.Pmin)) { c += "m"; pasos.push({ texto: "Lluvia anual suficiente para compensar el mes seco: monzónico (Am).", resultado: c }); }
      else if (I.Psmin < 60 && I.Psmin <= I.Pwmin) { c += "s"; pasos.push({ texto: "La estación seca cae en verano (As).", resultado: c }); }
      else { c += "w"; pasos.push({ texto: "La estación seca cae en invierno: sabana (Aw).", resultado: c }); }
      return { codigo: c, pasos, ind: I };
    }

    // Segunda letra: régimen de lluvias
    let s;
    if (I.Psmin < I.Pwmin && I.Pwmax > 3 * I.Psmin && I.Psmin < 40) {
      s = "s";
      pasos.push({ texto: "Verano seco (s): el mes más seco del verano (" + f0(I.Psmin) + " mm) recibe menos de 40 mm y menos de un tercio que el mes más lluvioso del invierno (" + f0(I.Pwmax) + " mm).", resultado: c + s });
    } else if (I.Pwmin < I.Psmin && I.Psmax > 10 * I.Pwmin) {
      s = "w";
      pasos.push({ texto: "Invierno seco (w): el mes más lluvioso del verano (" + f0(I.Psmax) + " mm) recibe más de diez veces que el más seco del invierno (" + f0(I.Pwmin) + " mm).", resultado: c + s });
    } else {
      s = "f";
      pasos.push({ texto: "Sin estación seca marcada (f): no se cumplen las condiciones de verano seco ni de invierno seco (mes más seco del verano: " + f0(I.Psmin) + " mm; del invierno: " + f0(I.Pwmin) + " mm).", resultado: c + s });
    }
    c += s;

    // Tercera letra: calor del verano
    let v;
    if (I.Tmax >= 22) { v = "a"; pasos.push({ texto: "Mes más cálido de 22 °C o más (" + f1(I.Tmax) + " °C): verano caluroso (a).", resultado: c + v }); }
    else if (I.meses10 >= 4) { v = "b"; pasos.push({ texto: "Mes más cálido por debajo de 22 °C, pero " + I.meses10 + " meses superan 10 °C: verano templado (b).", resultado: c + v }); }
    else if (g === "D" && I.Tmin <= -38) { v = "d"; pasos.push({ texto: "Mes más frío de −38 °C o menos: invierno extremo (d).", resultado: c + v }); }
    else { v = "c"; pasos.push({ texto: "Solo " + I.meses10 + " meses superan 10 °C: verano corto y fresco (c).", resultado: c + v }); }
    c += v;
    return { codigo: c, pasos, ind: I };
  }

  window.RM.koppen = koppen;
  window.RM.indicadoresClima = indicadores;
})();
