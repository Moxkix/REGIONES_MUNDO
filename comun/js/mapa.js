/* Mapa base común: proyección de la región, mar, retícula, tierras y fronteras.

   const m = new RM.Mapa(svg, config, mundo, { ancho: 1000, zoom: true })
   m.capa(nombre)        devuelve (o crea) un grupo <g> dentro de la vista, en orden de creación
   m.proy, m.ruta        proyección y generador de trazados de d3
   m.lonlat(evento)      coordenadas geográficas bajo el puntero (teniendo en cuenta el zoom)
   m.vistas              grupos que reciben la transformación del zoom (para la cortinilla) */
(function () {
  "use strict";

  class Mapa {
    constructor(svg, config, mundo, op) {
      op = op || {};
      this.config = config;
      this.svg = d3.select(svg);
      const W = op.ancho || 1000;
      this.proy = RM.proyeccion(config.proyeccion);
      const caja = RM.ventana(config.ventana);
      this.proy.fitWidth(W, caja);
      const b = d3.geoPath(this.proy).bounds(caja);
      const H = Math.ceil(b[1][1] - b[0][1]);
      this.proy.fitExtent([[0, 0], [W, H]], caja);
      this.W = W; this.H = H;
      this.ruta = d3.geoPath(this.proy);
      this.svg.attr("viewBox", [0, 0, W, H]).attr("preserveAspectRatio", "xMidYMid meet");

      const defs = this.svg.append("defs");
      this.idClip = "clip-" + Math.random().toString(36).slice(2, 8);
      defs.append("clipPath").attr("id", this.idClip).append("rect").attr("width", W).attr("height", H);
      this.defs = defs;

      this.svg.append("rect").attr("class", "mar").attr("width", W).attr("height", H);
      this.marco = this.svg.append("g").attr("clip-path", "url(#" + this.idClip + ")");
      this.vista = this.marco.append("g").attr("class", "vista");
      this.vistas = [this.vista];
      this.grupos = new Map();

      this.paises = topojson.feature(mundo, mundo.objects.paises).features;
      this.capa("reticula").append("path").attr("class", "reticula")
        .attr("d", this.ruta(d3.geoGraticule().step([10, 10])()));
      this.capa("tierra").selectAll("path").data(this.paises).join("path")
        .attr("class", "tierra").attr("d", this.ruta);
      this.fronterasMalla = topojson.mesh(mundo, mundo.objects.paises, (a, b) => a !== b);
      this.costaMalla = topojson.mesh(mundo, mundo.objects.paises, (a, b) => a === b);

      this.k = 1;
      if (op.zoom) {
        this.zoom = d3.zoom().scaleExtent([1, 8]).translateExtent([[0, 0], [W, H]])
          .on("zoom", (ev) => {
            this.k = ev.transform.k;
            this.vistas.forEach((v) => v.attr("transform", ev.transform));
            this.svg.style("--k", ev.transform.k);
            if (this.alZoom) this.alZoom(ev.transform);
          });
        this.svg.call(this.zoom).on("dblclick.zoom", null);
      }
    }

    capa(nombre, vista) {
      const clave = (vista ? "d:" : "") + nombre;
      if (!this.grupos.has(clave)) this.grupos.set(clave, (vista || this.vista).append("g").attr("class", "capa capa-" + nombre));
      return this.grupos.get(clave);
    }

    fronteras(grupo) {
      grupo.append("path").attr("class", "frontera").attr("d", this.ruta(this.fronterasMalla));
      grupo.append("path").attr("class", "costa").attr("d", this.ruta(this.costaMalla));
    }

    lonlat(ev) {
      const [x, y] = d3.pointer(ev, this.vista.node());
      return this.proy.invert([x, y]);
    }

    restablecer() {
      if (this.zoom) this.svg.transition().duration(300).call(this.zoom.transform, d3.zoomIdentity);
    }

    acercar(f) {
      if (this.zoom) this.svg.transition().duration(200).call(this.zoom.scaleBy, f);
    }
  }

  window.RM.Mapa = Mapa;
})();
