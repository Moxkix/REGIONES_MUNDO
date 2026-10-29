/* Pie común con autoría, licencias y fuentes generales. */
(function () {
  "use strict";
  const pie = document.getElementById("pie");
  if (!pie) return;
  pie.innerHTML = "<div>" +
    "<p>Recurso de apoyo a la tutoría de <em>Geografía de los grandes espacios mundiales</em> (Grado en Geografía e Historia, UNED). " +
    "Preparado por Iñaki Moro Deordal. No sustituye al manual ni a las indicaciones del equipo docente.</p>" +
    "<p>Cartografía base: Natural Earth (dominio público). Clima: clasificación de Köppen-Geiger 1986-2010 (Rubel et al., 2017). " +
    "Cada mapa y tabla indica la fuente y el año de sus datos.</p>" +
    '<p>Código con licencia MIT y contenidos con licencia CC BY 4.0. <a href="https://github.com/moxkix/regiones_mundo">Repositorio en GitHub</a>.</p>' +
    "</div>";
})();
