'use strict';
/* ═══════════════ Claude para Contadores 2.0 ═══════════════
   App práctica para flujos de trabajo financieros.
   Todo corre en el navegador; los datos se guardan en localStorage. */

/* ───────── utilidades ───────── */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const CLP = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
const fmt = (n) => CLP.format(Math.round(n || 0));
const fmtCompact = (n) => {
  const signo = n < 0 ? '−' : '';
  const abs = Math.abs(n);
  if (abs >= 1e6) return signo + '$' + (abs / 1e6).toLocaleString('es-CL', { maximumFractionDigits: 1 }) + ' M';
  if (abs >= 1e3) return signo + '$' + Math.round(abs / 1e3).toLocaleString('es-CL') + ' mil';
  return fmt(n);
};

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const mesActual = () => hoyISO().slice(0, 7);

// '2026-07' → '2026-08', con delta positivo o negativo
const sumarMeses = (mes, delta) => {
  const [a, m] = mes.split('-').map(Number);
  const total = a * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
};
const nombreMes = (mes, largo = false) => {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(a, m - 1, 1);
  const txt = d.toLocaleDateString('es-CL', largo ? { month: 'long', year: 'numeric' } : { month: 'short', year: '2-digit' });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
};
const fmtFecha = (iso) => {
  const [a, m, d] = iso.split('-');
  return `${d}-${m}-${a}`;
};

const uid = () => 'id-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const descargar = (nombre, contenido, tipo) => {
  const blob = new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
};

/* ───────── almacenamiento ───────── */
const STORE_KEY = 'cpc:datos:v1';

const estadoInicial = () => ({
  movimientos: [],   // {id, fecha, tipo, categoria, descripcion, monto}
  apuntes: '',
  documentos: [],    // {id, plantilla, titulo, creado, texto}
  auditoria: {},     // { '2026-07': { 'iva:0': true } }
  config: { emisor: '' },
});

let estado = estadoInicial();

function cargar() {
  try {
    const crudo = localStorage.getItem(STORE_KEY);
    if (crudo) estado = Object.assign(estadoInicial(), JSON.parse(crudo));
  } catch (e) {
    console.warn('No se pudo leer el almacenamiento local:', e);
  }
}
function guardar() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(estado));
  } catch (e) {
    console.warn('No se pudo guardar:', e);
  }
}

/* ───────── tooltip compartido ───────── */
const tooltip = () => $('#tooltip');
function mostrarTip(html, x, y) {
  const t = tooltip();
  t.innerHTML = html;
  t.hidden = false;
  const margen = 14;
  const r = t.getBoundingClientRect();
  let px = x + margen, py = y - r.height - margen;
  if (px + r.width > window.innerWidth - 8) px = x - r.width - margen;
  if (py < 8) py = y + margen;
  t.style.left = px + 'px';
  t.style.top = py + 'px';
}
function ocultarTip() { tooltip().hidden = true; }

function activarTips(contenedor) {
  contenedor.addEventListener('mousemove', (ev) => {
    const el = ev.target.closest('[data-tip]');
    if (el) mostrarTip(el.dataset.tip, ev.clientX, ev.clientY);
    else ocultarTip();
  });
  contenedor.addEventListener('mouseleave', ocultarTip);
}

/* ═══════════════ NAVEGACIÓN ═══════════════ */
const VISTAS = ['inicio', 'caja', 'fiscal', 'proyecciones', 'documentos', 'auditoria'];
const RENDER = {
  inicio: renderInicio,
  caja: renderCaja,
  fiscal: renderFiscal,
  proyecciones: () => renderProyeccion(false),
  documentos: renderDocumentos,
  auditoria: renderAuditoria,
};

function navegar() {
  const ruta = (location.hash.replace(/^#\/?/, '') || '').split('?')[0];
  const enApp = VISTAS.includes(ruta);
  $('#portada').hidden = enApp;
  $('#app').hidden = !enApp;
  if (!enApp) {
    document.title = 'Claude para Contadores — App práctica para flujos de trabajo financieros';
    return;
  }
  VISTAS.forEach((v) => { $('#vista-' + v).hidden = v !== ruta; });
  $$('.app-nav a').forEach((a) => a.classList.toggle('activo', a.dataset.ruta === ruta));
  const titulos = {
    inicio: 'Escritorio', caja: 'Flujo de Caja', fiscal: 'Investigación Fiscal',
    proyecciones: 'Proyecciones', documentos: 'Documentos', auditoria: 'Auditoría',
  };
  document.title = titulos[ruta] + ' — Claude para Contadores';
  RENDER[ruta]();
  window.scrollTo({ top: 0 });
}

/* ═══════════════ INICIO ═══════════════ */
function renderInicio() {
  const mes = mesActual();
  const movs = estado.movimientos;
  const delMes = movs.filter((m) => m.fecha.startsWith(mes));
  const saldoTotal = movs.reduce((s, m) => s + (m.tipo === 'ingreso' ? m.monto : -m.monto), 0);
  const avance = avanceAuditoria(mes);
  const stats = [
    { r: 'Saldo acumulado', v: fmt(saldoTotal), c: saldoTotal >= 0 ? 'positivo' : 'negativo' },
    { r: 'Movimientos este mes', v: String(delMes.length), c: '' },
    { r: 'Auditoría del mes', v: avance.total ? Math.round(100 * avance.hechos / avance.total) + '%' : '—', c: '' },
    { r: 'Documentos emitidos', v: String(estado.documentos.length), c: '' },
  ];
  $('#inicio-stats').innerHTML = stats.map((s) =>
    `<div class="tarjeta stat ${s.c}"><span class="rotulo">${s.r}</span><strong>${s.v}</strong></div>`
  ).join('');
}

/* ═══════════════ FLUJO DE CAJA ═══════════════ */
const CATEGORIAS = {
  ingreso: ['Ventas', 'Honorarios', 'Devolución de impuestos', 'Otros ingresos'],
  egreso: ['Compras y proveedores', 'Remuneraciones', 'Impuestos (F29/F22)', 'Cotizaciones previsionales', 'Arriendo', 'Servicios básicos', 'Honorarios pagados', 'Otros egresos'],
};

function poblarCategorias() {
  const tipo = $('#mov-tipo').value;
  $('#mov-categoria').innerHTML = CATEGORIAS[tipo].map((c) => `<option>${c}</option>`).join('');
}

function movimientosDeMes(mes) {
  return estado.movimientos
    .filter((m) => m.fecha.startsWith(mes))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id));
}

