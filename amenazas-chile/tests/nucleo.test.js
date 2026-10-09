// Pruebas del núcleo y de los armadores de URL. Ejecutar: node tests/nucleo.test.js
// Todos los datos de aquí son de prueba (inventados), no registros reales.
const assert = require("assert");
const N = require("../nucleo.js");
const F = require("../fuentes.js");
const semilla = require("../datos/aluviones.js");

// ---- Fechas ----------------------------------------------------------------
assert.strictEqual(N.normalizarFecha("2015-03-25"), "2015-03-25");
assert.strictEqual(N.normalizarFecha("2015-03-25T14:05:00Z"), "2015-03-25T14:05");
assert.strictEqual(N.normalizarFecha("25-03-2015"), "2015-03-25");
assert.strictEqual(N.normalizarFecha("25/03/2015 08:30"), "2015-03-25T08:30");
assert.strictEqual(N.normalizarFecha("03/25/2015 02:00:00 PM"), "2015-03-25T14:00");
assert.strictEqual(N.normalizarFecha("2015/3/5"), "2015-03-05");
assert.strictEqual(N.normalizarFecha("texto"), "");
assert.strictEqual(N.normalizarFecha("1762"), "1762");
assert.strictEqual(N.normalizarFecha(Date.UTC(2020, 0, 2, 3, 4)), "2020-01-02T03:04");

assert.strictEqual(N.sumarDias("2024-02-28", 1), "2024-02-29");
assert.strictEqual(N.sumarDias("2024-03-01", -1), "2024-02-29");
assert.strictEqual(N.diasEntre("2024-01-01", "2024-12-31"), 365);

assert.deepStrictEqual(N.tramosFechas("2026-01-01", "2026-01-25", 10), [
  { fecha: "2026-01-01", dias: 10 },
  { fecha: "2026-01-11", dias: 10 },
  { fecha: "2026-01-21", dias: 5 },
]);
assert.deepStrictEqual(N.tramosFechas("2026-01-01", "2026-01-01"), [{ fecha: "2026-01-01", dias: 1 }]);

// ---- Distancias ------------------------------------------------------------
assert.ok(Math.abs(N.distanciaKm(-33, -70, -34, -70) - 111.19) < 0.1);
const p = N.desplazar(-33.45, -70.66, 6, 135);
assert.ok(Math.abs(N.distanciaKm(-33.45, -70.66, p.lat, p.lon) - 6) < 0.01);
assert.strictEqual(N.puntosRelieve(-33, -70).length, 1 + 8 * N.RADIOS_RELIEVE.length);

// ---- Filtros e histograma --------------------------------------------------
const items = [
  { fecha: "2020-01-05", lat: -33, lon: -70 },
  { fecha: "2020-01-20T10:00", lat: -20, lon: -69 },
  { fecha: "2020-02", lat: -33, lon: -70 },        // fecha parcial (solo mes)
  { fecha: "2021-06-01", lat: -33, lon: -70 },
  { fecha: "", lat: -33, lon: -70 },               // sin fecha: se descarta
];
assert.strictEqual(N.filtrar(items, { desde: "2020-01-01", hasta: "2020-12-31" }).length, 3);
assert.strictEqual(N.filtrar(items, { desde: "2020-02-10", hasta: "2020-03-01" }).length, 1);
assert.strictEqual(N.filtrar(items, { caja: { sur: -34, norte: -30, oeste: -71, este: -69 } }).length, 3);

let h = N.histograma(items.slice(0, 2), "2020-01-01", "2020-01-31");
assert.strictEqual(h.paso, "dia");
assert.strictEqual(h.barras.length, 31);
assert.strictEqual(h.barras.find((b) => b.periodo === "2020-01-20").n, 1);
h = N.histograma(items, "2020-01-01", "2021-12-31");
assert.strictEqual(h.paso, "mes");
assert.strictEqual(h.barras.length, 24);
assert.strictEqual(h.barras[0].n, 2);
h = N.histograma(items, "1990-01-01", "2021-12-31");
assert.strictEqual(h.paso, "anio");
assert.strictEqual(h.barras.find((b) => b.periodo === "2020").n, 3);

