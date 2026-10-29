/* Página de presentación de una región: resumen, herramientas, manual frente a actualidad. */
(async function () {
  "use strict";
  const barra = document.getElementById("barra");
  const main = document.getElementById("region");
  let R;
  try { R = await RM.region(); } catch (e) { RM.cabecera(barra); RM.error(main, e); return; }
  const { ficha, config } = R;
  RM.cabecera(barra, ficha, "region", ficha.motores);
  document.title = "Capítulo " + ficha.capitulo + ". " + ficha.titulo;
  const P = config.presentacion || {};

  const HERR = {
    atlas: ["atlas.html", "Atlas de lectura cruzada", "Relieve, clima, población, industria y situación política superpuestos o enfrentados con una cortinilla, con preguntas guiadas."],
    climas: ["climas.html", "Climogramas", "Estaciones con datos de 1991-2020, clasificación de Köppen paso a paso, dinámica atmosférica y ejercicio de dominios climáticos."],
  };

  let html = '<header class="cab-region"><div class="numero" aria-hidden="true">' + ficha.capitulo + "</div><div>" +
    "<h1>" + RM.esc(ficha.titulo) + '</h1><p class="subtitulo">' + RM.esc(ficha.subtitulo) + "</p></div></header>" +
    '<section class="bloque resumen">' + (P.resumen || []).map((t) => "<p>" + RM.esc(t) + "</p>").join("") + "</section>" +
    '<section class="bloque" aria-labelledby="t-herr"><h2 id="t-herr">Herramientas</h2><div class="herramientas-region">' +
    ficha.motores.map((m) => HERR[m] ? '<a href="' + RM.url(HERR[m][0] + "?r=" + ficha.id) + '"><strong>' + HERR[m][1] + "</strong><span>" + HERR[m][2] + "</span></a>" : "").join("") +
    "</div></section>" +
    '<section class="bloque" id="b-actualizacion" aria-labelledby="t-act"></section>' +
    '<section class="bloque" id="b-paises" aria-labelledby="t-paises"></section>' +
    (P.indice ? '<section class="bloque" aria-labelledby="t-ind"><h2 id="t-ind">Índice del capítulo</h2><ol class="indice">' +
      P.indice.map((t) => "<li>" + RM.esc(t) + "</li>").join("") + "</ol></section>" : "");
  main.innerHTML = html;

  // Manual frente a actualidad
  if (P.actualizacion) {
    try {
      const A = await RM.json(R.carpeta + P.actualizacion);
      const temas = [...new Set(A.items.map((i) => i.tema))];
      document.getElementById("b-actualizacion").innerHTML =
        '<h2 id="t-act">El manual y la actualidad</h2><p>' + RM.esc(A.nota) + " Revisión: " + RM.esc(A.revisado) + ".</p>" +
        '<div class="tabla-desplazable"><table class="datos actualizacion"><thead><tr><th>Apartado</th><th>Lo que dice el manual</th><th>Situación actual</th><th>Qué ha cambiado</th></tr></thead><tbody>' +
        temas.map((t) => '<tr class="tema"><th colspan="4">' + RM.esc(t) + "</th></tr>" + A.items.filter((i) => i.tema === t).map((i) =>
          '<tr><td class="ap" data-t="Apartado">' + RM.esc(i.apartado) + '</td><td data-t="Manual">' + RM.esc(i.manual) +
          '</td><td data-t="Actualidad">' + RM.esc(i.actual) + '<span class="fuente">' + RM.esc(i.fecha) + "</span></td>" +
          '<td data-t="Qué ha cambiado">' + RM.esc(i.nota) +
          '<span class="fuente">Fuente: ' + (i.url ? '<a href="' + RM.esc(i.url) + '">' + RM.esc(i.fuente) + "</a>" : RM.esc(i.fuente)) + "</span>" +
          (i.observaciones ? '<span class="obs">' + RM.esc(i.observaciones) + "</span>" : "") + "</td></tr>").join("")).join("") +
        "</tbody></table></div>";
    } catch (e) { console.warn(e); }
  }

  // Datos por país (si la región tiene datos/paises.json)
  try {
    const D = await RM.json(R.carpeta + "datos/paises.json");
    const filas = Object.entries(D.paises).map(([iso, d]) => Object.assign({ iso }, d));
    const cols = [
      ["nombre", "País", 0, false],
      ["poblacion_manual", "Población 2015 (M, manual)", 1, true],
      ["poblacion", "Población 2025 (M)", 1, true],
      ["densidad_manual", "Densidad 2015 (manual)", 0, true],
      ["densidad", "Densidad actual", 0, true],
      ["pct65_manual", "65 y más, 2015 (%)", 0, true],
      ["pct65", "65 y más, actual (%)", 1, true],
    ];
    let orden = ["poblacion", -1];
    const pinta = () => {
      const f = filas.slice().sort((a, b) => {
        const [c, s] = orden; const va = a[c], vb = b[c];
        if (va == null) return 1; if (vb == null) return -1;
        return typeof va === "string" ? s * va.localeCompare(vb, "es") : s * (va - vb);
      });
      document.getElementById("b-paises").innerHTML =
        '<h2 id="t-paises">Datos por país</h2><p>' + RM.esc(D.nota) + "</p>" +
        '<div class="tabla-desplazable"><table class="datos tabla-paises"><thead><tr>' +
        cols.map(([c, t, , num]) => '<th class="' + (num ? "num" : "") + '"><button type="button" data-c="' + c + '"' +
          (orden[0] === c ? ' aria-sort="' + (orden[1] > 0 ? "ascending" : "descending") + '"' : "") + ">" + t + "</button></th>").join("") +
        "</tr></thead><tbody>" + f.map((d) => "<tr>" + cols.map(([c, , dec, num]) => {
          let v = d[c];
          if (c === "poblacion" && v != null) v = v / 1e6;
          return '<td class="' + (num ? "num" : "") + '">' + (num ? RM.formato(v, dec) : RM.esc(v)) + "</td>";
        }).join("") + "</tr>").join("") + "</tbody></table></div>" +
        '<p class="nota">' + RM.esc(D.fuentes) + "</p>";
      document.querySelectorAll("#b-paises th button").forEach((b) => b.addEventListener("click", () => {
        orden = [b.dataset.c, orden[0] === b.dataset.c ? -orden[1] : (b.dataset.c === "nombre" ? 1 : -1)];
        pinta();
        document.querySelector('#b-paises th button[data-c="' + orden[0] + '"]').focus();
      }));
    };
    pinta();
  } catch (e) { /* la región no tiene tabla por países */ }
})();