function renderCaja() {
  const mes = $('#caja-mes').value || mesActual();
  $('#caja-mes').value = mes;

  const delMes = movimientosDeMes(mes);
  const ing = delMes.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0);
  const egr = delMes.filter((m) => m.tipo === 'egreso').reduce((s, m) => s + m.monto, 0);
  const finDeMes = mes + '-99';
  const acumulado = estado.movimientos
    .filter((m) => m.fecha <= finDeMes)
    .reduce((s, m) => s + (m.tipo === 'ingreso' ? m.monto : -m.monto), 0);

  $('#caja-stats').innerHTML = [
    { r: 'Ingresos del mes', v: fmt(ing), c: 'positivo' },
    { r: 'Egresos del mes', v: fmt(egr), c: 'negativo' },
    { r: 'Resultado del mes', v: fmt(ing - egr), c: ing - egr >= 0 ? 'positivo' : 'negativo' },
    { r: 'Saldo acumulado', v: fmt(acumulado), c: acumulado >= 0 ? 'positivo' : 'negativo' },
  ].map((s) => `<div class="tarjeta stat ${s.c}"><span class="rotulo">${s.r}</span><strong>${s.v}</strong></div>`).join('');

  // tabla
  const cuerpo = $('#tabla-movs tbody');
  cuerpo.innerHTML = delMes.map((m) => `
    <tr>
      <td>${fmtFecha(m.fecha)}</td>
      <td><span class="punto punto-${m.tipo}"></span>${esc(m.descripcion)}<span class="detalle-cat">${esc(m.categoria)}</span></td>
      <td class="num">${m.tipo === 'egreso' ? '−' : ''}${fmt(m.monto)}</td>
      <td><button class="btn-borrar" data-borrar="${m.id}" title="Eliminar movimiento" aria-label="Eliminar movimiento">✕</button></td>
    </tr>`).join('');
  $('#caja-vacio').hidden = delMes.length > 0;
  $('#tabla-movs').hidden = delMes.length === 0;

  renderGraficoCaja(mes);
}

function renderGraficoCaja(mesFinal) {
  const meses = [];
  for (let i = 5; i >= 0; i--) meses.push(sumarMeses(mesFinal, -i));
  const series = meses.map((mes) => {
    const movs = estado.movimientos.filter((m) => m.fecha.startsWith(mes));
    return {
      mes,
      ingreso: movs.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0),
      egreso: movs.filter((m) => m.tipo === 'egreso').reduce((s, m) => s + m.monto, 0),
    };
  });

  const cont = $('#caja-grafico');
  const bruto = Math.max(...series.map((s) => Math.max(s.ingreso, s.egreso)));
  if (bruto <= 0) {
    cont.innerHTML = '<p class="vacio">Sin datos en estos meses todavía.</p>';
    return;
  }
  // escala con pasos "redondos" (1, 2, 5 × 10^k)
  const pot = Math.pow(10, Math.floor(Math.log10(bruto / 4)));
  const n = (bruto / 4) / pot;
  const paso = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pot;
  const maxV = paso * Math.ceil(bruto / paso);

  const W = 660, H = 280, padI = 56, padD = 12, padS = 16, padB = 34;
  const areaW = W - padI - padD, areaH = H - padS - padB;
  const escala = (v) => areaH * (v / maxV);
  const colores = { ingreso: 'var(--serie-ingreso)', egreso: 'var(--serie-egreso)' };

  // líneas de rejilla en pasos redondos
  let rejilla = '';
  for (let v = paso; v <= maxV; v += paso) {
    const y = padS + areaH - escala(v);
    rejilla += `<line x1="${padI}" y1="${y}" x2="${W - padD}" y2="${y}" stroke="var(--linea)" stroke-width="1"/>` +
      `<text x="${padI - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="var(--tinta-suave)">${fmtCompact(v)}</text>`;
  }

  const grupoW = areaW / series.length;
  const barW = Math.min(34, (grupoW - 24) / 2);
  let barras = '';
  series.forEach((s, i) => {
    const cx = padI + grupoW * i + grupoW / 2;
    ['ingreso', 'egreso'].forEach((tipo, j) => {
      const v = s[tipo];
      const h = Math.max(v > 0 ? 2 : 0, escala(v));
      const x = cx + (j === 0 ? -barW - 1 : 1);
      const y = padS + areaH - h;
      const r = Math.min(4, h);
      const etiqueta = `${nombreMes(s.mes, true)} · ${tipo === 'ingreso' ? 'Ingresos' : 'Egresos'}: <strong>${fmt(v)}</strong>`;
      if (h > 0) {
        barras += `<path d="M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + barW - r},${y} Q${x + barW},${y} ${x + barW},${y + r} L${x + barW},${y + h} Z"
          fill="${colores[tipo]}" data-tip="${esc(etiqueta)}"/>`;
      } else {
        barras += `<rect x="${x}" y="${padS}" width="${barW}" height="${areaH}" fill="transparent" data-tip="${esc(etiqueta)}"/>`;
      }
    });
    barras += `<text x="${cx}" y="${H - 12}" text-anchor="middle" font-size="12" fill="var(--tinta-suave)">${nombreMes(s.mes)}</text>`;
  });

  cont.innerHTML = `<svg viewBox="0 0 ${W} ${H}" font-family="inherit">
    ${rejilla}
    <line x1="${padI}" y1="${padS + areaH}" x2="${W - padD}" y2="${padS + areaH}" stroke="var(--marco)" stroke-width="1"/>
    ${barras}
  </svg>`;
}