// ---- CSV -------------------------------------------------------------------
const csvPuntoComa = 'Fecha;Latitud;Longitud;Magnitud;Profundidad;Referencia\n' +
  '2020-05-01 10:00;-30,5;-71,6;4,2;45;"12 km al O de ""Lugar""; Chile"\n';
const sCsv = N.parsearSismosCSV(csvPuntoComa, "CSN");
assert.strictEqual(sCsv.length, 1);
assert.strictEqual(sCsv[0].mag, 4.2);
assert.strictEqual(sCsv[0].lat, -30.5);
assert.strictEqual(sCsv[0].lugar, '12 km al O de "Lugar"; Chile');
assert.strictEqual(sCsv[0].fecha, "2020-05-01T10:00");

const firmsCsv = "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight\n" +
  "-36.80000,-72.90000,340.1,0.4,0.6,2026-02-01,0412,N,VIIRS,n,2.0NRT,290.1,10.5,N\n" +
  "-36.80500,-72.90500,345.0,0.4,0.6,2026-02-02,1730,N,VIIRS,h,2.0NRT,295.0,20.0,D\n" +
  "-36.81000,-72.91000,341.0,0.4,0.6,2026-02-03,0400,N,VIIRS,n,2.0NRT,291.0,5.0,N\n" +
  "-38.00000,-72.00000,330.0,0.4,0.6,2026-02-01,0400,N,VIIRS,l,2.0NRT,289.0,1.5,N\n" +
  "-36.80000,-72.90000,330.0,0.4,0.6,2026-02-20,0400,N,VIIRS,n,2.0NRT,289.0,2.0,N\n";
const det = N.parsearFIRMS(firmsCsv);
assert.strictEqual(det.length, 5);
assert.strictEqual(det[0].fecha, "2026-02-01T04:12");
assert.strictEqual(det[1].frp, 20);
const focos = N.agruparFocos(det.map((d) => ({ ...d })), 2, 2);
assert.strictEqual(focos.length, 3, "cadena de 3 días juntos, uno lejano y uno que reaparece 17 días después");
assert.strictEqual(focos[0].detecciones, 3);
assert.strictEqual(focos[0].inicio, "2026-02-01");
assert.strictEqual(focos[0].fin, "2026-02-03");
assert.strictEqual(focos[0].dias, 3);
assert.strictEqual(focos[0].frpTotal, 35.5);
const ri = N.resumenIncendios(det, focos);
assert.strictEqual(ri.diasConActividad, 4);
assert.strictEqual(ri.frpMax, 20);

// ---- USGS ------------------------------------------------------------------
const usgs = {
  features: [
    { id: "a", properties: { time: Date.UTC(2026, 0, 2, 3, 4), mag: 6.1, place: "10 km W of X, Chile", url: "u" }, geometry: { coordinates: [-71, -30, 35] } },
    { id: "b", properties: { time: Date.UTC(2026, 0, 3), mag: 4.0, place: "Y, Argentina" }, geometry: { coordinates: [-67, -24, 180] } },
    { id: "c", properties: { time: Date.UTC(2026, 0, 4), mag: null, place: "Z" }, geometry: { coordinates: [-70, -33, 10] } },
  ],
};
const sis = N.parsearUSGS(usgs);
assert.strictEqual(sis.length, 3);
assert.strictEqual(sis[0].fecha, "2026-01-02T03:04");
assert.strictEqual(sis[0].prof, 35);
const rs = N.resumenSismos(sis);
assert.strictEqual(rs.total, 3);
assert.strictEqual(rs.mayor.id, "a");
assert.strictEqual(rs.porMagnitud.find((r) => r.texto === "6 a 6,9").n, 1);
assert.strictEqual(rs.porMagnitud.find((r) => r.texto === "4 a 4,9").n, 1);
assert.strictEqual(rs.superficiales, 2);
assert.strictEqual(rs.profundidadMediana, 35);

// ---- Importar aluviones ----------------------------------------------------
const glc = "event_date,event_title,country_name,latitude,longitude,landslide_category,fatality_count,source_link\n" +
  "03/25/2015 12:00:00 PM,Prueba Chile,Chile,-26.35,-70.62,mudslide,3,http://ejemplo\n" +
  "03/25/2015 12:00:00 PM,Prueba Perú,Peru,-12,-77,mudslide,,\n";
