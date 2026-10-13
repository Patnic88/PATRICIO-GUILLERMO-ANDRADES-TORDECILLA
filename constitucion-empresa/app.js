// Interfaz del sitio y del asistente de constitución. Las reglas, la
// validación y los textos están en logica.js; aquí solo se dibuja la página,
// se guarda el avance en el navegador y se arma el envío.

(function () {
  "use strict";

  const L = window.Logica;
  const C = window.CONFIG || {};
  const CLAVE = "constitucion-empresa:v1";
  const $ = (sel, raiz) => (raiz || document).querySelector(sel);
  const $$ = (sel, raiz) => Array.from((raiz || document).querySelectorAll(sel));

  const REGIONES = [
    "Arica y Parinacota", "Tarapacá", "Antofagasta", "Atacama", "Coquimbo", "Valparaíso",
    "Metropolitana de Santiago", "Libertador General Bernardo O'Higgins", "Maule", "Ñuble",
    "Biobío", "La Araucanía", "Los Ríos", "Los Lagos",
    "Aysén del General Carlos Ibáñez del Campo", "Magallanes y de la Antártica Chilena",
  ];

  let estado = cargar();

  // ------------------------------------------------------- Persistencia ---

  function cargar() {
    try {
      const raw = localStorage.getItem(CLAVE);
      if (raw) {
        const e = JSON.parse(raw);
        if (e && e.version === 1) {
          const base = L.estadoInicial();
          const s = Object.assign(base, e, {
            empresa: Object.assign(base.empresa, e.empresa),
            admin: Object.assign(base.admin, e.admin),
            contacto: Object.assign(base.contacto, e.contacto),
            socios: (e.socios && e.socios.length ? e.socios : base.socios).map((x) => Object.assign(L.socioVacio(x.id), x)),
          });
          s.paso = Math.min(Math.max(0, s.paso | 0), L.PASOS.length - 1);
          return s;
        }
      }
    } catch (_) { /* sin almacenamiento: se trabaja en memoria */ }
    return L.estadoInicial();
  }

  function guardar() {
    try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch (_) { /* idem */ }
  }

  function hayBorrador() {
    return Boolean(estado.tipo || estado.socios.some((s) => s.rut || s.nombres || s.razonSocial));
  }

  // ---------------------------------------------------------- Utilidades ---

  function esc(t) {
    return String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function esFalta(v) {
    const s = String(v == null ? "" : v).trim();
    return !s || /^\[(FALTA|VERIFICAR)/.test(s);
  }

  // Dato de configuración o, si falta, el marcador visible.
  function dato(valor, marcador) {
    const v = String(valor == null ? "" : valor).trim();
    if (!v) return '<span class="falta">' + esc(marcador) + "</span>";
    if (esFalta(v)) return '<span class="falta">' + esc(v) + "</span>";
    return esc(v);
  }

  function precioHtml(p) {
    return p == null ? '<span class="falta">[FALTA: precio]</span>' : esc(L.formatearPesos(Number(p)));
  }

  function nuevoId() {
    let n = estado.socios.length + 1;
    while (estado.socios.some((s) => s.id === "s" + n)) n++;
    return "s" + n;
  }

  function getValor(key) {
    if (key.startsWith("socio:")) {
      const [, id, campo] = key.split(":");
      const s = estado.socios.find((x) => x.id === id);
      return s ? s[campo] : "";
    }
    return key.split(".").reduce((o, k) => (o == null ? o : o[k]), estado);
  }

  function setValor(key, valor) {
    if (key.startsWith("socio:")) {
      const [, id, campo] = key.split(":");
      const s = estado.socios.find((x) => x.id === id);
      if (s) s[campo] = valor;
      return;
    }
    const partes = key.split(".");
    const ultimo = partes.pop();
    const obj = partes.reduce((o, k) => o[k], estado);
    obj[ultimo] = valor;
  }

  // ------------------------------------------------- Configuración global ---

  function pendientesConfig() {
    const p = [];
    if (esFalta(C.marca)) p.push("nombre de la marca");
    if (esFalta(C.prestador)) p.push("prestador");
    if (!C.whatsapp && !C.correo) p.push("WhatsApp o correo");
    if (esFalta(C.horario)) p.push("horario");
    const sinPrecio = Object.values(L.TIPOS).filter((t) => !C.precios || C.precios[t.id] == null).map((t) => t.corto);
    if (sinPrecio.length) p.push("precios (" + sinPrecio.join(", ") + ")");
    if ((C.extras || []).some((x) => x.precio == null)) p.push("precios de servicios adicionales");
    if (esFalta(C.plazoFirma)) p.push("plazo de firma por verificar");
    return p;
  }

  function aplicarConfig() {
    const p = pendientesConfig();
    const franja = $("#franjaConfig");
    if (p.length) {
      franja.textContent = "Borrador: falta completar config.js — " + p.join(" · ") + ".";
      franja.hidden = false;
    }
    $$("[data-marca]").forEach((el) => (el.innerHTML = dato(C.marca, "[FALTA: nombre de la marca]")));
    $$("[data-prestador]").forEach((el) => (el.innerHTML = dato(C.prestador, "[FALTA: prestador]")));
    $$("[data-plazo-firma]").forEach((el) => (el.innerHTML = dato(C.plazoFirma, "[VERIFICAR: plazo de firma]")));
    if (!esFalta(C.marca)) document.title = "Constituye tu empresa en línea · " + C.marca;

    const contacto = [];
    if (C.whatsapp) {
      contacto.push('WhatsApp <a href="https://wa.me/' + esc(C.whatsapp) + '" target="_blank" rel="noopener">+' + esc(C.whatsapp) + "</a>");
    }
    if (C.correo) contacto.push('<a href="mailto:' + esc(C.correo) + '">' + esc(C.correo) + "</a>");
    if (!contacto.length) contacto.push('<span class="falta">[FALTA: WhatsApp o correo]</span>');
    contacto.push(dato(C.horario, "[FALTA: horario]"));
    $$("[data-contacto]").forEach((el) => (el.innerHTML = contacto.join(" · ")));
  }

  // ------------------------------------------------------------ Portada ---

  function renderInicio() {
    $("#notaBorrador").hidden = !hayBorrador();

    $("#tarjetasTipo").innerHTML = Object.values(L.TIPOS)
      .map(
        (t) => `
        <article class="tarjeta-tipo">
          <span class="sigla">${esc(t.corto)}</span>
          <h3>${esc(t.nombre)}</h3>
          <p>${esc(t.quien)}</p>
          <p class="regla">${esc(t.regla)}</p>
          <button type="button" class="btn btn-secundario btn-chico" data-elegir="${t.id}">Constituir una ${esc(t.corto)}</button>
        </article>`
      )
      .join("");

    $("#planes").innerHTML = Object.values(L.TIPOS)
      .map(
        (t) => `
        <div class="plan">
          <b>${esc(t.corto)}</b>
          <div class="precio">${precioHtml(C.precios ? C.precios[t.id] : null)}<small>pago único</small></div>
          <button type="button" class="btn btn-primario btn-chico" data-elegir="${t.id}">Empezar</button>
        </div>`
      )
      .join("");

    $("#incluye").innerHTML = (C.incluye || []).map((x) => "<li>" + esc(x) + "</li>").join("");
    orientar();
  }

  function orientar() {
    const cantidad = $("#oCantidad").value;
    const res = $("#oResultado");
    if (!cantidad) {
      res.textContent = "Responde y te mostramos qué tipos son posibles.";
      return;
    }
    const ids = L.tiposPosibles(cantidad, $("#oJuridica").checked);
    if (!ids.length) {
      res.textContent = "Indica cuántas personas serán.";
      return;
    }
    const nombres = ids.map((id) => L.TIPOS[id].nombre + " (" + L.TIPOS[id].corto + ")");
    res.textContent =
      "Puedes constituir una " + nombres.join(" o una ") +
      (ids.length > 1 ? ". Si dudas entre ellas, te asesoramos antes de firmar." : ".");
  }

  function elegirTipo(id) {
    estado.tipo = id;
    estado.paso = 1;
    guardar();
    if (location.hash === "#constituir") route();
    else location.hash = "#constituir";
  }

  // ------------------------------------------------------- Asistente ---

  function renderPasos() {
    $("#pasos").innerHTML = L.PASOS.map((p, i) => {
      const cls = i < estado.paso ? "hecho" : i === estado.paso ? "actual" : "";
      const texto = i < estado.paso
        ? `<button type="button" class="enlace" data-ir="${i}"><span>${esc(p.titulo)}</span></button>`
        : `<span>${esc(p.titulo)}</span>`;
      return `<li class="${cls}"${i === estado.paso ? ' aria-current="step"' : ""}>${texto}</li>`;
    }).join("");
  }

  function renderAsistente(foco) {
    renderPasos();
    $("#paso").innerHTML = PASOS_HTML[L.PASOS[estado.paso].id]();
    actualizarVivos();
    limpiarErrores();
    const ultimo = estado.paso === L.PASOS.length - 1;
    $("#btnAtras").style.visibility = estado.paso === 0 ? "hidden" : "visible";
    $("#btnSiguiente").hidden = ultimo;
    if (foco) {
      const el = $('[data-key="' + foco + '"]:checked') || $('[data-key="' + foco + '"]');
      if (el) el.focus();
    }
  }

  function campo(key, etiqueta, opciones) {
    const o = opciones || {};
    const valor = getValor(key);
    const id = "f-" + key.replace(/[^a-zA-Z0-9]/g, "-");
    const ayuda = o.ayuda ? `<span class="ayuda" id="${id}-a">${o.ayuda}</span>` : "";
    const opc = o.opcional ? ' <span class="opcional">(opcional)</span>' : "";
    const comunes = `id="${id}" data-key="${esc(key)}" ${o.ayuda ? `aria-describedby="${id}-a"` : ""} ${o.attrs || ""}`;
    let control;
    if (o.tipo === "textarea") {
      control = `<textarea ${comunes}>${esc(valor)}</textarea>`;
    } else if (o.tipo === "select") {
      control = `<select ${comunes}><option value="">Elige…</option>${o.opciones
        .map(([v, t]) => `<option value="${esc(v)}"${v === valor ? " selected" : ""}>${esc(t)}</option>`)
        .join("")}</select>`;
    } else {
      control = `<input type="${o.tipo || "text"}" ${comunes} value="${esc(valor)}" />`;
    }
    return `<label class="campo" for="${id}"><span>${etiqueta}${opc}</span>${control}${ayuda}<span class="err" data-err="${esc(key)}"></span></label>`;
  }

  function segmentado(key, leyenda, opciones, extra) {
    const valor = getValor(key);
    const nombre = "r-" + key.replace(/[^a-zA-Z0-9]/g, "-");
    return `<fieldset class="campo"><legend>${leyenda}</legend><div class="segmentado">${opciones
      .map(
        ([v, t]) =>
          `<label><input type="radio" name="${nombre}" value="${esc(v)}" data-key="${esc(key)}"${extra || ""}${v === valor ? " checked" : ""} />${esc(t)}</label>`
      )
      .join("")}</div><span class="err" data-err="${esc(key)}"></span></fieldset>`;
  }

  const SI_NO_NOSE = [["si", "Sí"], ["no", "No"], ["nose", "No sé"]];

  function tarjetaSocio(s, i, tipo) {
    const k = (c) => "socio:" + s.id + ":" + c;
    const titulo = tipo.maxSocios === 1 ? "Titular" : tipo.socio.charAt(0).toUpperCase() + tipo.socio.slice(1) + " " + (i + 1);
    const quitar = estado.socios.length > 1
      ? `<button type="button" class="enlace quitar" data-accion="quitar" data-id="${s.id}">Quitar</button>`
      : "";
    const tipoPersona = tipo.admiteJuridicas
      ? segmentado(k("tipoPersona"), "Es una…", [["natural", "Persona natural"], ["juridica", "Empresa (persona jurídica)"]], " data-estructura")
      : "";
    let datos;
    if (s.tipoPersona === "juridica") {
      datos = `
        <div class="fila fila-2">
          ${campo(k("razonSocial"), "Razón social", { attrs: 'autocomplete="organization"' })}
          ${campo(k("rut"), "RUT de la empresa", { attrs: 'data-rut inputmode="text" placeholder="76.123.456-7"' })}
        </div>
        <div class="fila fila-2">
          ${campo(k("repNombre"), "Nombre del representante")}
          ${campo(k("repRut"), "RUT del representante", { attrs: 'data-rut placeholder="12.345.678-5"' })}
        </div>`;
    } else {
      datos = `
        <div class="fila fila-3">
          ${campo(k("nombres"), "Nombres", { attrs: 'autocomplete="given-name"' })}
          ${campo(k("apellidoPaterno"), "Apellido paterno", { attrs: 'autocomplete="family-name"' })}
          ${campo(k("apellidoMaterno"), "Apellido materno", { opcional: true })}
        </div>
        <div class="fila fila-2">
          ${campo(k("rut"), "RUT", { attrs: 'data-rut placeholder="12.345.678-5"' })}
          ${campo(k("nacionalidad"), "Nacionalidad")}
        </div>
        <div class="fila fila-2">
          ${campo(k("estadoCivil"), "Estado civil", { tipo: "select", opciones: Object.entries(L.ESTADO_CIVIL) })}
          ${campo(k("profesion"), "Profesión u oficio")}
        </div>`;
    }
    const firmante = s.tipoPersona === "juridica" ? "¿El representante tiene" : "¿Tiene";
    return `
      <section class="socio" aria-labelledby="t-${s.id}">
        <div class="socio-cab"><h3 id="t-${s.id}">${esc(titulo)}</h3>${quitar}</div>
        ${tipoPersona}
        ${datos}
        ${campo(k("domicilio"), "Domicilio", { ayuda: "Calle, número y comuna.", attrs: 'autocomplete="street-address"' })}
        <div class="fila fila-2">
          ${campo(k("correo"), "Correo", { tipo: "email", attrs: 'autocomplete="email"' })}
          ${campo(k("telefono"), "Teléfono", { tipo: "tel", opcional: true, attrs: 'autocomplete="tel" placeholder="+56 9 1234 5678"' })}
        </div>
        ${campo(k("aporte"), "Aporte al capital (en pesos)", { attrs: 'inputmode="numeric" data-pesos placeholder="1.000.000"' })}
        <div class="fila fila-2">
          ${segmentado(k("tieneFEA"), firmante + " Firma Electrónica Avanzada?", SI_NO_NOSE)}
          ${segmentado(k("tieneClaveUnica"), firmante + " ClaveÚnica?", SI_NO_NOSE)}
        </div>
      </section>`;
  }

  const PASOS_HTML = {
    tipo() {
      return `
        <h2 class="paso-tit">¿Qué tipo de empresa quieres constituir?</h2>
        <p class="paso-ayuda">¿No sabes cuál? Usa el <a href="#tipos">orientador de la portada</a>.</p>
        <fieldset class="campo">
          <legend class="sr">Tipo de empresa</legend>
          <div class="opciones-tipo">
            ${Object.values(L.TIPOS)
              .map(
                (t) => `
              <label class="opcion">
                <input type="radio" name="tipo" value="${t.id}" data-key="tipo"${estado.tipo === t.id ? " checked" : ""} />
                <span><b>${esc(t.nombre)} (${esc(t.corto)})</b><small>${esc(t.quien)}</small></span>
              </label>`
              )
              .join("")}
          </div>
          <span class="err" data-err="tipo"></span>
        </fieldset>`;
    },

    socios() {
      const tipo = L.TIPOS[estado.tipo];
      const puedeAgregar = tipo.maxSocios == null || estado.socios.length < tipo.maxSocios;
      const titulo = tipo.maxSocios === 1 ? "Datos del titular" : "Datos de los " + tipo.socios;
      return `
        <h2 class="paso-tit">${esc(titulo)}</h2>
        <p class="paso-ayuda">${esc(tipo.quien)} Usaremos estos datos para el estatuto y para coordinar la firma.</p>
        <span class="err" data-err="socios"></span>
        ${estado.socios.map((s, i) => tarjetaSocio(s, i, tipo)).join("")}
        ${puedeAgregar ? `<button type="button" class="btn btn-secundario agregar" data-accion="agregar">+ Agregar ${esc(tipo.socio)}</button>` : ""}
        <div class="vivo" id="vivoCapital" aria-live="polite"></div>`;
    },

    empresa() {
      const tipo = L.TIPOS[estado.tipo];
      const t = estado.socios[0] || {};
      const ejemploEirl = estado.tipo === "EIRL" && t.nombres
        ? ` Ej.: «Servicios ${esc(String(t.nombres).split(/\s+/)[0])} ${esc(t.apellidoPaterno || "")}».`
        : "";
      return `
        <h2 class="paso-tit">Datos de la empresa</h2>
        ${campo("empresa.razonSocial", "Nombre o razón social", {
          ayuda: esc(tipo.regla) + " Agregamos la terminación por ti." + ejemploEirl,
          attrs: 'autocomplete="off"',
        })}
        <p class="vivo" id="vistaRazon" aria-live="polite"></p>
        ${campo("empresa.fantasia", "Nombre de fantasía", { opcional: true, ayuda: "El nombre comercial con que te conocerán." })}
        ${campo("empresa.objeto", "¿A qué se dedicará la empresa?", {
          tipo: "textarea",
          ayuda: "Describe las actividades con tus palabras. Ej.: «Asesoría contable y tributaria, y venta de cursos de capacitación». Lo redactamos en el estatuto.",
        })}
        <div class="fila fila-2">
          ${campo("empresa.region", "Región", { tipo: "select", opciones: REGIONES.map((r) => [r, r]) })}
          ${campo("empresa.comuna", "Comuna")}
        </div>
        ${campo("empresa.direccion", "Dirección de la empresa", { opcional: true, ayuda: "Si aún no la tienes, la vemos después." })}
        ${segmentado("empresa.duracion", "Duración", [["indefinida", "Indefinida"], ["plazo", "Por un plazo"]], " data-estructura")}
        ${estado.empresa.duracion === "plazo" ? campo("empresa.anios", "¿Cuántos años?", { attrs: 'inputmode="numeric"' }) : ""}`;
    },

    admin() {
      const tipo = L.TIPOS[estado.tipo];
      const n = L.administradores(estado).length;
      return `
        <h2 class="paso-tit">¿Quién administrará la empresa?</h2>
        <p class="paso-ayuda">Las personas que la representarán y tomarán las decisiones del día a día. Puede ser más de una.</p>
        <span class="err" data-err="admin"></span>
        <fieldset class="campo">
          <legend>${tipo.maxSocios === 1 ? "Titular" : "Elige entre los " + esc(tipo.socios)}</legend>
          ${estado.socios
            .map(
              (s) => `
            <label class="check"><input type="checkbox" data-admin="${s.id}"${estado.admin.ids.includes(s.id) ? " checked" : ""} />
              ${esc(L.nombreDeSocio(s) || "(sin nombre)")}${s.tipoPersona === "juridica" ? " — por medio de su representante" : ""}</label>`
            )
            .join("")}
        </fieldset>
        <h3>Otra persona que no es socia <span class="opcional">(opcional)</span></h3>
        <div class="fila fila-2">
          ${campo("admin.externoNombre", "Nombre completo")}
          ${campo("admin.externoRut", "RUT", { attrs: 'data-rut placeholder="12.345.678-5"' })}
        </div>
        <div id="formaAdmin"${n > 1 ? "" : " hidden"}>
          ${segmentado("admin.forma", "¿Cómo actuarán?", [["indistinta", "Cualquiera por separado"], ["conjunta", "Siempre juntas"]])}
        </div>`;
    },

    extras() {
      const extras = C.extras || [];
      return `
        <h2 class="paso-tit">¿Quieres que hagamos algo más?</h2>
        <p class="paso-ayuda">Opcional. Puedes agregarlo después.</p>
        ${extras.length ? extras
          .map(
            (x) => `
          <div class="extra">
            <label class="check"><input type="checkbox" data-extra="${esc(x.id)}"${estado.extras.includes(x.id) ? " checked" : ""} />
              <span><b>${esc(x.nombre)}</b> <span class="precio-extra">· ${precioHtml(x.precio)}</span><br />
              <span class="ayuda">${esc(x.detalle || "")}</span></span></label>
          </div>`
          )
          .join("") : "<p>No hay servicios adicionales configurados.</p>"}
        <div class="vivo" id="vivoPresupuesto" aria-live="polite"></div>`;
    },

    resumen() {
      const tipo = L.TIPOS[estado.tipo];
      const e = estado.empresa;
      const pct = L.participaciones(estado.socios);
      const avisos = ["socios", "empresa"].flatMap((p) => L.validarPaso(estado, p).avisos);
      const firmaWa = C.whatsapp ? "" : ' disabled title="Falta configurar el WhatsApp en config.js"';
      const firmaMail = C.correo ? "" : ' disabled title="Falta configurar el correo en config.js"';
      return `
        <h2 class="paso-tit">Revisa y envía tu solicitud</h2>
        <div class="resumen">
          <h3>Empresa <button type="button" class="enlace no-imprimir" data-ir="2">Editar</button></h3>
          <dl>
            <dt>Tipo</dt><dd>${esc(tipo.nombre)}</dd>
            <dt>Razón social</dt><dd><b>${esc(L.razonSocialCompleta(e.razonSocial, estado.tipo))}</b></dd>
            ${String(e.fantasia).trim() ? `<dt>Fantasía</dt><dd>${esc(e.fantasia)}</dd>` : ""}
            <dt>Objeto</dt><dd>${esc(e.objeto)}</dd>
            <dt>Domicilio</dt><dd>${esc([e.direccion, e.comuna, e.region].filter((x) => String(x || "").trim()).join(", "))}</dd>
            <dt>Duración</dt><dd>${e.duracion === "plazo" ? esc(L.aEntero(e.anios)) + " años" : "Indefinida"}</dd>
            <dt>Capital</dt><dd>${esc(L.formatearPesos(L.capitalTotal(estado.socios)))}</dd>
          </dl>

          <h3>${esc(tipo.maxSocios === 1 ? "Titular" : tipo.socios.charAt(0).toUpperCase() + tipo.socios.slice(1))}
            <button type="button" class="enlace no-imprimir" data-ir="1">Editar</button></h3>
          <dl>
            ${estado.socios
              .map(
                (s, i) =>
                  `<dt>${esc(L.formatearRut(s.rut))}</dt><dd>${esc(L.nombreDeSocio(s))} · ${esc(L.formatearPesos(L.aEntero(s.aporte)))} (${esc(String(pct[i]).replace(".", ","))} %)</dd>`
              )
              .join("")}
          </dl>

          <h3>Administración <button type="button" class="enlace no-imprimir" data-ir="3">Editar</button></h3>
          <p>${esc(L.administradores(estado).join("; "))}${
            L.administradores(estado).length > 1 ? " — " + (estado.admin.forma === "conjunta" ? "actuando siempre juntas" : "cualquiera por separado") : ""
          }</p>

          <h3>Cómo firmará cada uno</h3>
          <ul class="firma-lista">
            ${estado.socios.map((s) => `<li><b>${esc(L.nombreDeSocio(s))}:</b> ${esc(L.planDeFirma(s).texto)}</li>`).join("")}
          </ul>
          <p class="ayuda">Todos deben firmar dentro del plazo legal desde la primera firma: ${dato(C.plazoFirma, "[VERIFICAR: plazo de firma]")}.</p>

          <h3>Presupuesto <button type="button" class="enlace no-imprimir" data-ir="4">Editar</button></h3>
          <div id="vivoPresupuesto"></div>
        </div>

        ${avisos.length ? `<div class="avisos"><b>Datos que conviene completar</b> (no impiden enviar):<ul>${avisos.map((a) => "<li>" + esc(a) + "</li>").join("")}</ul></div>` : ""}

        <h3>Tus datos de contacto</h3>
        <div class="fila fila-2">
          ${campo("contacto.nombre", "Nombre", { attrs: 'autocomplete="name"' })}
          ${campo("contacto.correo", "Correo", { tipo: "email", attrs: 'autocomplete="email"' })}
        </div>
        ${campo("contacto.telefono", "Teléfono o WhatsApp", { tipo: "tel", opcional: true, attrs: 'autocomplete="tel"' })}
        ${campo("contacto.comentario", "¿Algo más que debamos saber?", { tipo: "textarea", opcional: true })}
        <div class="campo consentimiento">
          <label class="check"><input type="checkbox" data-key="contacto.consentimiento"${estado.contacto.consentimiento ? " checked" : ""} />
            <span>Autorizo que estos datos se usen solo para preparar y tramitar la constitución de la empresa, y declaro contar con la autorización de los demás socios para compartirlos.</span></label>
          <span class="err" data-err="contacto.consentimiento"></span>
        </div>

        <div class="acciones-envio">
          <button type="button" class="btn btn-primario" data-accion="whatsapp"${firmaWa}>Enviar por WhatsApp</button>
          <button type="button" class="btn btn-primario" data-accion="correo"${firmaMail}>Enviar por correo</button>
          <button type="button" class="btn btn-secundario" data-accion="descargar">Descargar resumen</button>
          <button type="button" class="btn btn-secundario" data-accion="imprimir">Imprimir o guardar PDF</button>
          ${!C.whatsapp || !C.correo ? '<p class="ayuda">Los botones desactivados se habilitan al configurar el WhatsApp o el correo en config.js.</p>' : ""}
        </div>`;
    },
  };

  // Partes de la página que cambian mientras se escribe, sin redibujar el
  // paso completo (para no perder el foco del campo).
  function actualizarVivos() {
    const vivoCapital = $("#vivoCapital");
    if (vivoCapital) {
      const total = L.capitalTotal(estado.socios);
      const pct = L.participaciones(estado.socios);
      vivoCapital.innerHTML =
        `Capital total: <b>${esc(L.formatearPesos(total))}</b>` +
        (estado.socios.length > 1 && total
          ? `<table class="tabla-capital">${estado.socios
              .map((s, i) => `<tr><td>${esc(L.nombreDeSocio(s) || "Sin nombre")}</td><td>${esc(String(pct[i]).replace(".", ","))} %</td></tr>`)
              .join("")}</table>`
          : "");
    }
    const vista = $("#vistaRazon");
    if (vista) {
      const r = L.razonSocialCompleta(estado.empresa.razonSocial, estado.tipo);
      vista.innerHTML = r ? `Así quedará: <b>${esc(r)}</b>` : "Escribe el nombre para ver cómo quedará.";
    }
    const forma = $("#formaAdmin");
    if (forma) forma.hidden = L.administradores(estado).length < 2;
    const vivoP = $("#vivoPresupuesto");
    if (vivoP) {
      const p = L.presupuesto(estado, C);
      vivoP.innerHTML = `<table class="presupuesto">${p.lineas
        .map((l) => `<tr><td>${esc(l.concepto)}</td><td>${precioHtml(l.precio)}</td></tr>`)
        .join("")}<tr class="total"><td>Total</td><td>${
        p.total == null ? '<span class="falta">[FALTA: precio]</span>' : esc(L.formatearPesos(p.total))
      }</td></tr></table>`;
    }
  }

  // --------------------------------------------------------- Errores ---

  function limpiarErrores() {
    const caja = $("#errores");
    caja.hidden = true;
    caja.innerHTML = "";
    $$("[data-err]").forEach((el) => (el.textContent = ""));
    $$('[aria-invalid="true"]').forEach((el) => el.removeAttribute("aria-invalid"));
  }

  function limpiarError(key) {
    const err = $('[data-err="' + key + '"]');
    if (err) err.textContent = "";
    $$('[data-key="' + key + '"]').forEach((el) => el.removeAttribute("aria-invalid"));
  }

  function mostrarErrores(errores) {
    limpiarErrores();
    const caja = $("#errores");
    caja.innerHTML = `<b>Revisa ${errores.length === 1 ? "este dato" : "estos " + errores.length + " datos"}:</b><ul>${errores
      .map((e) => "<li>" + esc(e.msg) + "</li>")
      .join("")}</ul>`;
    caja.hidden = false;
    let primero = null;
    errores.forEach((e) => {
      const err = $('[data-err="' + e.campo + '"]');
      if (err) err.textContent = e.msg;
      $$('[data-key="' + e.campo + '"]').forEach((el) => {
        el.setAttribute("aria-invalid", "true");
        if (!primero) primero = el;
      });
    });
    (primero || caja).focus();
  }

  // ------------------------------------------------------- Navegación ---

  function prepararPaso() {
    if (!estado.tipo) estado.paso = 0;
    const id = L.PASOS[estado.paso].id;
    // Si el tipo no admite personas jurídicas (E.I.R.L.), no queda ninguna
    // marcada como tal: el formulario no mostraría cómo corregirlo.
    if (estado.tipo && !L.TIPOS[estado.tipo].admiteJuridicas) {
      estado.socios.forEach((s) => (s.tipoPersona = "natural"));
    }
    // En una E.I.R.L. el titular administra salvo que se indique otra cosa.
    if (id === "admin" && !estado.admin.ids.length && !estado.admin.externoNombre && estado.socios[0]) {
      estado.admin.ids = [estado.socios[0].id];
    }
    if (id === "resumen") {
      const s = estado.socios[0] || {};
      const c = estado.contacto;
      if (!c.nombre && s.tipoPersona !== "juridica") c.nombre = L.nombreDeSocio(s);
      if (!c.correo) c.correo = s.correo || "";
      if (!c.telefono) c.telefono = s.telefono || "";
    }
  }

  function irAPaso(i) {
    estado.paso = Math.min(Math.max(0, i), L.PASOS.length - 1);
    prepararPaso();
    guardar();
    renderAsistente();
    window.scrollTo(0, 0);
    const t = $(".paso-tit");
    if (t) {
      t.setAttribute("tabindex", "-1");
      t.focus();
    }
  }

  function siguiente() {
    const r = L.validarPaso(estado, L.PASOS[estado.paso].id);
    if (r.errores.length) return mostrarErrores(r.errores);
    irAPaso(estado.paso + 1);
  }

  // Valida todo antes de enviar; si falla un paso anterior, lleva a él.
  function listoParaEnviar() {
    const i = L.primerPasoInvalido(estado);
    if (i === -1) return true;
    if (i !== estado.paso) irAPaso(i);
    mostrarErrores(L.validarPaso(estado, L.PASOS[i].id).errores);
    return false;
  }

  function route() {
    const h = location.hash.slice(1);
    const vista = h === "constituir" || h === "enviado" ? h : "inicio";
    $$(".vista").forEach((v) => (v.hidden = v.id !== "v-" + vista));
    if (vista === "constituir") {
      prepararPaso();
      renderAsistente();
      window.scrollTo(0, 0);
    } else if (vista === "enviado") {
      if (L.primerPasoInvalido(estado) !== -1) {
        location.hash = "#constituir";
        return;
      }
      renderEnviado();
      window.scrollTo(0, 0);
    } else {
      renderInicio();
      const destino = h && document.getElementById(h);
      if (destino) destino.scrollIntoView();
      else window.scrollTo(0, 0);
    }
  }

  // ------------------------------------------------------------- Envío ---

  function textoSolicitud() {
    return L.textoSolicitud(estado, C);
  }

  function descargar() {
    const blob = new Blob([textoSolicitud()], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "solicitud-constitucion.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function copiar(boton) {
    const texto = textoSolicitud();
    const ok = () => {
      boton.textContent = "¡Copiado!";
      setTimeout(() => (boton.textContent = "Copiar texto"), 2000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(ok, () => window.prompt("Copia el texto:", texto));
    } else {
      window.prompt("Copia el texto:", texto);
    }
  }

  function enviar(medio) {
    if (!listoParaEnviar()) return;
    const texto = textoSolicitud();
    if (medio === "whatsapp" && C.whatsapp) {
      window.open("https://wa.me/" + encodeURIComponent(C.whatsapp) + "?text=" + encodeURIComponent(texto), "_blank", "noopener");
    } else if (medio === "correo" && C.correo) {
      const asunto = "Solicitud de constitución – " + L.razonSocialCompleta(estado.empresa.razonSocial, estado.tipo);
      location.href = "mailto:" + C.correo + "?subject=" + encodeURIComponent(asunto) + "&body=" + encodeURIComponent(texto);
    } else {
      return;
    }
    estado.enviada = new Date().toISOString();
    guardar();
    location.hash = "#enviado";
  }

  function renderEnviado() {
    $("#accionesFinal").innerHTML = `
      <button type="button" class="btn btn-secundario" data-accion="descargar">Descargar resumen</button>
      <button type="button" class="btn btn-secundario" data-accion="copiar">Copiar texto</button>
      <button type="button" class="btn btn-secundario" data-accion="imprimir">Imprimir o guardar PDF</button>
      <pre class="texto-solicitud">${esc(textoSolicitud())}</pre>`;
  }

  // ----------------------------------------------------------- Eventos ---

  const form = $("#formulario");

  function onCambio(ev) {
    const el = ev.target;
    if (el.dataset.admin) {
      const ids = new Set(estado.admin.ids);
      if (el.checked) ids.add(el.dataset.admin);
      else ids.delete(el.dataset.admin);
      estado.admin.ids = estado.socios.map((s) => s.id).filter((id) => ids.has(id));
      guardar();
      limpiarError("admin");
      actualizarVivos();
      return;
    }
    if (el.dataset.extra) {
      const ids = new Set(estado.extras);
      if (el.checked) ids.add(el.dataset.extra);
      else ids.delete(el.dataset.extra);
      estado.extras = (C.extras || []).map((x) => x.id).filter((id) => ids.has(id));
      guardar();
      actualizarVivos();
      return;
    }
    const key = el.dataset.key;
    if (!key) return;
    if (el.type === "radio" && !el.checked) return;
    setValor(key, el.type === "checkbox" ? el.checked : el.value);
    guardar();
    limpiarError(key);
    if (el.hasAttribute("data-estructura") && ev.type === "change") return renderAsistente(key);
    actualizarVivos();
  }

  form.addEventListener("input", onCambio);
  form.addEventListener("change", onCambio);
  form.addEventListener("submit", (ev) => ev.preventDefault());

  // Al salir de un campo de RUT o de pesos, se muestra con formato.
  form.addEventListener("focusout", (ev) => {
    const el = ev.target;
    if (!el.dataset || !el.dataset.key) return;
    if (el.hasAttribute("data-rut") && L.limpiarRut(el.value).length >= 2) {
      el.value = L.formatearRut(el.value);
    } else if (el.hasAttribute("data-pesos") && L.aEntero(el.value)) {
      el.value = L.formatearPesos(L.aEntero(el.value)).slice(1);
    } else {
      return;
    }
    setValor(el.dataset.key, el.value);
    guardar();
  });

  document.addEventListener("click", (ev) => {
    const el = ev.target.closest("[data-elegir], [data-accion], [data-ir]");
    if (!el) return;
    if (el.dataset.elegir) return elegirTipo(el.dataset.elegir);
    if (el.dataset.ir) return irAPaso(Number(el.dataset.ir));
    switch (el.dataset.accion) {
      case "agregar": {
        const s = L.socioVacio(nuevoId());
        estado.socios.push(s);
        guardar();
        renderAsistente("socio:" + s.id + ":nombres");
        break;
      }
      case "quitar":
        if (estado.socios.length > 1 && window.confirm("¿Quitar a esta persona del formulario?")) {
          estado.socios = estado.socios.filter((s) => s.id !== el.dataset.id);
          estado.admin.ids = estado.admin.ids.filter((id) => id !== el.dataset.id);
          guardar();
          renderAsistente();
        }
        break;
      case "whatsapp":
      case "correo":
        enviar(el.dataset.accion);
        break;
      case "descargar":
        if (location.hash === "#enviado" || listoParaEnviar()) descargar();
        break;
      case "copiar":
        copiar(el);
        break;
      case "imprimir":
        document.body.classList.add("solo-resumen");
        window.print();
        break;
    }
  });

  $("#btnSiguiente").addEventListener("click", siguiente);
  $("#btnAtras").addEventListener("click", () => irAPaso(estado.paso - 1));
  $("#btnBorrar").addEventListener("click", () => {
    if (!window.confirm("Se borrarán todos los datos ingresados en este navegador. ¿Continuar?")) return;
    try { localStorage.removeItem(CLAVE); } catch (_) { /* idem */ }
    estado = L.estadoInicial();
    renderAsistente();
  });

  $("#oCantidad").addEventListener("input", orientar);
  $("#oJuridica").addEventListener("change", orientar);
  window.addEventListener("hashchange", route);
  window.addEventListener("afterprint", () => document.body.classList.remove("solo-resumen"));

  aplicarConfig();
  route();
})();