function agregarMovimiento(ev) {
  ev.preventDefault();
  const f = ev.target;
  const monto = Math.round(Number(f.monto.value));
  if (!f.fecha.value || !monto || monto <= 0) return;
  estado.movimientos.push({
    id: uid(),
    fecha: f.fecha.value,
    tipo: f.tipo.value,
    categoria: f.categoria.value,
    descripcion: f.descripcion.value.trim(),
    monto,
  });
  guardar();
  $('#caja-mes').value = f.fecha.value.slice(0, 7);
  f.descripcion.value = '';
  f.monto.value = '';
  renderCaja();
}

function exportarCSV() {
  const filas = [['fecha', 'tipo', 'categoria', 'descripcion', 'monto']];
  [...estado.movimientos]
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .forEach((m) => filas.push([m.fecha, m.tipo, m.categoria, m.descripcion.replace(/;/g, ','), String(m.monto)]));
  const csv = '\uFEFF' + filas.map((f) => f.join(';')).join('\r\n');
  descargar('flujo-de-caja.csv', csv, 'text/csv;charset=utf-8');
}

function cargarDemo() {
  const mes = $('#caja-mes').value || mesActual();
  const demo = [
    [-2, '05', 'ingreso', 'Honorarios', 'Contabilidad mensual cliente A', 450000],
    [-2, '12', 'ingreso', 'Ventas', 'Asesoría tributaria puntual', 180000],
    [-2, '20', 'egreso', 'Arriendo', 'Arriendo oficina', 250000],
    [-2, '28', 'egreso', 'Servicios básicos', 'Internet y luz', 45000],
    [-1, '05', 'ingreso', 'Honorarios', 'Contabilidad mensual cliente A', 450000],
    [-1, '10', 'ingreso', 'Honorarios', 'Contabilidad mensual cliente B', 380000],
    [-1, '18', 'egreso', 'Impuestos (F29/F22)', 'PPM y retenciones del período', 96000],
    [-1, '20', 'egreso', 'Arriendo', 'Arriendo oficina', 250000],
    [0, '05', 'ingreso', 'Honorarios', 'Contabilidad mensual cliente A', 450000],
    [0, '08', 'ingreso', 'Honorarios', 'Contabilidad mensual cliente B', 380000],
    [0, '11', 'ingreso', 'Ventas', 'Declaración renta persona natural', 120000],
    [0, '15', 'egreso', 'Cotizaciones previsionales', 'Previred del mes', 210000],
    [0, '20', 'egreso', 'Arriendo', 'Arriendo oficina', 250000],
    [0, '22', 'egreso', 'Servicios básicos', 'Internet y luz', 47000],
  ];
  demo.forEach(([dm, dia, tipo, categoria, descripcion, monto]) => {
    estado.movimientos.push({ id: uid(), fecha: sumarMeses(mes, dm) + '-' + dia, tipo, categoria, descripcion, monto });
  });
  guardar();
  renderCaja();
}

