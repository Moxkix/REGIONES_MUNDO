/* Extracción de los datos de ciudades de World Urbanization Prospects 2025.

   La web de la ONU solo publica las ciudades en Excel. Este guion se pega en la consola
   del navegador con una página de https://population.un.org/wup/ abierta, lee los archivos
   sin librerías externas y devuelve los cuatro extractos de texto de esta carpeta:

     ciudades.txt         ISO3|ciudad|lon|lat|capital|1975|1990|2000|2010|2025|2035|2050 (miles)
                          ciudades de los países de las regiones disponibles con 100 000 hab. o más en algún año
     top_mundo.txt        ISO3|ciudad|lon|lat|1975|2000|2025|2050: las 40 mayores ciudades del mundo en 2025
     agregados.txt        ISO3|año|pob. en ciudades|en ciudades de 200 000 o más|de 1 millón o más|n.º de 1 millón|n.º de 500 000
     urbano_nacional.txt  ISO3|% urbano 1950|1960|...|2050 (definiciones nacionales)

   Para añadir una región, ampliad la lista PAISES y volved a ejecutarlo.
   Después: python3 herramientas/ciudades_wup.py */
(async () => {
  const PAISES = "ALB,AND,AUT,BEL,BGR,BIH,CHE,CYP,CYN,CZE,DEU,DNK,ESP,EST,FIN,FRA,GBR,GRC,HRV,HUN,IRL,ISL,ITA,LIE,LTU,LUX,LVA,MCO,MKD,MLT,MNE,NLD,NOR,POL,PRT,ROU,SMR,SRB,SVK,SVN,SWE,VAT,XKX,RUS,UKR,BLR,MDA,GEO,ARM,AZE,KAZ,TKM,UZB,KGZ,TJK,JPN,AUS".split(",");
  const COMPARAR = "USA,CAN,JPN,CHN,IND,BRA,NGA,TUR,AUS,MEX,EGY,KOR,NZL".split(",");
  const BASE = "https://population.un.org/wup/assets/Download/";

  async function leerZip(url) {
    const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
    const dv = new DataView(buf.buffer);
    let e = buf.length - 22; while (dv.getUint32(e, true) !== 0x06054b50) e--;
    const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
    const ent = {};
    for (let i = 0; i < n; i++) {
      const met = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), fl = dv.getUint16(p + 28, true),
        xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      ent[new TextDecoder().decode(buf.subarray(p + 46, p + 46 + fl))] = { met, csize, off }; p += 46 + fl + xl + cl;
    }
    return async (name) => {
      const x = ent[name]; if (!x) return null;
      const lf = dv.getUint16(x.off + 26, true), lx = dv.getUint16(x.off + 28, true);
      const data = buf.subarray(x.off + 30 + lf + lx, x.off + 30 + lf + lx + x.csize);
      if (x.met === 0) return new TextDecoder().decode(data);
      return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
    };
  }
  async function hoja(leer, ruta) {
    const ent = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    const ss = await leer("xl/sharedStrings.xml");
    const strs = ss ? [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => ent([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(""))) : [];
    const xml = await leer(ruta), filas = [];
    for (const m of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const f = [];
      for (const c of m[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const col = c[1].split("").reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
        const t = (c[2].match(/t="(\w+)"/) || [])[1];
        let v = (c[3] || "").match(/<v>([\s\S]*?)<\/v>/); v = v ? v[1] : ((c[3] || "").match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1];
        if (v != null) f[col] = t === "s" ? strs[+v] : (t === "str" || t === "inlineStr" ? v : +v);
      }
      filas.push(f);
    }
    return filas;
  }

  // Ciudades (F21: población de las ciudades según el grado de urbanización, 1975-2050)
  const f = await hoja(await leerZip(BASE + "Cities/WUP2025-F21-DEGURBA-Cities_Pop.xlsx"), "xl/worksheets/sheet2.xml");
  const cab = f[0], col = (y) => cab.indexOf(String(y));
  const Y = [1975, 1990, 2000, 2010, 2025, 2035, 2050];
  const M = new Map();
  for (const r of f.slice(1)) {
    if (!r || !PAISES.includes(r[4])) continue;
    const k = r[4] + "|" + r[7], v = Y.map((y) => r[col(y)] ?? null);
    if (!M.has(k)) M.set(k, { iso: r[4], n: r[7], lon: r[9], lat: r[10], cap: r[8], v });
    else { const o = M.get(k); o.v = o.v.map((x, j) => x ?? v[j]); if (r[8]) o.cap = 1; if (v[4]) { o.lon = r[9]; o.lat = r[10]; } }
  }
  const ciudades = [...M.values()].filter((o) => Math.max(...o.v.map((x) => x || 0)) >= 100)
    .map((o) => [o.iso, o.n, o.lon.toFixed(2), o.lat.toFixed(2), o.cap ? 1 : "", ...o.v.map((x) => x == null ? "" : Math.round(x))].join("|"));
  const top = f.slice(1).filter((r) => r).sort((a, b) => (b[col(2025)] || 0) - (a[col(2025)] || 0)).slice(0, 40)
    .map((r) => [r[4], r[7], r[9].toFixed(2), r[10].toFixed(2), ...[1975, 2000, 2025, 2050].map((y) => Math.round(r[col(y)] || 0))].join("|"));
  const A = {};
  for (const r of f.slice(1)) {
    if (!r) continue;
    for (const iso of [r[4], "WLD"]) {
      if (iso !== "WLD" && !PAISES.concat(COMPARAR).includes(iso)) continue;
      for (const y of [1975, 2000, 2025, 2050]) {
        const v = r[col(y)]; if (v == null) continue;
        const a = A[iso + "|" + y] || (A[iso + "|" + y] = [0, 0, 0, 0, 0]);
        a[0] += v; if (v >= 200) a[1] += v; if (v >= 1000) { a[2] += v; a[3]++; } if (v >= 500) a[4]++;
      }
    }
  }
  const agregados = Object.entries(A).map(([k, a]) => k + "|" + a.map((x, i) => i >= 3 ? x : Math.round(x)).join("|"));

  // Porcentaje urbano según las definiciones nacionales
  const csv = await new Response((await fetch(BASE + "Countries%20and%20Aggregates/WUP2025-DB-National-Definitions-Population-Data.csv.gz")).body
    .pipeThrough(new DecompressionStream("gzip"))).text();
  const YU = ["1950", "1960", "1970", "1980", "1990", "2000", "2010", "2015", "2020", "2025", "2030", "2040", "2050"];
  const U = {};
  for (const l of csv.split("\n")) {
    const c = l.replace("\r", "").split(",");
    if (c[11] !== "Urban" || !YU.includes(c[12])) continue;
    if (c[4] && PAISES.concat(COMPARAR).includes(c[4])) (U[c[4]] = U[c[4]] || {})[c[12]] = (+c[17]).toFixed(1);
  }
  const urbano = Object.entries(U).map(([k, v]) => k + "|" + YU.map((y) => v[y] ?? "").join("|"));

  console.log({ "ciudades.txt": ciudades.join("\n"), "top_mundo.txt": top.join("\n"), "agregados.txt": agregados.join("\n"), "urbano_nacional.txt": urbano.join("\n") });
})();