const al = N.parsearAluviones(glc, "GLC");
assert.strictEqual(al.length, 1);
assert.strictEqual(al[0].fecha, "2015-03-25");
assert.strictEqual(al[0].fallecidos, 3);
assert.strictEqual(al[0].localidad, "Prueba Chile");
const alGeo = N.parsearAluviones(JSON.stringify({
  type: "FeatureCollection",
  features: [{ type: "Feature", properties: { fecha: "2017-12-16", localidad: "Prueba" }, geometry: { type: "Point", coordinates: [-72.4, -43.4] } }],
}));
assert.strictEqual(alGeo.length, 1);
assert.strictEqual(alGeo[0].lat, -43.4);
const ra = N.resumenAluviones([{ fallecidos: 2, verificado: true }, { fallecidos: null }, { fallecidos: 0 }]);
assert.deepStrictEqual(ra, { total: 3, verificados: 1, sinUbicacion: 3, fallecidosRegistrados: 2, eventosConCifra: 2 });
// Fecha solo con año, y registros sin coordenadas
const parciales = [{ fecha: "1972", lat: null, lon: null }, { fecha: "1972-02-11", lat: -26, lon: -70 }];
assert.strictEqual(N.filtrar(parciales, { desde: "1972-03-01", hasta: "1972-12-31" }).length, 1);
assert.strictEqual(N.filtrar(parciales, { desde: "1972-03-01", hasta: "1972-12-31", caja: N.CAJA_CHILE }).length, 0);
assert.strictEqual(N.contarCerca(parciales, -26, -70, 5), 1);

assert.strictEqual(N.aCSV([{ a: 'x,"y"', b: 1 }], ["a", "b"]), 'a,b\n"x,""y""",1');

// ---- Relieve y meteorología ------------------------------------------------
const elev = [800, ...Array(8).fill(900), ...Array(8).fill(1200), ...Array(8).fill(1600), ...Array(8).fill(3000)];
elev[1] = 1100; // un punto a 1 km, 300 m más alto
const rel = N.analizarRelieve(elev);
assert.strictEqual(rel.elevacion, 800);
assert.strictEqual(rel.relieve6, 800);
assert.strictEqual(rel.zMax10, 3000);
assert.ok(Math.abs(rel.pendiente1km - 16.7) < 0.1);

// 7 días previos secos + 48 h de ventana con 4 mm/h durante 12 h.
const horas = [];
for (let i = 0; i < 168 + 48; i++) {
  const enVentana = i >= 168;
  const lluvia = enVentana && i >= 180 && i < 192 ? 4 : 0;
  horas.push({ t: `h${String(i).padStart(3, "0")}`, lluvia, isoterma: 3200 });
}
const met = N.resumirMeteo(horas, [168, 216]);
assert.strictEqual(met.lluvia24, 48);
assert.strictEqual(met.lluviaHora, 4);
assert.strictEqual(met.lluviaPrevia7, 0);
assert.strictEqual(met.horasLluvia, 12);
assert.strictEqual(met.isotermaLluvia, 3200);

// Zona central (lat -33.5): 48 mm/24 h frente a 60 de referencia.
const fuerte = N.evaluarFactores({ lat: -33.5, meteo: met, relieve: rel, incendiosCercanos: 1, aluvionesCercanos: 2 });
assert.strictEqual(fuerte.zona.id, "centro");
assert.ok(fuerte.indice >= 60, `índice esperado alto, fue ${fuerte.indice}`);
assert.strictEqual(fuerte.nivel.id, "muyAlto");
assert.strictEqual(fuerte.factores.find((x) => x.id === "isoterma").estado, "si");

// Sin lluvia: aunque el terreno sea susceptible, el índice queda bajo.
const seco = N.evaluarFactores({
  lat: -33.5, relieve: rel, incendiosCercanos: 1, aluvionesCercanos: 2,
  meteo: N.resumirMeteo(horas.map((x) => ({ ...x, lluvia: 0 })), [168, 216]),
});
assert.strictEqual(seco.indice, 0);
assert.strictEqual(seco.nivel.id, "bajo");
assert.strictEqual(seco.factores.find((x) => x.id === "isoterma").puntaje, 0);