/* ═══════════════ INVESTIGACIÓN FISCAL ═══════════════ */
const FISCAL_DB = [
  {
    cat: 'IVA', titulo: 'IVA — tasa y hecho gravado',
    cuerpo: 'El Impuesto al Valor Agregado (DL 825) grava las ventas y servicios con tasa de <strong>19%</strong>. Desde la Ley 21.420, la generalidad de los servicios quedó gravada con IVA, con excepciones como las sociedades de profesionales y las prestaciones de salud y educación.',
  },
  {
    cat: 'IVA', titulo: 'F29 — declaración mensual',
    cuerpo: 'El Formulario 29 declara IVA (débito y crédito fiscal), PPM y retenciones. Plazo general: hasta el <strong>día 12</strong> del mes siguiente; los facturadores electrónicos que declaran y pagan por internet tienen plazo hasta el <strong>día 20</strong>, y las declaraciones sin pago se pueden presentar por internet hasta el día 28. Confirma cada período en el calendario tributario del SII.',
  },
  {
    cat: 'IVA', titulo: 'RCV y crédito fiscal',
    cuerpo: 'El Registro de Compras y Ventas (RCV) en sii.cl es la base de la propuesta de F29. Antes de declarar, cuadra el débito fiscal con el registro de ventas y el crédito fiscal con el registro de compras, y revisa el acuse de recibo de las facturas (Ley 19.983), que tiene un plazo de 8 días.',
  },
  {
    cat: 'Renta', titulo: 'F22 — Operación Renta',
    cuerpo: 'La declaración anual de impuesto a la renta (Formulario 22) se presenta en <strong>abril</strong> de cada año por las rentas del año comercial anterior, precedida por las declaraciones juradas (DDJJ) de marzo. Las devoluciones se pagan generalmente en mayo.',
  },
  {
    cat: 'Renta', titulo: 'PPM — pagos provisionales mensuales',
    cuerpo: 'Los PPM son anticipos obligatorios del impuesto anual: un porcentaje sobre los ingresos brutos que se entera cada mes en el F29 y se imputa al impuesto determinado en el F22. Si los PPM superan el impuesto, la diferencia se devuelve.',
  },
  {
    cat: 'Regímenes', titulo: 'Regímenes del art. 14 LIR',
    cuerpo: '<strong>14 A</strong> — régimen general semi-integrado, IDPC 27%. <strong>14 D N°3</strong> — Pro Pyme General, IDPC 25% (con rebajas transitorias en años recientes; verificar la tasa vigente). <strong>14 D N°8</strong> — Pro Pyme Transparente: la empresa queda liberada del IDPC y los dueños tributan directamente con sus impuestos finales. Para acceder al régimen Pro Pyme el promedio de ingresos brutos no debe exceder de 75.000 UF.',
  },
  {
    cat: 'Honorarios', titulo: 'Boletas de honorarios — retención vigente',
    cuerpo: 'La Ley 21.133 aumenta gradualmente la retención de las boletas de honorarios: 13,75% (2024), <strong>14,5% (2025)</strong>, <strong>15,25% (2026)</strong>, 16% (2027) y 17% (2028). La retención la práctica el pagador (o se entera como PPM por el emisor).',
  },
  {
    cat: 'Honorarios', titulo: 'Cotizaciones de independientes',
    cuerpo: 'Quienes emiten boletas de honorarios por montos anuales iguales o superiores a 5 ingresos mínimos mensuales deben cotizar obligatoriamente para pensión, salud y seguros sociales. Las cotizaciones se calculan y pagan en la Operación Renta con cargo a las retenciones, con opción transitoria de cobertura parcial (régimen gradual de la Ley 21.133).',
  },
  {
    cat: 'Plazos', titulo: 'Inicio de actividades',
    cuerpo: 'El aviso de inicio de actividades se presenta al SII dentro de los <strong>dos meses siguientes</strong> a aquel en que se comiencen las actividades (art. 68 del Código Tributario). Hoy se realiza en línea en sii.cl.',
  },
  {
    cat: 'Plazos', titulo: 'Término de giro',
    cuerpo: 'El aviso de término de giro se da dentro de los <strong>dos meses siguientes</strong> al cese de las actividades (art. 69 del Código Tributario), acompañando balance de término y pagando los impuestos correspondientes (F2121).',
  },
  {
    cat: 'Plazos', titulo: 'Prescripción tributaria',
    cuerpo: 'La regla general de prescripción de la acción fiscalizadora del SII es de <strong>3 años</strong>; se amplía a <strong>6 años</strong> respecto de impuestos sujetos a declaración cuando esta no se presentó o fue maliciosamente falsa (art. 200 del Código Tributario).',
  },
  {
    cat: 'Otros', titulo: 'UF y UTM',
    cuerpo: 'La <strong>UF</strong> se reajusta diariamente por IPC y se usa en créditos, contratos y topes legales. La <strong>UTM</strong> se reajusta mensualmente y se usa para multas y medidas tributarias. Los valores oficiales se publican en sii.cl y el Banco Central.',
  },
  {
    cat: 'Otros', titulo: 'Patente municipal',
    cuerpo: 'Toda actividad comercial o profesional paga una contribución de patente municipal (DL 3.063), que en el caso de las patentes comerciales e industriales se calcula entre el 2,5 y el 5 por mil del capital propio tributario, según la comuna. Se paga anualmente o en dos cuotas semestrales.',
  },
];

let fiscalCat = 'Todas';

function renderFiscal() {
  const cats = ['Todas', ...new Set(FISCAL_DB.map((f) => f.cat))];
  $('#fiscal-chips').innerHTML = cats.map((c) =>
    `<button type="button" class="chip ${c === fiscalCat ? 'activo' : ''}" data-cat="${c}">${c}</button>`
  ).join('');

  const q = ($('#fiscal-busqueda').value || '').toLowerCase().trim();
  const visibles = FISCAL_DB.filter((f) => {
    const enCat = fiscalCat === 'Todas' || f.cat === fiscalCat;
    const texto = (f.titulo + ' ' + f.cuerpo).toLowerCase();
    return enCat && (!q || texto.includes(q));
  });

  $('#fiscal-resultados').innerHTML = visibles.length
    ? visibles.map((f) => `
      <article class="tarjeta ficha">
        <span class="etiqueta">${f.cat}</span>
        <h4>${f.titulo}</h4>
        <p>${f.cuerpo}</p>
        <p class="fuente">Fuente de consulta: <a href="https://www.sii.cl" target="_blank" rel="noopener">sii.cl</a> · <a href="https://www.bcn.cl/leychile" target="_blank" rel="noopener">leychile.cl</a></p>
      </article>`).join('')
    : '<p class="vacio">Sin resultados para esa búsqueda.</p>';

  $('#fiscal-apuntes').value = estado.apuntes;
}

let apuntesTimer = null;
function guardarApuntes() {
  estado.apuntes = $('#fiscal-apuntes').value;
  clearTimeout(apuntesTimer);
  apuntesTimer = setTimeout(() => {
    guardar();
    const est = $('#fiscal-apuntes-estado');
    est.textContent = 'Guardado ✓';
    setTimeout(() => { est.innerHTML = '&nbsp;'; }, 1600);
  }, 400);
}

/* ═══════════════ PROYECCIONES ═══════════════ */
function renderProyeccion(desdeSubmit) {
  const f = $('#form-proy');
  const ingresoBase = Number(f.ingresoBase.value) || 0;
  const egresoBase = Number(f.egresoBase.value) || 0;
  const crecI = (Number(f.crecIngreso.value) || 0) / 100;
  const crecE = (Number(f.crecEgreso.value) || 0) / 100;
  const horizonte = Math.min(24, Math.max(3, Number(f.horizonte.value) || 12));

  const inicio = mesActual();
  const filas = [];
  let acumulado = 0;
  for (let i = 1; i <= horizonte; i++) {
    const ingresos = ingresoBase * Math.pow(1 + crecI, i - 1);
    const egresos = egresoBase * Math.pow(1 + crecE, i - 1);
    const resultado = ingresos - egresos;
    acumulado += resultado;
    filas.push({ mes: sumarMeses(inicio, i), ingresos, egresos, resultado, acumulado });
  }

  const cuerpo = $('#tabla-proy tbody');
  const totI = filas.reduce((s, x) => s + x.ingresos, 0);
  const totE = filas.reduce((s, x) => s + x.egresos, 0);
  cuerpo.innerHTML = filas.map((x) => `
    <tr>
      <td>${nombreMes(x.mes)}</td>
      <td class="num">${fmt(x.ingresos)}</td>
      <td class="num">${fmt(x.egresos)}</td>
      <td class="num">${fmt(x.resultado)}</td>
      <td class="num">${fmt(x.acumulado)}</td>
    </tr>`).join('') + `
    <tr class="fila-total">
      <td>Total</td>
      <td class="num">${fmt(totI)}</td>
      <td class="num">${fmt(totE)}</td>
      <td class="num">${fmt(totI - totE)}</td>
      <td class="num">${fmt(acumulado)}</td>
    </tr>`;

  renderGraficoProyeccion(filas);
  if (desdeSubmit) window.scrollTo({ top: 0 });
}

