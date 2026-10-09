// Clientes de las fuentes de datos públicas. Las funciones url* son puras
// (se prueban en Node); las funciones cargar* usan fetch en el navegador.
//
// - Sismos: USGS, servicio FDSN Event (earthquake.usgs.gov/fdsnws/event/1).
//   Tope documentado por terceros: 20.000 eventos por consulta.
// - Incendios: NASA FIRMS, API "area" (requiere MAP_KEY gratuita). La fecha
//   de la consulta es el primer día del tramo. La página oficial indica de 1 a
//   5 días por consulta (otra copia dice 1 a 10): se piden tramos de 5.
// - Clima: Open-Meteo, pronóstico (con freezing_level_height = isoterma 0 °C)
//   e histórico (reanálisis ERA5, desde 1940).
// - Elevación: Open-Meteo Elevation API (Copernicus DEM GLO-90, hasta 100
//   puntos por consulta).

(function (global) {
  const N = typeof module !== "undefined" && module.exports ? require("./nucleo.js") : global.Nucleo;

  const BASES = {
    usgs: "https://earthquake.usgs.gov/fdsnws/event/1/query",
    firms: "https://firms.modaps.eosdis.nasa.gov/api/area/csv",
    pronostico: "https://api.open-meteo.com/v1/forecast",
    historico: "https://archive-api.open-meteo.com/v1/archive",
    elevacion: "https://api.open-meteo.com/v1/elevation",
  };

  const FUENTES_FIRMS = [
    { id: "VIIRS_SNPP_NRT", texto: "VIIRS Suomi-NPP (375 m, casi tiempo real)" },
    { id: "VIIRS_NOAA20_NRT", texto: "VIIRS NOAA-20 (375 m, casi tiempo real)" },
    { id: "VIIRS_NOAA21_NRT", texto: "VIIRS NOAA-21 (375 m, casi tiempo real)" },
    { id: "MODIS_NRT", texto: "MODIS (1 km, casi tiempo real)" },
  ];

  const ZONA_HORARIA = "America/Santiago";

  function urlUSGS({ desde, hasta, magMin = 4, caja = N.CAJA_CHILE, limite = 20000 }) {
    const p = new URLSearchParams({
      format: "geojson",
      starttime: N.soloDia(desde),
      endtime: N.sumarDias(hasta, 1), // endtime es exclusivo a las 00:00 UTC
      minlatitude: caja.sur, maxlatitude: caja.norte,
      minlongitude: caja.oeste, maxlongitude: caja.este,
      minmagnitude: magMin,
      orderby: "time",
      limit: limite,
    });
    return `${BASES.usgs}?${p}`;
  }

  function urlFIRMS({ clave, fuente = "VIIRS_SNPP_NRT", caja = N.CAJA_CHILE, dias, fecha }) {
    const area = [caja.oeste, caja.sur, caja.este, caja.norte].join(",");
    return `${BASES.firms}/${encodeURIComponent(clave)}/${fuente}/${area}/${dias}/${N.soloDia(fecha)}`;
  }

  function urlPronostico(lat, lon) {
    const p = new URLSearchParams({
      latitude: lat.toFixed(4), longitude: lon.toFixed(4),
      hourly: "precipitation,freezing_level_height,temperature_2m",
      past_days: 7, forecast_days: 4, timezone: ZONA_HORARIA,
    });
    return `${BASES.pronostico}?${p}`;
  }

  function urlHistorico(lat, lon, desde, hasta) {
    const p = new URLSearchParams({
      latitude: lat.toFixed(4), longitude: lon.toFixed(4),
      start_date: N.soloDia(desde), end_date: N.soloDia(hasta),
      hourly: "precipitation,temperature_2m", timezone: ZONA_HORARIA,
    });
    return `${BASES.historico}?${p}`;
  }

  function urlElevacion(puntos) {
    const lat = puntos.map((p) => p.lat.toFixed(4)).join(",");
    const lon = puntos.map((p) => p.lon.toFixed(4)).join(",");
    return `${BASES.elevacion}?latitude=${lat}&longitude=${lon}`;
  }

  // Convierte la respuesta horaria de Open-Meteo en [{ t, lluvia, isoterma,
  // estimada }]. Si no hay isoterma del modelo, la estima desde la
  // temperatura a 2 m y la altura de la celda.
  function horasOpenMeteo(json) {
    const h = (json && json.hourly) || {};
    const t = h.time || [];
    const elev = json && Number.isFinite(json.elevation) ? json.elevation : null;
    return t.map((ti, i) => {
      const fl = h.freezing_level_height ? h.freezing_level_height[i] : null;
      const temp = h.temperature_2m ? h.temperature_2m[i] : null;
      const tieneFl = Number.isFinite(fl);
      return {
        t: ti,
        lluvia: Number.isFinite(h.precipitation && h.precipitation[i]) ? h.precipitation[i] : 0,
        isoterma: tieneFl ? fl : N.estimarIsoterma(temp, elev),
        estimada: !tieneFl,
      };
    });
  }

  // "AAAA-MM-DDTHH:00" de la hora actual en Chile continental.
  function horaActualChile(ahora = new Date()) {
    const partes = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: ZONA_HORARIA, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
      }).formatToParts(ahora).map((p) => [p.type, p.value])
    );
    return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:00`;
  }

  // ---- Llamadas de red (solo navegador) ------------------------------------

  async function pedir(url, tipo = "json", { msMax = 60000 } = {}) {
    let r;
    const corte = new AbortController();
    const reloj = setTimeout(() => corte.abort(), msMax);
    try {
      r = await fetch(url, { signal: corte.signal });
    } catch (e) {
      throw new Error(corte.signal.aborted
        ? `La fuente no respondió en ${Math.round(msMax / 1000)} s.`
        : "No se pudo conectar con la fuente (sin internet, o el servicio no permite consultas desde el navegador).");
    } finally {
      clearTimeout(reloj);
    }
    const cuerpo = await r.text();
    if (!r.ok) throw new Error(`La fuente respondió ${r.status}: ${cuerpo.slice(0, 200)}`);
    if (tipo === "texto") return cuerpo;
    try {
      return JSON.parse(cuerpo);
    } catch (e) {
      throw new Error(`Respuesta no válida de la fuente: ${cuerpo.slice(0, 200)}`);
    }
  }

  async function cargarSismos(opciones) {
    const json = await pedir(urlUSGS(opciones));
    return N.parsearUSGS(json);
  }

  const DIAS_POR_TRAMO_FIRMS = 5;

  // Pide los tramos en serie (para respetar los límites de FIRMS) e informa
  // el avance.
  async function cargarIncendios({ clave, fuente, caja, desde, hasta }, alAvanzar) {
    const tramos = N.tramosFechas(desde, hasta, DIAS_POR_TRAMO_FIRMS);
    const todas = [];
    for (let i = 0; i < tramos.length; i++) {
      if (alAvanzar) alAvanzar(i, tramos.length);
      const texto = await pedir(urlFIRMS({ clave, fuente, caja, dias: tramos[i].dias, fecha: tramos[i].fecha }), "texto");
      if (/invalid|error/i.test(texto.slice(0, 120)) && !/latitude/i.test(texto.slice(0, 200))) {
        throw new Error(`FIRMS respondió: ${texto.slice(0, 200)}`);
      }
      todas.push(...N.parsearFIRMS(texto, fuente));
    }
    return todas;
  }

  async function cargarRelieve(lat, lon) {
    const puntos = N.puntosRelieve(lat, lon);
    const json = await pedir(urlElevacion(puntos));
    return N.analizarRelieve(json.elevation || []);
  }

  // Pronóstico: ventana = desde la hora actual hasta +72 h; lo anterior es
  // lluvia previa.
  async function cargarMeteoPronostico(lat, lon) {
    const json = await pedir(urlPronostico(lat, lon));
    const horas = horasOpenMeteo(json);
    const ahora = horaActualChile();
    let i0 = horas.findIndex((h) => h.t >= ahora);
    if (i0 < 0) i0 = horas.length;
    const ventana = [i0, Math.min(horas.length, i0 + 72)];
    return { horas, ventana, resumen: N.resumirMeteo(horas, ventana), estimada: horas.slice(...ventana).some((h) => h.estimada) };
  }

  // Fecha pasada: ventana = día anterior, el día y el siguiente; lluvia
  // previa = 7 días antes de esa ventana. Isoterma estimada (ERA5 en
  // Open-Meteo no la entrega).
  async function cargarMeteoHistorico(lat, lon, fecha) {
    const inicioVentana = N.sumarDias(fecha, -1);
    const json = await pedir(urlHistorico(lat, lon, N.sumarDias(inicioVentana, -7), N.sumarDias(fecha, 1)));
    const horas = horasOpenMeteo(json);
    let i0 = horas.findIndex((h) => h.t >= `${inicioVentana}T00:00`);
    if (i0 < 0) i0 = 0;
    const ventana = [i0, Math.min(horas.length, i0 + 72)];
    return { horas, ventana, resumen: N.resumirMeteo(horas, ventana), estimada: true };
  }

  // ---- Prueba de conexiones (consultas mínimas a cada fuente) ---------------

  // Lista de pruebas. Cada una pide lo mínimo posible y valida la forma de la
  // respuesta, no solo que llegue algo.
  function pruebasConexion({ clave, fuente = "VIIRS_SNPP_NRT", hoy }) {
    const santiago = { lat: -33.45, lon: -70.66 };
    const caja = { sur: -34, norte: -33, oeste: -71.5, este: -70 };
    return [
      {
        id: "usgs", nombre: "Sismos (USGS)",
        url: urlUSGS({ desde: N.sumarDias(hoy, -7), hasta: hoy, magMin: 4, limite: 1 }),
        validar: (t) => Array.isArray(JSON.parse(t).features),
      },
      {
        id: "pronostico", nombre: "Pronóstico e isoterma (Open-Meteo)",
        url: urlPronostico(santiago.lat, santiago.lon),
        validar: (t) => {
          const h = JSON.parse(t).hourly || {};
          return Array.isArray(h.precipitation) && Array.isArray(h.freezing_level_height);
        },
      },
      {
        id: "historico", nombre: "Clima pasado ERA5 (Open-Meteo)",
        url: urlHistorico(santiago.lat, santiago.lon, "2024-01-01", "2024-01-01"),
        validar: (t) => Array.isArray((JSON.parse(t).hourly || {}).precipitation),
      },
      {
        id: "elevacion", nombre: "Elevación (Open-Meteo)",
        url: urlElevacion([santiago]),
        validar: (t) => Array.isArray(JSON.parse(t).elevation),
      },
      {
        id: "firms", nombre: "Incendios (NASA FIRMS)",
        url: clave ? urlFIRMS({ clave, fuente, caja, dias: 1, fecha: hoy }) : null,
        omitir: clave ? null : "Falta la MAP_KEY (pestaña Incendios).",
        validar: (t) => /latitude/i.test(t.slice(0, 200)) || t.trim() === "",
      },
    ];
  }

  async function probarConexion(prueba) {
    if (prueba.omitir) return { ...prueba, estado: "omitida", detalle: prueba.omitir };
    const t0 = Date.now();
    try {
      const texto = await pedir(prueba.url, "texto", { msMax: 15000 });
      let valida = false;
      try { valida = prueba.validar(texto); } catch (e) { valida = false; }
      return {
        ...prueba, ms: Date.now() - t0,
        estado: valida ? "ok" : "rara",
        detalle: valida ? "Responde con el formato esperado." : `Respondió, pero con un formato inesperado: ${texto.slice(0, 160)}`,
      };
    } catch (e) {
      return { ...prueba, ms: Date.now() - t0, estado: "error", detalle: e.message };
    }
  }

  const api = {
    BASES, FUENTES_FIRMS, ZONA_HORARIA, DIAS_POR_TRAMO_FIRMS,
    urlUSGS, urlFIRMS, urlPronostico, urlHistorico, urlElevacion, horasOpenMeteo, horaActualChile,
    pruebasConexion, probarConexion,
    pedir, cargarSismos, cargarIncendios, cargarRelieve, cargarMeteoPronostico, cargarMeteoHistorico,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.Fuentes = api;
})(typeof window !== "undefined" ? window : globalThis);
