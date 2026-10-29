/* Cuestionario de opción múltiple con retroalimentación inmediata.

   new RM.Cuestionario(contenedor, preguntas, opciones)
   preguntas: [{ id, enunciado, opciones: [{ t, ok, r }], explicacion: [párrafos], manual }]
     t  texto de la opción · ok  true si es correcta · r  retroalimentación de esa opción
   opciones: { clave, alMostrar(pregunta, indice), titulo }
   Las soluciones siempre se pueden consultar con «Ver la solución». */
(function () {
  "use strict";
  const LETRAS = "abcdefgh";

  class Cuestionario {
    constructor(contenedor, preguntas, op) {
      this.el = contenedor;
      this.p = preguntas;
      this.op = op || {};
      this.clave = "cuestionario:" + (this.op.clave || "general");
      this.resp = RM.memoria.leer(this.clave, {});
      this.i = 0;
      this.el.classList.add("cuestionario");
      this.mostrar(0);
    }

    guardar() { RM.memoria.guardar(this.clave, this.resp); }

    mostrar(i) {
      this.i = i;
      const q = this.p[i];
      const r = this.resp[q.id];
      const respondidas = Object.keys(this.resp).filter((k) => this.p.some((x) => x.id === k)).length;
      this.el.innerHTML =
        '<div class="progreso"><span>Pregunta ' + (i + 1) + " de " + this.p.length + "</span>" +
        "<span>" + respondidas + " respondidas</span></div>" +
        '<p class="enunciado">' + RM.esc(q.enunciado) + "</p>" +
        '<ol class="opciones">' + q.opciones.map((o, j) =>
          '<li><button type="button" class="opcion" data-j="' + j + '"><span class="letra">' + LETRAS[j] + ")</span><span>" +
          RM.esc(o.t) + "</span></button></li>").join("") + "</ol>" +
        '<div class="resultado" aria-live="polite"></div>' +
        '<div class="navegacion">' +
        '<button type="button" data-accion="anterior"' + (i === 0 ? " disabled" : "") + ">Anterior</button>" +
        '<button type="button" data-accion="solucion">Ver la solución</button>' +
        '<button type="button" class="principal" data-accion="siguiente">' +
        (i === this.p.length - 1 ? "Ver el resumen" : "Siguiente") + "</button></div>";

      this.el.querySelectorAll(".opcion").forEach((b) =>
        b.addEventListener("click", () => this.responder(+b.dataset.j)));
      this.el.querySelector('[data-accion="anterior"]').addEventListener("click", () => this.mostrar(i - 1));
      this.el.querySelector('[data-accion="solucion"]').addEventListener("click", () => this.corregir(null, true));
      this.el.querySelector('[data-accion="siguiente"]').addEventListener("click", () =>
        i === this.p.length - 1 ? this.resumen() : this.mostrar(i + 1));

      if (this.op.alMostrar) this.op.alMostrar(q, i);
      if (r) this.corregir(r.elegida, r.elegida == null);
    }

    responder(j) {
      const q = this.p[this.i];
      if (this.resp[q.id] && this.resp[q.id].elegida != null) return; // primera respuesta cuenta
      this.resp[q.id] = { elegida: j, ok: !!q.opciones[j].ok };
      this.guardar();
      this.corregir(j, false);
    }

    corregir(j, soloSolucion) {
      const q = this.p[this.i];
      if (soloSolucion && !this.resp[q.id]) { this.resp[q.id] = { elegida: null, ok: false }; this.guardar(); }
      const botones = this.el.querySelectorAll(".opcion");
      botones.forEach((b, k) => {
        const o = q.opciones[k];
        b.classList.toggle("correcta", !!o.ok);
        b.classList.toggle("incorrecta", k === j && !o.ok);
        b.setAttribute("aria-disabled", "true");
        if ((o.ok || k === j) && o.r && !b.querySelector(".retro")) {
          const s = document.createElement("span");
          s.className = "retro"; s.textContent = o.r;
          b.appendChild(s);
        }
      });
      const veredicto = j == null ? '<p class="veredicto">Solución</p>'
        : q.opciones[j].ok ? '<p class="veredicto bien">Correcto.</p>'
          : '<p class="veredicto mal">No es esa. La correcta está marcada en verde.</p>';
      this.el.querySelector(".resultado").innerHTML = veredicto +
        '<div class="explicacion">' + (q.explicacion || []).map((t) => "<p>" + t + "</p>").join("") +
        (q.manual ? '<p class="nota">Manual: ' + RM.esc(q.manual) + "</p>" : "") + "</div>";
    }

    resumen() {
      const bien = this.p.filter((q) => this.resp[q.id] && this.resp[q.id].ok).length;
      const sin = this.p.filter((q) => !this.resp[q.id] || this.resp[q.id].elegida == null);
      this.el.innerHTML = '<div class="resumen"><h3>' + bien + " de " + this.p.length + " acertadas</h3>" +
        (sin.length ? "<p>Preguntas sin responder o consultadas sin contestar:</p><ol>" +
          sin.map((q) => "<li>" + RM.esc(q.enunciado) + "</li>").join("") + "</ol>" : "") +
        '<div class="navegacion"><button type="button" data-accion="repasar">Repasar desde el principio</button>' +
        '<button type="button" class="principal" data-accion="reiniciar">Empezar de nuevo</button></div></div>';
      this.el.querySelector('[data-accion="repasar"]').addEventListener("click", () => this.mostrar(0));
      this.el.querySelector('[data-accion="reiniciar"]').addEventListener("click", () => {
        this.resp = {}; this.guardar(); this.mostrar(0);
      });
    }
  }

  window.RM = window.RM || {};
  window.RM.Cuestionario = Cuestionario;
})();