function renderGraficoProyeccion(filas) {
  const cont = $('#proy-grafico');
  if (!filas.length) { cont.innerHTML = '<p class="vacio">Sin datos.</p>'; return; }

  const W = 620, H = 260, padI = 62, padD = 14, padS = 14, padB = 30;
  const areaW = W - padI - padD, areaH = H - padS - padB;
  const vals = filas.map((x) => x.acumulado);
  const maxV = Math.max(0, ...vals), minV = Math.min(0, ...vals);
  const rango = maxV - minV || 1;
  const px = (i) => padI + (areaW * i) / Math.max(1, filas.length - 1);
  const py = (v) => padS + areaH * (1 - (v - minV) / rango);

  let rejilla = '';
  for (let i = 0; i <= 3; i++) {
    const v = minV + (rango * i) / 3;
    const y = py(v);
    rejilla += `<line x1="${padI}" y1="${y}" x2="${W - padD}" y2="${y}" stroke="var(--linea)" stroke-width="1"/>` +
      `<text x="${padI - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="var(--tinta-suave)">${fmtCompact(v)}</text>`;
  }
  const lineaCero = (minV < 0)
    ? `<line x1="${padI}" y1="${py(0)}" x2="${W - padD}" y2="${py(0)}" stroke="var(--marco)" stroke-width="1" stroke-dasharray="4 3"/>`
    : '';

  const puntos = filas.map((x, i) => `${px(i)},${py(x.acumulado)}`).join(' ');
  const marcas = filas.map((x, i) =>
    `<circle cx="${px(i)}" cy="${py(x.acumulado)}" r="4" fill="var(--serie-ingreso)" stroke="var(--papel-claro)" stroke-width="2"
       data-tip="${esc(nombreMes(x.mes, true) + ' · Acumulado: ')}<strong>${esc(fmt(x.acumulado))}</strong>"/>`
  ).join('');

  const paso = Math.ceil(filas.length / 6);
  const ejes = filas.map((x, i) => (i % paso === 0 || i === filas.length - 1)
    ? `<text x="${px(i)}" y="${H - 10}" text-anchor="middle" font-size="11" fill="var(--tinta-suave)">${nombreMes(x.mes)}</text>` : ''
  ).join('');

  cont.innerHTML = `<svg viewBox="0 0 ${W} ${H}" font-family="inherit">
    ${rejilla}${lineaCero}
    <polyline points="${puntos}" fill="none" stroke="var(--serie-ingreso)" stroke-width="2"/>
    ${marcas}${ejes}
  </svg>`;
}

function proyectarDesdeCaja() {
  const ahora = mesActual();
  const meses = [-3, -2, -1].map((d) => sumarMeses(ahora, d));
  const movs = estado.movimientos.filter((m) => meses.includes(m.fecha.slice(0, 7)));
  if (!movs.length) {
    alert('No hay movimientos en los últimos 3 meses del Flujo de Caja. Registra movimientos primero.');
    return;
  }
  const ing = movs.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0) / 3;
  const egr = movs.filter((m) => m.tipo === 'egreso').reduce((s, m) => s + m.monto, 0) / 3;
  const f = $('#form-proy');
  f.ingresoBase.value = Math.round(ing);
  f.egresoBase.value = Math.round(egr);
  renderProyeccion(false);
}