// Lluvia fuerte en terreno plano sin antecedentes: índice bajo.
const plano = N.evaluarFactores({
  lat: -33.5, meteo: met, relieve: N.analizarRelieve(Array(33).fill(500)), incendiosCercanos: 0, aluvionesCercanos: 0,
});
assert.strictEqual(plano.susceptibilidad, 0);
assert.strictEqual(plano.indice, 0);

// Sin datos de incendios: el factor queda "sin datos" y no pesa.
const sinInc = N.evaluarFactores({ lat: -33.5, meteo: met, relieve: rel, incendiosCercanos: null, aluvionesCercanos: 0 });
assert.strictEqual(sinInc.factores.find((x) => x.id === "incendio").estado, "sinDatos");
// Sin meteorología no hay índice.
assert.strictEqual(N.evaluarFactores({ lat: -33.5, relieve: rel }).indice, null);
assert.strictEqual(N.zonaClimatica(-23.6).id, "norte");
assert.strictEqual(N.zonaClimatica(-15).id, "norte");
assert.strictEqual(N.zonaClimatica(-53).id, "austral");

assert.strictEqual(Math.round(N.estimarIsoterma(13, 500)), 2500);
assert.strictEqual(N.contarCerca(items.slice(0, 4), -33, -70, 5, { desde: "2020-01-01", hasta: "2020-12-31" }), 2);

// ---- URLs ------------------------------------------------------------------
const uU = new URL(F.urlUSGS({ desde: "2026-01-01", hasta: "2026-01-31", magMin: 5 }));
assert.strictEqual(uU.searchParams.get("starttime"), "2026-01-01");
assert.strictEqual(uU.searchParams.get("endtime"), "2026-02-01");
assert.strictEqual(uU.searchParams.get("minmagnitude"), "5");
assert.strictEqual(uU.searchParams.get("format"), "geojson");
assert.strictEqual(
  F.urlFIRMS({ clave: "ABC", fuente: "VIIRS_SNPP_NRT", dias: 10, fecha: "2026-02-01", caja: { sur: -40, norte: -30, oeste: -75, este: -70 } }),
  "https://firms.modaps.eosdis.nasa.gov/api/area/csv/ABC/VIIRS_SNPP_NRT/-75,-40,-70,-30/10/2026-02-01"
);
const uP = new URL(F.urlPronostico(-33.45, -70.66));
assert.ok(uP.searchParams.get("hourly").includes("freezing_level_height"));
assert.strictEqual(uP.searchParams.get("timezone"), "America/Santiago");
const uE = new URL(F.urlElevacion([{ lat: -33, lon: -70 }, { lat: -33.1, lon: -70.1 }]));
assert.strictEqual(uE.searchParams.get("latitude"), "-33.0000,-33.1000");
assert.match(F.horaActualChile(new Date(Date.UTC(2026, 6, 1, 15, 30))), /^2026-07-01T\d{2}:00$/);

// Isoterma estimada cuando el modelo no la entrega.
const hOM = F.horasOpenMeteo({ elevation: 1000, hourly: { time: ["2026-01-01T00:00"], precipitation: [2], temperature_2m: [6.5] } });
assert.strictEqual(Math.round(hOM[0].isoterma), 2000);
assert.strictEqual(hOM[0].estimada, true);

// ---- Catálogo semilla ------------------------------------------------------
assert.ok(Array.isArray(semilla) && semilla.length > 0, "el catálogo semilla no puede estar vacío");
const ids = new Set();
for (const a of semilla) {
  assert.ok(a.id && !ids.has(a.id), `id duplicado o vacío: ${a.id}`);
  ids.add(a.id);
  assert.match(a.fecha, /^\d{4}(-\d{2}(-\d{2})?)?$/, `fecha mal formada en ${a.id}`);
  if (a.lat !== null || a.lon !== null) {
    assert.ok(N.dentroDeCaja(a.lat, a.lon, { sur: -56.5, norte: -17, oeste: -110, este: -66 }), `fuera de Chile: ${a.id}`);
  }
  assert.ok(a.fuente_url && /^https?:\/\//.test(a.fuente_url), `sin fuente: ${a.id}`);
  assert.ok(["alta", "media", "baja"].includes(a.confirmacion), `sin grado de confirmación: ${a.id}`);
  assert.strictEqual(typeof a.verificado, "boolean");
}

console.log("OK: todas las pruebas pasaron");
