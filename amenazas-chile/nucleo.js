// Núcleo de cálculo del Mapa de Amenazas de Chile: lectura de archivos,
// filtros por fecha y área, "cubicación" (conteos y resúmenes) e índice de
// factores de aluvión.
//
// IMPORTANTE: el índice de factores es HEURÍSTICO. Combina variables que la
// literatura asocia a aluviones (lluvia intensa, isoterma 0 °C alta, relieve,
// incendios recientes, historial), pero sus umbrales y pesos no son un modelo
// validado ni reemplazan los avisos de la DMC, SENAPRED o SERNAGEOMIN. Están
// agrupados en CONFIG_FACTORES para ajustarlos.
//
// Funciona en el navegador (window.Nucleo) y en Node (module.exports) para
// poder probarlo con `node tests/nucleo.test.js`.

(function (global) {
  // Caja aproximada de Chile continental más la zona de subducción frente a la
  // costa. Incluye partes de Perú, Bolivia y Argentina: por eso el filtro
  // "solo Chile" de sismos usa además la descripción del lugar.
  const CAJA_CHILE = { sur: -56.5, norte: -17, oeste: -78, este: -66 };

  // ---- Configuración del índice de factores (heurística, editable) --------

  const CONFIG_FACTORES = {
    // Lluvia (en 24 h o en 1 h) que da el puntaje máximo del factor "lluvia
    // intensa", por zona. Referencias encontradas (citas sin abrir, ver
    // README, "Respaldo bibliográfico"):
    //  - Zona Central: > 60 mm/día ≈ 50 % de probabilidad de flujos en la
    //    precordillera de Santiago (Hauser 1985, citado por Sepúlveda &
    //    Padilla 2008); 12 mm/h bastaron en la Quebrada de Macul en 1993
    //    (Naranjo & Varela 1996, citado por Sepúlveda et al. 2006).
    //  - Norte: sin umbral publicado. Antofagasta 1991: 42 mm en 3–4 h y
    //    24 mm/h; Atacama 2015: 77 mm en 51 h y 7,5 mm/h máx. Los valores de
    //    abajo son heurísticos, más bajos que en el centro por la aridez.
    //  - Sur y Austral: sin umbral publicado; valores heurísticos.
    zonas: [
      { id: "norte", nombre: "Norte Grande", latMax: -17, latMin: -26, lluvia24: 15, lluviaHora: 5 },
      { id: "norteChico", nombre: "Norte Chico", latMax: -26, latMin: -32, lluvia24: 25, lluviaHora: 7 },
      { id: "centro", nombre: "Zona Central", latMax: -32, latMin: -38, lluvia24: 60, lluviaHora: 10 },
      { id: "sur", nombre: "Zona Sur", latMax: -38, latMin: -44, lluvia24: 80, lluviaHora: 12 },
      { id: "austral", nombre: "Zona Austral", latMax: -44, latMin: -90, lluvia24: 80, lluviaHora: 12 },
    ],
    lluviaMinimaHora: 0.5,      // mm/h para considerar que una hora "llueve"
    relieveMin: 150,            // m de desnivel en 6 km bajo el cual el relieve no aporta
    relievePleno: 1000,         // m de desnivel en 6 km = puntaje máximo de relieve
    radioIncendioKm: 5,         // detección de fuego a esta distancia cuenta como "zona quemada"
    aniosIncendio: 3,           // ... si ocurrió dentro de estos años antes de la fecha evaluada
    radioHistorialKm: 15,       // aluvión registrado a esta distancia = antecedente
    // La evidencia chilena pone la lluvia del mismo día y la isoterma por
    // sobre la lluvia de días previos (Sepúlveda & Padilla 2008; Vergara Dal
    // Pont et al. 2018); por eso la lluvia previa pesa poco.
    pesos: {
      // Detonante meteorológico
      lluvia: 55, isoterma: 35, lluviaPrevia: 10,
      // Susceptibilidad del terreno
      relieve: 50, incendio: 25, historial: 25,
    },
    // Cortes del índice combinado (0–100) para el semáforo.
    niveles: [
      { min: 60, id: "muyAlto", texto: "Muy alto", icono: "🔴" },
      { min: 40, id: "alto", texto: "Alto", icono: "🟠" },
      { min: 20, id: "moderado", texto: "Moderado", icono: "🟡" },
      { min: 0, id: "bajo", texto: "Bajo", icono: "🟢" },
    ],
  };

  // Gradiente térmico de la atmósfera estándar (OACI): 6,5 °C por km.
  const GRADIENTE_ESTANDAR = 0.0065;

  // ---- Utilidades ----------------------------------------------------------

  const limitar = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const redondear = (x, d = 1) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

  function distanciaKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // Punto a `km` de distancia en el rumbo `grados` (0 = norte, 90 = este).
  function desplazar(lat, lon, km, grados) {
    const R = 6371;
    const rad = Math.PI / 180;
    const d = km / R;
    const b = grados * rad;
    const la1 = lat * rad;
    const lo1 = lon * rad;
    const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(b));
    const lo2 = lo1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
    return { lat: la2 / rad, lon: lo2 / rad };
  }

  // Centro + 8 rumbos en cada radio. El orden importa: analizarRelieve lo usa.
  const RADIOS_RELIEVE = [1, 3, 6, 10];
  function puntosRelieve(lat, lon, radios = RADIOS_RELIEVE) {
    const puntos = [{ lat, lon, radio: 0 }];
    for (const r of radios) {
      for (let i = 0; i < 8; i++) puntos.push({ ...desplazar(lat, lon, r, i * 45), radio: r });
    }
    return puntos;
  }

  // ---- Fechas --------------------------------------------------------------

  const pad = (n) => String(n).padStart(2, "0");

  // Devuelve "AAAA-MM-DD" o "AAAA-MM-DDTHH:MM" (sin zona) a partir de formatos
  // habituales: ISO, AAAA-MM-DD, DD-MM-AAAA, DD/MM/AAAA, MM/DD/AAAA con hora
  // (exportes de la NASA), o milisegundos desde 1970. "" si no se reconoce.
  function normalizarFecha(valor) {
    if (valor === null || valor === undefined || valor === "") return "";
    if (typeof valor === "number" && Number.isFinite(valor)) {
      return new Date(valor).toISOString().slice(0, 16);
    }
    const s = String(valor).trim();
    if (/^\d{4}$/.test(s)) return s; // solo año (catálogos históricos)
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2}))?/);
    if (m) return componer(m[1], m[2], m[3], m[4], m[5]);
    m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:[T ](\d{1,2}):(\d{2}))?/);
    if (m) return componer(m[1], m[2], m[3], m[4], m[5]);
    // MM/DD/AAAA HH:MM:SS AM/PM (formato de exportación de data.nasa.gov)
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)$/i);
    if (m) {
      let h = Number(m[4]) % 12;
      if (m[6].toUpperCase() === "PM") h += 12;
      return componer(m[3], m[1], m[2], h, m[5]);
    }
    // DD-MM-AAAA o DD/MM/AAAA (uso chileno)
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[T ](\d{1,2}):(\d{2}))?/);
    if (m) return componer(m[3], m[2], m[1], m[4], m[5]);
    return "";
  }

  function componer(a, me, d, h, mi) {
    const anio = Number(a), mes = Number(me), dia = Number(d);
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return "";
    const fecha = `${anio}-${pad(mes)}-${pad(dia)}`;
    if (h === undefined || h === null || h === "") return fecha;
    return `${fecha}T${pad(Number(h))}:${pad(Number(mi))}`;
  }

  const soloDia = (f) => (f || "").slice(0, 10);

  function sumarDias(fecha, n) {
    const d = new Date(soloDia(fecha) + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function diasEntre(desde, hasta) {
    const a = Date.parse(soloDia(desde) + "T12:00:00Z");
    const b = Date.parse(soloDia(hasta) + "T12:00:00Z");
    return Math.round((b - a) / 86400000);
  }

  // Divide [desde, hasta] en tramos de hasta `maxDias` (FIRMS acepta 1–10).
  function tramosFechas(desde, hasta, maxDias = 10) {
    const tramos = [];
    let inicio = soloDia(desde);
    const fin = soloDia(hasta);
    while (inicio <= fin) {
      const dias = Math.min(maxDias, diasEntre(inicio, fin) + 1);
      tramos.push({ fecha: inicio, dias });
      inicio = sumarDias(inicio, dias);
    }
    return tramos;
  }

  // ---- Filtros -------------------------------------------------------------

  // Fecha comparada por día; `caja` opcional { sur, norte, oeste, este }.
  // Un registro con fecha parcial ("AAAA-MM" o "AAAA") entra si su mes o año
  // toca el rango. Con `caja`, los registros sin coordenadas quedan fuera.
  function filtrar(items, { desde, hasta, caja } = {}) {
    return items.filter((it) => {
      const f = soloDia(it.fecha);
      if (!f) return false;
      if (desde && f < soloDia(desde).slice(0, f.length)) return false;
      if (hasta && f > soloDia(hasta).slice(0, f.length)) return false;
      if (caja && !dentroDeCaja(it.lat, it.lon, caja)) return false;
      return true;
    });
  }

  const tieneUbicacion = (it) => Number.isFinite(it.lat) && Number.isFinite(it.lon);
  const dentroDeCaja = (lat, lon, c) =>
    Number.isFinite(lat) && Number.isFinite(lon) && lat >= c.sur && lat <= c.norte && lon >= c.oeste && lon <= c.este;

  // ---- Histograma por período ---------------------------------------------

  // Elige día, mes o año según el largo del rango y cuenta registros por
  // período (incluye períodos vacíos para no esconder los ceros).
  function histograma(items, desde, hasta) {
    const fechas = items.map((it) => soloDia(it.fecha)).filter(Boolean).sort();
    if (!fechas.length && !(desde && hasta)) return { paso: "dia", barras: [] };
    const ini = soloDia(desde) || fechas[0];
    const fin = soloDia(hasta) || fechas[fechas.length - 1];
    const dias = diasEntre(ini, fin);
    const paso = dias <= 62 ? "dia" : dias <= 366 * 5 ? "mes" : "anio";
    const clave = (f) => (paso === "dia" ? f.slice(0, 10) : paso === "mes" ? f.slice(0, 7) : f.slice(0, 4));
    const conteo = new Map();
    let k = clave(ini);
    const kFin = clave(fin);
    let guardia = 0;
    while (k <= kFin && guardia++ < 5000) {
      conteo.set(k, 0);
      k = siguientePeriodo(k, paso);
    }
    for (const f of fechas) {
      const c = clave(f);
      if (conteo.has(c)) conteo.set(c, conteo.get(c) + 1);
    }
    return { paso, barras: [...conteo].map(([periodo, n]) => ({ periodo, n })) };
  }

  function siguientePeriodo(k, paso) {
    if (paso === "dia") return sumarDias(k, 1);
    if (paso === "anio") return String(Number(k) + 1);
    let [a, m] = k.split("-").map(Number);
    m += 1;
    if (m > 12) { m = 1; a += 1; }
    return `${a}-${pad(m)}`;
  }

  // ---- CSV -----------------------------------------------------------------

  // Lector CSV con comillas. Detecta separador "," o ";" (Excel en Chile
  // suele exportar con punto y coma).
  function parsearCSV(texto) {
    const limpio = String(texto).replace(/^﻿/, "");
    const primera = limpio.split(/\r?\n/, 1)[0] || "";
    const sep = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ";" : ",";
    const filas = [];
    let fila = [], campo = "", comillas = false;
    for (let i = 0; i < limpio.length; i++) {
      const c = limpio[i];
      if (comillas) {
        if (c === '"' && limpio[i + 1] === '"') { campo += '"'; i++; }
        else if (c === '"') comillas = false;
        else campo += c;
      } else if (c === '"') comillas = true;
      else if (c === sep) { fila.push(campo); campo = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && limpio[i + 1] === "\n") i++;
        fila.push(campo); campo = "";
        if (fila.some((v) => v !== "")) filas.push(fila);
        fila = [];
      } else campo += c;
    }
    fila.push(campo);
    if (fila.some((v) => v !== "")) filas.push(fila);
    if (!filas.length) return [];
    const enc = filas[0].map((h) => h.trim());
    return filas.slice(1).map((f) => Object.fromEntries(enc.map((h, i) => [h, (f[i] ?? "").trim()])));
  }

  const sinTildes = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  // Busca en `fila` la primera columna cuyo nombre (sin tildes ni mayúsculas)
  // coincide con alguno de los alias.
  function columna(fila, alias) {
    const claves = Object.keys(fila);
    for (const a of alias) {
      const k = claves.find((c) => sinTildes(c).trim() === a);
      if (k !== undefined && fila[k] !== "") return fila[k];
    }
    return "";
  }

  const ALIAS = {
    lat: ["latitude", "latitud", "lat"],
    lon: ["longitude", "longitud", "lon", "lng", "long"],
    fecha: ["fecha", "event_date", "date", "time", "fecha_hora", "fecha local", "fecha utc", "acq_date", "origin time", "fecha_evento", "fecha evento", "ano", "anio", "year"],
    hora: ["acq_time", "hora"],
    mag: ["magnitud", "magnitude", "mag", "ml", "mw"],
    prof: ["profundidad", "depth", "prof", "profundidad [km]", "profundidad (km)"],
    lugar: ["lugar", "place", "localidad", "referencia", "location_description", "event_title", "nombre", "sector", "comuna"],
    pais: ["country_name", "pais", "country"],
    categoria: ["landslide_category", "categoria", "tipo", "tipo_rm", "tipo_evento", "tipo de remocion"],
    fallecidos: ["fallecidos", "fatality_count", "muertos"],
    fuente: ["fuente", "fuente_url", "source_link", "source_name", "url"],
    frp: ["frp"],
    confianza: ["confidence", "confianza"],
    satelite: ["satellite", "satelite", "instrument"],
  };

  const num = (v) => {
    if (v === "" || v === null || v === undefined) return NaN;
    return Number(String(v).replace(",", "."));
  };

  // ---- Lectores por fuente -------------------------------------------------

  // GeoJSON de USGS (FDSN event, format=geojson).
  function parsearUSGS(geojson) {
    const feats = (geojson && geojson.features) || [];
    return feats
      .map((f) => {
        const p = f.properties || {};
        const [lon, lat, prof] = (f.geometry && f.geometry.coordinates) || [];
        return {
          id: f.id || `usgs-${p.time}`,
          fecha: Number.isFinite(p.time) ? new Date(p.time).toISOString().slice(0, 16) : "",
          lat, lon,
          mag: Number.isFinite(p.mag) ? p.mag : null,
          prof: Number.isFinite(prof) ? prof : null,
          lugar: p.place || "",
          url: p.url || "",
          origen: "USGS",
        };
      })
      .filter((e) => e.fecha && Number.isFinite(e.lat) && Number.isFinite(e.lon));
  }

  // CSV de sismos de cualquier catálogo con columnas reconocibles (CSN, USGS…).
  function parsearSismosCSV(texto, origen = "Archivo") {
    return parsearCSV(texto)
      .map((f, i) => ({
        id: `${origen}-${i}`,
        fecha: normalizarFecha(columna(f, ALIAS.fecha)),
        lat: num(columna(f, ALIAS.lat)),
        lon: num(columna(f, ALIAS.lon)),
        mag: num(columna(f, ALIAS.mag)),
        prof: num(columna(f, ALIAS.prof)),
        lugar: columna(f, ALIAS.lugar),
        url: "",
        origen,
      }))
      .map((e) => ({ ...e, mag: Number.isFinite(e.mag) ? e.mag : null, prof: Number.isFinite(e.prof) ? e.prof : null }))
      .filter((e) => e.fecha && Number.isFinite(e.lat) && Number.isFinite(e.lon));
  }

  // CSV de NASA FIRMS (API o descarga de archivo). acq_time viene como HHMM UTC.
  function parsearFIRMS(texto, origen = "FIRMS") {
    return parsearCSV(texto)
      .map((f, i) => {
        const dia = normalizarFecha(columna(f, ["acq_date"]) || columna(f, ALIAS.fecha));
        const hhmm = String(columna(f, ALIAS.hora)).padStart(4, "0");
        const conHora = dia && /^\d{4}$/.test(hhmm) && dia.length === 10 ? `${dia}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}` : dia;
        return {
          id: `${origen}-${i}`,
          fecha: conHora,
          lat: num(columna(f, ALIAS.lat)),
          lon: num(columna(f, ALIAS.lon)),
          frp: num(columna(f, ALIAS.frp)),
          confianza: columna(f, ALIAS.confianza),
          satelite: [columna(f, ["satellite"]), columna(f, ["instrument"])].filter(Boolean).join(" "),
          origen,
        };
      })
      .map((d) => ({ ...d, frp: Number.isFinite(d.frp) ? d.frp : null }))
      .filter((d) => d.fecha && Number.isFinite(d.lat) && Number.isFinite(d.lon));
  }

  // Aluviones desde CSV o GeoJSON (p. ej. exportación del Global Landslide
  // Catalog de la NASA). Si hay columna de país, se queda solo con Chile.
  function parsearAluviones(texto, origen = "Archivo") {
    let filas;
    const t = String(texto).trim();
    if (t.startsWith("{")) {
      const gj = JSON.parse(t);
      filas = (gj.features || []).map((f) => {
        const [lon, lat] = (f.geometry && f.geometry.coordinates) || [];
        return { ...(f.properties || {}), longitude: lon, latitude: lat };
      });
    } else {
      filas = parsearCSV(t);
    }
    return filas
      .filter((f) => {
        const pais = columna(f, ALIAS.pais);
        return !pais || sinTildes(pais) === "chile";
      })
      .map((f, i) => {
        const fallecidos = num(columna(f, ALIAS.fallecidos));
        return {
          id: `${origen}-${i}`,
          fecha: soloDia(normalizarFecha(columna(f, ALIAS.fecha))),
          lat: num(columna(f, ALIAS.lat)),
          lon: num(columna(f, ALIAS.lon)),
          localidad: columna(f, ALIAS.lugar),
          descripcion: columna(f, ["descripcion", "event_description", "description", "notes"]),
          categoria: columna(f, ALIAS.categoria),
          fallecidos: Number.isFinite(fallecidos) ? fallecidos : null,
          fuente_url: columna(f, ALIAS.fuente),
          origen,
          verificado: false,
        };
      })
      .filter((a) => a.fecha && Number.isFinite(a.lat) && Number.isFinite(a.lon));
  }

  function aCSV(filas, columnas) {
    const esc = (v) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [columnas.join(","), ...filas.map((f) => columnas.map((c) => esc(f[c])).join(","))].join("\n");
  }

  // ---- Cubicación: sismos --------------------------------------------------

  const RANGOS_MAG = [
    { min: -Infinity, max: 3, texto: "Menor a 3" },
    { min: 3, max: 4, texto: "3 a 3,9" },
    { min: 4, max: 5, texto: "4 a 4,9" },
    { min: 5, max: 6, texto: "5 a 5,9" },
    { min: 6, max: 7, texto: "6 a 6,9" },
    { min: 7, max: Infinity, texto: "7 o más" },
  ];

  function mediana(v) {
    const s = v.filter(Number.isFinite).sort((a, b) => a - b);
    if (!s.length) return null;
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function resumenSismos(eventos) {
    const conMag = eventos.filter((e) => Number.isFinite(e.mag));
    const mayor = conMag.reduce((a, e) => (!a || e.mag > a.mag ? e : a), null);
    return {
      total: eventos.length,
      mayor,
      porMagnitud: RANGOS_MAG.map((r) => ({
        texto: r.texto,
        n: conMag.filter((e) => e.mag >= r.min && e.mag < r.max).length,
      })),
      profundidadMediana: mediana(eventos.map((e) => e.prof)),
      superficiales: eventos.filter((e) => Number.isFinite(e.prof) && e.prof < 70).length,
    };
  }

  // ---- Cubicación: incendios -----------------------------------------------

  // Agrupa detecciones en "focos": dos detecciones quedan en el mismo foco si
  // están a menos de `km` y a no más de `dias` de diferencia (encadenado).
  // Usa una grilla para no comparar todas contra todas.
  function agruparFocos(detecciones, km = 2, dias = 2) {
    const n = detecciones.length;
    const padre = Array.from({ length: n }, (_, i) => i);
    const raiz = (i) => { while (padre[i] !== i) { padre[i] = padre[padre[i]]; i = padre[i]; } return i; };
    const unir = (a, b) => { const ra = raiz(a), rb = raiz(b); if (ra !== rb) padre[rb] = ra; };
    const celda = km / 111; // grados aprox. por celda (latitud)
    const grilla = new Map();
    const t = detecciones.map((d) => Date.parse(soloDia(d.fecha) + "T00:00:00Z") / 86400000);
    detecciones.forEach((d, i) => {
      const cx = Math.floor(d.lon / (celda / Math.max(0.2, Math.cos((d.lat * Math.PI) / 180))));
      const cy = Math.floor(d.lat / celda);
      d._c = [cx, cy];
      const k = `${cx},${cy}`;
      if (!grilla.has(k)) grilla.set(k, []);
      grilla.get(k).push(i);
    });
    detecciones.forEach((d, i) => {
      const [cx, cy] = d._c;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const vecinos = grilla.get(`${cx + dx},${cy + dy}`);
          if (!vecinos) continue;
          for (const j of vecinos) {
            if (j <= i) continue;
            if (Math.abs(t[i] - t[j]) > dias) continue;
            if (distanciaKm(d.lat, d.lon, detecciones[j].lat, detecciones[j].lon) <= km) unir(i, j);
          }
        }
      }
    });
    const grupos = new Map();
    detecciones.forEach((d, i) => {
      delete d._c;
      const r = raiz(i);
      if (!grupos.has(r)) grupos.set(r, []);
      grupos.get(r).push(d);
    });
    return [...grupos.values()]
      .map((g, idx) => {
        const fechas = g.map((d) => soloDia(d.fecha)).sort();
        const frps = g.map((d) => d.frp).filter(Number.isFinite);
        return {
          id: `foco-${idx}`,
          detecciones: g.length,
          inicio: fechas[0],
          fin: fechas[fechas.length - 1],
          dias: diasEntre(fechas[0], fechas[fechas.length - 1]) + 1,
          lat: g.reduce((s, d) => s + d.lat, 0) / g.length,
          lon: g.reduce((s, d) => s + d.lon, 0) / g.length,
          frpTotal: frps.length ? frps.reduce((s, x) => s + x, 0) : null,
          frpMax: frps.length ? Math.max(...frps) : null,
        };
      })
      .sort((a, b) => b.detecciones - a.detecciones);
  }

  function resumenIncendios(detecciones, focos) {
    const frps = detecciones.map((d) => d.frp).filter(Number.isFinite);
    return {
      detecciones: detecciones.length,
      focos: focos.length,
      diasConActividad: new Set(detecciones.map((d) => soloDia(d.fecha))).size,
      frpTotal: frps.length ? frps.reduce((s, x) => s + x, 0) : null,
      frpMax: frps.length ? Math.max(...frps) : null,
    };
  }

  // ---- Cubicación: aluviones -----------------------------------------------

  function resumenAluviones(eventos) {
    const conCifra = eventos.filter((e) => Number.isFinite(e.fallecidos));
    return {
      total: eventos.length,
      verificados: eventos.filter((e) => e.verificado).length,
      sinUbicacion: eventos.filter((e) => !tieneUbicacion(e)).length,
      fallecidosRegistrados: conCifra.reduce((s, e) => s + e.fallecidos, 0),
      eventosConCifra: conCifra.length,
    };
  }

  // ---- Factores de aluvión -------------------------------------------------

  function zonaClimatica(lat, cfg = CONFIG_FACTORES) {
    if (lat > cfg.zonas[0].latMax) return cfg.zonas[0];
    return cfg.zonas.find((z) => lat <= z.latMax && lat > z.latMin) || cfg.zonas[cfg.zonas.length - 1];
  }

  // Isoterma 0 °C estimada desde la temperatura a 2 m y la altura del punto,
  // con el gradiente estándar. Aproximación gruesa: falla con inversión
  // térmica (frecuente en la costa del norte).
  const estimarIsoterma = (t2m, elevacion) =>
    Number.isFinite(t2m) && Number.isFinite(elevacion) ? elevacion + t2m / GRADIENTE_ESTANDAR : null;

  // Relieve a partir de las elevaciones en el orden de puntosRelieve().
  function analizarRelieve(elevaciones, radios = RADIOS_RELIEVE) {
    const z = elevaciones.map((v) => (Number.isFinite(v) ? Math.max(0, v) : NaN));
    const centro = z[0];
    const anillo = (r) => { const k = radios.indexOf(r); return z.slice(1 + k * 8, 1 + (k + 1) * 8); };
    const hasta6 = [centro, ...anillo(1), ...anillo(3), ...anillo(6)].filter(Number.isFinite);
    const todos = z.filter(Number.isFinite);
    const pendientes = anillo(1).filter(Number.isFinite).map((v) => (Math.atan(Math.abs(v - centro) / 1000) * 180) / Math.PI);
    return {
      elevacion: Number.isFinite(centro) ? centro : null,
      relieve6: hasta6.length ? Math.max(...hasta6) - Math.min(...hasta6) : null,
      zMax10: todos.length ? Math.max(...todos) : null,
      pendiente1km: pendientes.length ? Math.max(...pendientes) : null,
    };
  }

  // Resume la serie horaria. `horas` = [{ t, lluvia, isoterma }] ordenadas.
  // `ventana` = [inicio, fin) en índices; lo anterior a `ventana[0]` (hasta 7
  // días) es lluvia previa.
  function resumirMeteo(horas, ventana, cfg = CONFIG_FACTORES) {
    const [i0, i1] = ventana;
    const v = horas.slice(i0, i1);
    let max24 = 0, iMax = -1, suma = 0;
    for (let i = 0; i < v.length; i++) {
      suma += v[i].lluvia || 0;
      if (i >= 24) suma -= v[i - 24].lluvia || 0;
      if (suma > max24) { max24 = suma; iMax = i; }
    }
    const maxHora = v.reduce((m, h) => Math.max(m, h.lluvia || 0), 0);
    const total = v.reduce((s, h) => s + (h.lluvia || 0), 0);
    const previa = horas.slice(Math.max(0, i0 - 168), i0).reduce((s, h) => s + (h.lluvia || 0), 0);
    // Isoterma durante la lluvia: promedio ponderado por milímetros.
    const lluviosas = v.filter((h) => (h.lluvia || 0) >= cfg.lluviaMinimaHora && Number.isFinite(h.isoterma));
    const mm = lluviosas.reduce((s, h) => s + h.lluvia, 0);
    const isotermaLluvia = mm > 0 ? lluviosas.reduce((s, h) => s + h.isoterma * h.lluvia, 0) / mm : null;
    return {
      lluvia24: max24,
      finMax24: iMax >= 0 ? v[iMax].t : null,
      lluviaHora: maxHora,
      lluviaTotal: total,
      lluviaPrevia7: previa,
      horasLluvia: v.filter((h) => (h.lluvia || 0) >= cfg.lluviaMinimaHora).length,
      isotermaLluvia,
      isotermaMax: lluviosas.length ? Math.max(...lluviosas.map((h) => h.isoterma)) : null,
    };
  }

  // Combina los factores. Devuelve el índice 0–100, el nivel y cada factor con
  // su explicación. Dos grupos:
  //   D = detonante meteorológico (lluvia, isoterma, lluvia previa)
  //   S = susceptibilidad del terreno (relieve, incendio, historial)
  // Índice = 100·√(D·S): solo es alto si ambos grupos se reúnen.
  function evaluarFactores(entrada, cfg = CONFIG_FACTORES) {
    const { lat, meteo, relieve, incendiosCercanos, aluvionesCercanos } = entrada;
    const zona = zonaClimatica(lat, cfg);
    const P = cfg.pesos;
    const f = [];
    const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toLocaleString("es-CL", { maximumFractionDigits: d }) : "—");

    // Detonante -------------------------------------------------------------
    if (meteo) {
      const sLluvia = limitar(Math.max(meteo.lluvia24 / zona.lluvia24, meteo.lluviaHora / zona.lluviaHora));
      f.push({
        id: "lluvia", grupo: "D", nombre: "Lluvia intensa", peso: P.lluvia, puntaje: sLluvia,
        texto: `Máximo en 24 h: ${fmt(meteo.lluvia24, 1)} mm (máx. horario ${fmt(meteo.lluviaHora, 1)} mm). ` +
          `Referencia ${zona.nombre}: ${zona.lluvia24} mm/24 h o ${zona.lluviaHora} mm/h.`,
      });

      let sIso = 0, tIso;
      if (meteo.horasLluvia === 0 || !Number.isFinite(meteo.isotermaLluvia)) {
        tIso = meteo.horasLluvia === 0 ? "Sin horas de lluvia en la ventana: la isoterma no aporta." : "Sin dato de isoterma durante la lluvia.";
      } else if (relieve && Number.isFinite(relieve.elevacion) && Number.isFinite(relieve.zMax10)) {
        const desnivel = relieve.zMax10 - relieve.elevacion;
        sIso = desnivel > 100
          ? limitar((meteo.isotermaLluvia - relieve.elevacion) / desnivel)
          : (meteo.isotermaLluvia > relieve.elevacion ? 1 : 0);
        tIso = `Isoterma 0 °C durante la lluvia: ~${fmt(meteo.isotermaLluvia)} m. El cerro más alto en 10 km llega a ${fmt(relieve.zMax10)} m: ` +
          `${Math.round(sIso * 100)} % del desnivel recibe lluvia en vez de nieve.`;
      } else {
        sIso = limitar((meteo.isotermaLluvia - 1500) / 2000);
        tIso = `Isoterma 0 °C durante la lluvia: ~${fmt(meteo.isotermaLluvia)} m (sin datos de relieve para compararla).`;
      }
      f.push({ id: "isoterma", grupo: "D", nombre: "Isoterma 0 °C alta durante la lluvia", peso: P.isoterma, puntaje: sIso, texto: tIso });

      const sPrev = limitar(meteo.lluviaPrevia7 / zona.lluvia24);
      f.push({
        id: "lluviaPrevia", grupo: "D", nombre: "Suelo ya mojado (lluvia de los 7 días previos)", peso: P.lluviaPrevia, puntaje: sPrev,
        texto: `${fmt(meteo.lluviaPrevia7, 1)} mm en los 7 días anteriores.`,
      });
    } else {
      for (const [id, nombre] of [["lluvia", "Lluvia intensa"], ["isoterma", "Isoterma 0 °C alta durante la lluvia"], ["lluviaPrevia", "Suelo ya mojado"]]) {
        f.push({ id, grupo: "D", nombre, peso: P[id], puntaje: null, texto: "Sin datos meteorológicos." });
      }
    }

    // Susceptibilidad -------------------------------------------------------
    if (relieve && Number.isFinite(relieve.relieve6)) {
      const s = limitar((relieve.relieve6 - cfg.relieveMin) / (cfg.relievePleno - cfg.relieveMin));
      f.push({
        id: "relieve", grupo: "S", nombre: "Relieve y quebradas cercanas", peso: P.relieve, puntaje: s,
        texto: `Desnivel en 6 km: ${fmt(relieve.relieve6)} m; pendiente media en 1 km: hasta ${fmt(relieve.pendiente1km)}°. Altura del punto: ${fmt(relieve.elevacion)} m.`,
      });
    } else {
      f.push({ id: "relieve", grupo: "S", nombre: "Relieve y quebradas cercanas", peso: P.relieve, puntaje: null, texto: "Sin datos de elevación." });
    }

    if (incendiosCercanos === null || incendiosCercanos === undefined) {
      f.push({
        id: "incendio", grupo: "S", nombre: `Incendio reciente a menos de ${cfg.radioIncendioKm} km`, peso: P.incendio, puntaje: null,
        texto: "No evaluado: carga detecciones de incendios que cubran los años previos para incluirlo.",
      });
    } else {
      f.push({
        id: "incendio", grupo: "S", nombre: `Incendio reciente a menos de ${cfg.radioIncendioKm} km`, peso: P.incendio,
        puntaje: incendiosCercanos > 0 ? 1 : 0,
        texto: incendiosCercanos > 0
          ? `${incendiosCercanos} detección(es) de fuego cerca en los ${cfg.aniosIncendio} años previos (suelo quemado infiltra menos).`
          : "Sin detecciones de fuego cerca en los datos cargados.",
      });
    }

    const nHist = aluvionesCercanos || 0;
    f.push({
      id: "historial", grupo: "S", nombre: `Aluviones registrados a menos de ${cfg.radioHistorialKm} km`, peso: P.historial,
      puntaje: nHist > 0 ? 1 : 0,
      texto: nHist > 0 ? `${nHist} aluvión(es) previos en el registro cercano.` : "Ninguno en el registro (no significa que no hayan ocurrido).",
    });

    const promedio = (grupo) => {
      const ev = f.filter((x) => x.grupo === grupo && x.puntaje !== null);
      const pesos = ev.reduce((s, x) => s + x.peso, 0);
      return pesos ? ev.reduce((s, x) => s + x.peso * x.puntaje, 0) / pesos : null;
    };
    const D = promedio("D");
    const S = promedio("S");
    const indice = D === null || S === null ? null : Math.round(100 * Math.sqrt(D * S));
    const nivel = indice === null ? null : cfg.niveles.find((n) => indice >= n.min);
    for (const x of f) {
      x.estado = x.puntaje === null ? "sinDatos" : x.puntaje >= 0.66 ? "si" : x.puntaje >= 0.25 ? "parcial" : "no";
    }
    return { indice, nivel, detonante: D === null ? null : Math.round(D * 100), susceptibilidad: S === null ? null : Math.round(S * 100), zona, factores: f };
  }

  // Cuenta registros a menos de `km` de un punto y, opcionalmente, en un
  // rango de fechas.
  function contarCerca(items, lat, lon, km, { desde, hasta } = {}) {
    return items.filter((it) => {
      const f = soloDia(it.fecha);
      if (!tieneUbicacion(it)) return false;
      if (desde && f < desde.slice(0, f.length)) return false;
      if (hasta && f > hasta.slice(0, f.length)) return false;
      return distanciaKm(lat, lon, it.lat, it.lon) <= km;
    }).length;
  }

  const api = {
    CAJA_CHILE, CONFIG_FACTORES, RANGOS_MAG, RADIOS_RELIEVE, GRADIENTE_ESTANDAR,
    limitar, redondear, distanciaKm, desplazar, puntosRelieve,
    normalizarFecha, soloDia, sumarDias, diasEntre, tramosFechas,
    filtrar, tieneUbicacion, dentroDeCaja, histograma,
    parsearCSV, columna, parsearUSGS, parsearSismosCSV, parsearFIRMS, parsearAluviones, aCSV,
    mediana, resumenSismos, agruparFocos, resumenIncendios, resumenAluviones,
    zonaClimatica, estimarIsoterma, analizarRelieve, resumirMeteo, evaluarFactores, contarCerca,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.Nucleo = api;
})(typeof window !== "undefined" ? window : globalThis);