/* ═══════════════ DOCUMENTOS ═══════════════ */
const PLANTILLAS = [
  {
    id: 'informe-mensual',
    nombre: 'Informe tributario mensual al cliente',
    campos: [
      { n: 'cliente', l: 'Cliente (razón social)', t: 'text' },
      { n: 'rut', l: 'RUT del cliente', t: 'text', p: '76.123.456-7' },
      { n: 'periodo', l: 'Período', t: 'month' },
      { n: 'ventas', l: 'Ventas netas del período (CLP)', t: 'number' },
      { n: 'compras', l: 'Compras netas del período (CLP)', t: 'number' },
      { n: 'resultadoIva', l: 'Resultado de IVA', t: 'select', o: ['IVA a pagar', 'Remanente de crédito fiscal'] },
      { n: 'montoIva', l: 'Monto del resultado de IVA (CLP)', t: 'number' },
      { n: 'ppm', l: 'PPM del período (CLP)', t: 'number' },
      { n: 'observaciones', l: 'Observaciones', t: 'textarea', req: false },
    ],
    generar: (c, emisor) =>
`INFORME TRIBUTARIO MENSUAL

Cliente : ${c.cliente}
RUT     : ${c.rut}
Período : ${nombreMes(c.periodo, true)}

Estimado(a) cliente:

Junto con saludar, informo a usted el resumen tributario del período indicado, según los registros del Servicio de Impuestos Internos y la documentación disponible:

  · Ventas netas del período ....... ${fmt(Number(c.ventas))}
  · Compras netas del período ...... ${fmt(Number(c.compras))}
  · ${c.resultadoIva === 'IVA a pagar' ? 'IVA determinado a pagar ......' : 'Remanente de crédito fiscal ..'} ${fmt(Number(c.montoIva))}
  · PPM del período ................ ${fmt(Number(c.ppm))}

${c.observaciones ? 'Observaciones: ' + c.observaciones + '\n\n' : ''}El Formulario 29 del período fue preparado con la información antes señalada. Cualquier antecedente adicional que modifique estas cifras debe informarse a la brevedad para su rectificación.

Atentamente,

${emisor || '________________________'}
${fmtFecha(hoyISO())}`,
  },
  {
    id: 'propuesta-honorarios',
    nombre: 'Propuesta de honorarios contables',
    campos: [
      { n: 'cliente', l: 'Cliente (razón social o nombre)', t: 'text' },
      { n: 'rut', l: 'RUT del cliente', t: 'text', req: false },
      { n: 'servicios', l: 'Servicios incluidos (uno por línea)', t: 'textarea' },
      { n: 'monto', l: 'Honorario mensual (CLP)', t: 'number' },
      { n: 'vigencia', l: 'Vigencia de la propuesta (días)', t: 'number', v: '15' },
    ],
    generar: (c, emisor) =>
`PROPUESTA DE HONORARIOS PROFESIONALES

Señores
${c.cliente}${c.rut ? '\nRUT ' + c.rut : ''}
Presente

De mi consideración:

Por medio de la presente, propongo a ustedes la prestación de servicios contables y tributarios permanentes, que comprenden:

${c.servicios.split('\n').filter(Boolean).map((s) => '  · ' + s.trim()).join('\n')}

El honorario mensual por los servicios descritos asciende a ${fmt(Number(c.monto))} (${c.monto ? 'pesos chilenos' : ''}), pagadero dentro de los primeros cinco días de cada mes.

La presente propuesta tiene una vigencia de ${c.vigencia || '15'} días corridos desde esta fecha.

Sin otro particular, saluda atentamente,

${emisor || '________________________'}
${fmtFecha(hoyISO())}`,
  },
  {
    id: 'recordatorio-f29',
    nombre: 'Recordatorio de vencimiento F29',
    campos: [
      { n: 'cliente', l: 'Cliente', t: 'text' },
      { n: 'periodo', l: 'Período a declarar', t: 'month' },
      { n: 'fechaLimite', l: 'Fecha límite de declaración', t: 'date' },
      { n: 'monto', l: 'Monto estimado a pagar (CLP)', t: 'number', req: false },
      { n: 'pendientes', l: 'Antecedentes pendientes del cliente', t: 'textarea', req: false },
    ],
    generar: (c, emisor) =>
`RECORDATORIO — DECLARACIÓN MENSUAL F29

Estimado(a) ${c.cliente}:

Le recuerdo que la declaración mensual de impuestos (Formulario 29) del período ${nombreMes(c.periodo, true)} vence el día ${fmtFecha(c.fechaLimite)}.
${c.monto ? '\nEl monto estimado a pagar asciende a ' + fmt(Number(c.monto)) + ', el que debe estar disponible para su pago en línea antes del vencimiento.\n' : ''}${c.pendientes ? '\nPara completar la declaración se requiere que nos haga llegar a la brevedad:\n' + c.pendientes.split('\n').filter(Boolean).map((s) => '  · ' + s.trim()).join('\n') + '\n' : ''}
La declaración fuera de plazo genera multas e intereses que es posible evitar declarando oportunamente.

Atentamente,

${emisor || '________________________'}
${fmtFecha(hoyISO())}`,
  },
  {
    id: 'solicitud-antecedentes',
    nombre: 'Solicitud de antecedentes para cierre mensual',
    campos: [
      { n: 'cliente', l: 'Cliente', t: 'text' },
      { n: 'periodo', l: 'Período de cierre', t: 'month' },
      { n: 'documentos', l: 'Documentos solicitados (uno por línea)', t: 'textarea', v: 'Cartolas bancarias del mes\nFacturas de compra no registradas\nBoletas de honorarios recibidas\nLiquidaciones de sueldo y finiquitos' },
      { n: 'plazo', l: 'Fecha tope de entrega', t: 'date' },
    ],
    generar: (c, emisor) =>
`SOLICITUD DE ANTECEDENTES — CIERRE ${nombreMes(c.periodo, true).toUpperCase()}

Estimado(a) ${c.cliente}:

Para efectuar el cierre contable y tributario del período ${nombreMes(c.periodo, true)}, agradeceré hacernos llegar, a más tardar el ${fmtFecha(c.plazo)}, los siguientes antecedentes:

${c.documentos.split('\n').filter(Boolean).map((s) => '  · ' + s.trim()).join('\n')}

La entrega oportuna de esta información permite declarar dentro de plazo y evitar multas e intereses.

Atentamente,

${emisor || '________________________'}
${fmtFecha(hoyISO())}`,
  },
];

let docActual = null; // {titulo, texto}

function renderDocumentos() {
  const sel = $('#doc-plantilla');
  if (!sel.options.length) {
    sel.innerHTML = PLANTILLAS.map((p) => `<option value="${p.id}">${p.nombre}</option>`).join('');
  }
  $('#doc-emisor').value = estado.config.emisor || '';
  renderCamposDoc();
  renderHistorialDocs();
}

function renderCamposDoc() {
  const p = PLANTILLAS.find((x) => x.id === $('#doc-plantilla').value) || PLANTILLAS[0];
  $('#doc-campos').innerHTML = p.campos.map((c) => {
    const req = c.req === false ? '' : 'required';
    if (c.t === 'textarea') return `<label>${c.l}<textarea name="${c.n}" rows="3" ${req}>${esc(c.v || '')}</textarea></label>`;
    if (c.t === 'select') return `<label>${c.l}<select name="${c.n}">${c.o.map((o) => `<option>${o}</option>`).join('')}</select></label>`;
    return `<label>${c.l}<input type="${c.t}" name="${c.n}" value="${esc(c.v || '')}" placeholder="${esc(c.p || '')}" ${c.t === 'number' ? 'min="0" step="1"' : ''} ${req}></label>`;
  }).join('');
}

function generarDocumento(ev) {
  ev.preventDefault();
  const p = PLANTILLAS.find((x) => x.id === $('#doc-plantilla').value);
  if (!p) return;
  estado.config.emisor = $('#doc-emisor').value.trim();

  const datos = {};
  p.campos.forEach((c) => {
    const el = $(`#doc-campos [name="${c.n}"]`);
    datos[c.n] = el ? el.value.trim() : '';
  });
  const texto = p.generar(datos, estado.config.emisor);
  const titulo = `${p.nombre} — ${datos.cliente || 'sin cliente'}`;
  docActual = { titulo, texto };

  estado.documentos.unshift({ id: uid(), plantilla: p.id, titulo, creado: hoyISO(), texto });
  estado.documentos = estado.documentos.slice(0, 40);
  guardar();
  mostrarDocumento(docActual);
  renderHistorialDocs();
}

function mostrarDocumento(doc) {
  docActual = doc;
  $('#doc-preview').innerHTML = `
    <div class="doc-membrete"><strong>❦ CLAUDE PARA CONTADORES ❦</strong><br><span class="rotulo">Documento de trabajo</span></div>
    <pre>${esc(doc.texto)}</pre>`;
  ['#btn-doc-copiar', '#btn-doc-imprimir', '#btn-doc-descargar'].forEach((s) => { $(s).disabled = false; });
}

function renderHistorialDocs() {
  const ul = $('#doc-historial');
  ul.innerHTML = estado.documentos.length
    ? estado.documentos.map((d) => `
      <li>
        <button type="button" class="doc-abrir" data-doc="${d.id}">${esc(d.titulo)}</button>
        <span class="doc-fecha">${fmtFecha(d.creado)}</span>
        <button type="button" class="btn-borrar" data-doc-borrar="${d.id}" title="Eliminar documento" aria-label="Eliminar documento">✕</button>
      </li>`).join('')
    : '<li class="vacio">Aún no has generado documentos.</li>';
}

function imprimirDocumento() {
  if (!docActual) return;
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${esc(docActual.titulo)}</title>
    <style>
      body { font-family: Georgia, 'Times New Roman', serif; color: #2c1c16; margin: 2.5cm 2cm; }
      .membrete { text-align: center; border-bottom: 3px double #8a5a44; padding-bottom: 8px; margin-bottom: 24px; letter-spacing: 2px; }
      pre { font-family: inherit; white-space: pre-wrap; font-size: 12.5pt; line-height: 1.6; }
    </style></head><body>
    <div class="membrete"><strong>❦ CLAUDE PARA CONTADORES ❦</strong></div>
    <pre>${esc(docActual.texto)}</pre>
    </body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

/* ═══════════════ AUDITORÍA ═══════════════ */
const CHECKLISTS = [
  {
    id: 'iva', nombre: 'Cierre mensual de IVA (F29)', nota: 'Cuadratura del período antes de declarar.',
    items: [
      'Descargar RCV de compras y ventas desde sii.cl',
      'Revisar acuse de recibo de facturas de compra (crédito fiscal)',
      'Cuadrar débito fiscal del F29 con el registro de ventas',
      'Cuadrar crédito fiscal del F29 con el registro de compras',
      'Calcular PPM y retenciones del período',
      'Declarar y pagar el F29 dentro de plazo',
      'Archivar comprobante y respaldos del período',
    ],
  },
  {
    id: 'remu', nombre: 'Remuneraciones y previsión', nota: 'Obligaciones laborales del mes.',
    items: [
      'Actualizar libro de remuneraciones',
      'Emitir liquidaciones de sueldo firmadas',
      'Declarar y pagar cotizaciones previsionales (Previred) dentro de plazo',
      'Enviar Libro de Remuneraciones Electrónico (LRE) a la Dirección del Trabajo',
      'Provisionar vacaciones y finiquitos',
    ],
  },
  {
    id: 'hono', nombre: 'Honorarios (BHE)', nota: 'Boletas de honorarios emitidas y recibidas.',
    items: [
      'Verificar boletas de honorarios emitidas y recibidas del período',
      'Revisar que la retención aplicada sea la vigente del año',
      'Declarar las retenciones de honorarios en el F29',
      'Archivar el resumen mensual de boletas',
    ],
  },
  {
    id: 'renta', nombre: 'Operación Renta (anual)', nota: 'Revisar durante el primer cuatrimestre.',
    items: [
      'Confeccionar balance y determinar la base imponible',
      'Presentar las declaraciones juradas (DDJJ) dentro de plazo',
      'Verificar la propuesta de F22 del SII contra los registros propios',
      'Presentar el F22 en abril',
      'Revisar la devolución o giro resultante',
      'Archivar la carpeta tributaria del año',
    ],
  },
];

function avanceAuditoria(periodo) {
  const marcas = estado.auditoria[periodo] || {};
  let total = 0, hechos = 0;
  CHECKLISTS.forEach((cl) => cl.items.forEach((_, i) => {
    total++;
    if (marcas[cl.id + ':' + i]) hechos++;
  }));
  return { total, hechos };
}

function renderAuditoria() {
  const periodo = $('#audit-periodo').value || mesActual();
  $('#audit-periodo').value = periodo;
  const marcas = estado.auditoria[periodo] || {};

  $('#audit-listas').innerHTML = CHECKLISTS.map((cl) => {
    const hechos = cl.items.filter((_, i) => marcas[cl.id + ':' + i]).length;
    return `
    <div class="tarjeta checklist">
      <h4>${cl.nombre}</h4>
      <p class="nota">${cl.nota} · ${hechos}/${cl.items.length}</p>
      <ul>
        ${cl.items.map((item, i) => {
          const clave = cl.id + ':' + i;
          const hecho = !!marcas[clave];
          return `<li class="${hecho ? 'hecho' : ''}">
            <label><input type="checkbox" data-check="${clave}" ${hecho ? 'checked' : ''}> <span>${item}</span></label>
          </li>`;
        }).join('')}
      </ul>
    </div>`;
  }).join('');

  const { total, hechos } = avanceAuditoria(periodo);
  const pct = total ? Math.round((100 * hechos) / total) : 0;
  $('#audit-avance-barra').style.width = pct + '%';
  $('#audit-avance-texto').textContent = pct + '%';
}

function marcarAuditoria(clave, valor) {
  const periodo = $('#audit-periodo').value || mesActual();
  if (!estado.auditoria[periodo]) estado.auditoria[periodo] = {};
  if (valor) estado.auditoria[periodo][clave] = true;
  else delete estado.auditoria[periodo][clave];
  guardar();
  renderAuditoria();
}

/* ═══════════════ RESPALDO ═══════════════ */
function exportarJSON() {
  descargar('claude-para-contadores-respaldo.json', JSON.stringify(estado, null, 2), 'application/json');
}

function importarJSON(archivo) {
  const lector = new FileReader();
  lector.onload = () => {
    try {
      const datos = JSON.parse(lector.result);
      if (!datos || !Array.isArray(datos.movimientos)) throw new Error('Formato no reconocido');
      estado = Object.assign(estadoInicial(), datos);
      guardar();
      navegar();
      alert('Respaldo importado correctamente.');
    } catch (e) {
      alert('El archivo no es un respaldo válido de Claude para Contadores.');
    }
  };
  lector.readAsText(archivo);
}

/* ═══════════════ INICIALIZACIÓN ═══════════════ */
function init() {
  cargar();

  // portada
  $('#btn-acceso').addEventListener('click', () => { location.hash = '#/inicio'; });

  // navegación
  window.addEventListener('hashchange', navegar);

  // flujo de caja
  $('#form-mov').fecha.value = hoyISO();
  poblarCategorias();
  $('#mov-tipo').addEventListener('change', poblarCategorias);
  $('#form-mov').addEventListener('submit', agregarMovimiento);
  $('#caja-mes').addEventListener('change', renderCaja);
  $('#btn-exportar-csv').addEventListener('click', exportarCSV);
  $('#btn-demo').addEventListener('click', cargarDemo);
  $('#tabla-movs').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-borrar]');
    if (!btn) return;
    estado.movimientos = estado.movimientos.filter((m) => m.id !== btn.dataset.borrar);
    guardar();
    renderCaja();
  });
  activarTips($('#caja-grafico'));

  // fiscal
  $('#fiscal-busqueda').addEventListener('input', renderFiscal);
  $('#fiscal-chips').addEventListener('click', (ev) => {
    const chip = ev.target.closest('[data-cat]');
    if (!chip) return;
    fiscalCat = chip.dataset.cat;
    renderFiscal();
  });
  $('#fiscal-apuntes').addEventListener('input', guardarApuntes);

  // proyecciones
  $('#form-proy').addEventListener('submit', (ev) => { ev.preventDefault(); renderProyeccion(false); });
  $('#btn-proy-desde-caja').addEventListener('click', proyectarDesdeCaja);
  activarTips($('#proy-grafico'));

  // documentos
  $('#doc-plantilla').addEventListener('change', renderCamposDoc);
  $('#form-doc').addEventListener('submit', generarDocumento);
  $('#btn-doc-copiar').addEventListener('click', async () => {
    if (!docActual) return;
    try {
      await navigator.clipboard.writeText(docActual.texto);
      $('#btn-doc-copiar').textContent = 'Copiado ✓';
      setTimeout(() => { $('#btn-doc-copiar').textContent = 'Copiar texto'; }, 1500);
    } catch (e) {
      alert('No fue posible copiar automáticamente. Selecciona el texto y cópialo manualmente.');
    }
  });
  $('#btn-doc-imprimir').addEventListener('click', imprimirDocumento);
  $('#btn-doc-descargar').addEventListener('click', () => {
    if (docActual) descargar('documento.txt', docActual.texto, 'text/plain;charset=utf-8');
  });
  $('#doc-historial').addEventListener('click', (ev) => {
    const abrir = ev.target.closest('[data-doc]');
    const borrar = ev.target.closest('[data-doc-borrar]');
    if (borrar) {
      estado.documentos = estado.documentos.filter((d) => d.id !== borrar.dataset.docBorrar);
      guardar();
      renderHistorialDocs();
      return;
    }
    if (abrir) {
      const d = estado.documentos.find((x) => x.id === abrir.dataset.doc);
      if (d) mostrarDocumento(d);
    }
  });

  // auditoría
  $('#audit-periodo').addEventListener('change', renderAuditoria);
  $('#audit-listas').addEventListener('change', (ev) => {
    const chk = ev.target.closest('[data-check]');
    if (chk) marcarAuditoria(chk.dataset.check, chk.checked);
  });

  // respaldo
  $('#btn-exportar-json').addEventListener('click', exportarJSON);
  $('#input-importar-json').addEventListener('change', (ev) => {
    if (ev.target.files[0]) importarJSON(ev.target.files[0]);
    ev.target.value = '';
  });
  $('#btn-borrar-todo').addEventListener('click', () => {
    if (confirm('Esto elimina TODOS los datos guardados (movimientos, apuntes, documentos y auditoría). ¿Continuar?')) {
      estado = estadoInicial();
      guardar();
      navegar();
    }
  });

  navegar();
}

document.addEventListener('DOMContentLoaded', init);
