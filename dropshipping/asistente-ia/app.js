// Asistente IA Dropshipping: perfil de la tienda, ruta de plantillas y
// diálogo de resultado (copiar / descargar). El perfil se guarda en localStorage.
(function () {
  "use strict";

  const PERFIL_KEY = "asistente_ia_perfil_v1";
  const FILTRO_KEY = "asistente_ia_filtro";
  const RADAR_KEY = "radar_dropshipping_v1";
  const TEXTOS = ["tienda", "nicho", "producto", "publico", "pais", "moneda", "precioVenta", "costoProducto", "costoEnvio", "presupuesto"];
  const NUMEROS = ["precioVenta", "costoProducto", "costoEnvio", "presupuesto"];

  // Datos inventados para aprender sin riesgo.
  const EJEMPLO = {
    tienda: "Casa Zen", nicho: "orden para cocinas pequeñas", producto: "especiero giratorio",
    publico: "personas de 25 a 45 años que viven en departamento", pais: "Chile", moneda: "CLP",
    ia: "Claude", plataforma: "Shopify", proveedor: "AliExpress", tono: "Cercano", experiencia: "Principiante",
    canales: ["TikTok", "Instagram"], precioVenta: 14990, costoProducto: 4200, costoEnvio: 2500, presupuesto: 150000,
  };

  const $ = (id) => document.getElementById(id);
  const form = $("formPerfil");
  let perfil = cargar();
  let filtro = "todo";
  let actual = null;
  let radar = [];

  // ---- Almacenamiento -------------------------------------------------------

  function cargar() {
    try { return JSON.parse(localStorage.getItem(PERFIL_KEY)) || {}; } catch (e) { return {}; }
  }

  function guardar() {
    try { localStorage.setItem(PERFIL_KEY, JSON.stringify(perfil)); } catch (e) { /* sin almacenamiento */ }
  }

  // Acepta "14.990", "14990", "4,5" y "1.234.567".
  function leerNumero(texto) {
    const s = String(texto).replace(/\s/g, "").replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : "";
  }

  // ---- Formulario <-> perfil --------------------------------------------------

  function perfilDesdeForm() {
    const p = {};
    for (const n of TEXTOS) {
      const v = form.elements[n].value.trim();
      p[n] = NUMEROS.includes(n) ? (v === "" ? "" : leerNumero(v)) : v;
    }
    form.querySelectorAll(".chips").forEach((grupo) => {
      const marcados = [...grupo.querySelectorAll('button[aria-pressed="true"]')].map((b) => b.dataset.valor);
      p[grupo.dataset.grupo] = grupo.dataset.tipo === "multi" ? marcados : (marcados[0] || "");
    });
    return p;
  }

  function formDesdePerfil(p) {
    for (const n of TEXTOS) form.elements[n].value = p[n] == null ? "" : p[n];
    form.querySelectorAll(".chips").forEach((grupo) => {
      const v = p[grupo.dataset.grupo];
      const valores = Array.isArray(v) ? v : [v == null ? "" : v];
      grupo.querySelectorAll("button").forEach((b) => {
        const pulsado = valores.includes(b.dataset.valor) && !(b.dataset.valor === "" && v === undefined);
        b.setAttribute("aria-pressed", String(pulsado));
      });
    });
    actualizarGanancia();
  }

  function hayDatos(p) {
    return Object.values(p).some((v) => (Array.isArray(v) ? v.length : v !== "" && v != null));
  }

  function mostrarResumen(mostrar) {
    $("resumenPerfil").classList.toggle("oculto", !mostrar);
    form.classList.toggle("oculto", mostrar);
    const partes = [perfil.tienda, perfil.nicho, perfil.pais, perfil.plataforma, perfil.ia].filter(Boolean);
    $("resumenTexto").textContent = partes.length ? "✅ " + partes.join(" · ") : "Sin datos: la IA te los preguntará.";
  }

  function actualizarGanancia() {
    const p = perfilDesdeForm();
    const caja = $("ganancia");
    if (!(p.precioVenta > 0) || p.costoProducto === "") { caja.classList.add("oculto"); return; }
    const ganancia = p.precioVenta - p.costoProducto - (Number(p.costoEnvio) || 0);
    const margen = Math.round((ganancia / p.precioVenta) * 100);
    const moneda = p.moneda ? " " + p.moneda : "";
    const fmt = (n) => Math.round(n).toLocaleString("es-CL") + moneda;
    caja.classList.remove("oculto");
    caja.classList.toggle("mala", ganancia <= 0);
    caja.textContent = ganancia > 0
      ? `Ganarías ${fmt(ganancia)} por venta antes de publicidad y comisión de pago (margen ${margen} %). Para no perder, cada ${fmt(ganancia)} en anuncios debe traer al menos una venta.`
      : `Con estos números pierdes ${fmt(-ganancia)} por venta, incluso sin publicidad. Revisa el precio o el costo.`;
  }

  function cargarRadar() {
    try { radar = JSON.parse(localStorage.getItem(RADAR_KEY)) || []; } catch (e) { radar = []; }
    radar = radar.filter((r) => r && r.producto);
    if (!radar.length) return;
    const sel = $("selRadar");
    radar.forEach((r, i) => {
      const o = document.createElement("option");
      o.value = String(i);
      o.textContent = r.producto;
      sel.appendChild(o);
    });
    $("bloqueRadar").classList.remove("oculto");
  }

  // ---- Ruta de plantillas -------------------------------------------------------

  function renderRuta() {
    const cont = $("ruta");
    cont.textContent = "";
    for (const etapa of Plantillas.ETAPAS) {
      const items = Plantillas.PLANTILLAS.filter((t) => t.etapa === etapa.n && (filtro === "todo" || t.tipo === filtro));
      if (!items.length) continue;
      const h = document.createElement("h3");
      h.className = "etapa-titulo";
      h.innerHTML = `<span aria-hidden="true">${etapa.icono}</span> `;
      h.appendChild(document.createTextNode(etapa.titulo + " "));
      const paso = document.createElement("span");
      paso.className = "paso";
      paso.textContent = `Etapa ${etapa.n}`;
      h.appendChild(paso);
      const grid = document.createElement("div");
      grid.className = "items";
      for (const t of items) {
        const tipo = Plantillas.TIPOS[t.tipo];
        const b = document.createElement("button");
        b.type = "button";
        b.className = `item ${t.tipo}`;
        b.dataset.id = t.id;
        const ins = document.createElement("span");
        ins.className = `insignia ${t.tipo}`;
        ins.textContent = `${tipo.icono} ${tipo.nombre}`;
        const tit = document.createElement("b");
        tit.textContent = t.titulo;
        const res = document.createElement("span");
        res.className = "resumen";
        res.textContent = t.resumen;
        b.append(ins, tit, res);
        grid.appendChild(b);
      }
      cont.append(h, grid);
    }
  }

  function elegirFiltro(tipo) {
    filtro = ["prompt", "skill", "loop"].includes(tipo) ? tipo : "todo";
    document.querySelectorAll(".filtro").forEach((b) => {
      const activo = b.dataset.tipo === filtro;
      b.classList.toggle("activo", activo);
      b.setAttribute("aria-pressed", String(activo));
    });
    try { localStorage.setItem(FILTRO_KEY, filtro); } catch (e) { /* sin almacenamiento */ }
    renderRuta();
  }

  // ---- Resultado ------------------------------------------------------------------

  function sincronizarPerfil() {
    if (!form.classList.contains("oculto")) {
      perfil = perfilDesdeForm();
      guardar();
    }
  }

  function abrir(id) {
    sincronizarPerfil();
    const plantilla = Plantillas.buscar(id);
    if (!plantilla) return;
    actual = { plantilla, opciones: { maxCiclos: plantilla.maxCiclos, intervalo: plantilla.intervalo }, varianteId: null, ediciones: {} };
    const tipo = Plantillas.TIPOS[plantilla.tipo];
    $("resTipo").className = `insignia ${plantilla.tipo}`;
    $("resTipo").textContent = `${tipo.icono} ${tipo.nombre}`;
    $("resTitulo").textContent = plantilla.titulo;
    $("resResumen").textContent = `${plantilla.resumen} ${tipo.explica}`;
    $("optCiclos").value = plantilla.maxCiclos || "";
    $("optIntervalo").value = plantilla.intervalo || "1d";
    $("resVariantes").dataset.plantilla = ""; // el orden de las pestañas depende de la IA elegida
    renderResultado();
    abrirDialogo($("dlgResultado"));
    $("resTexto").scrollTop = 0;
  }

  function varianteActual() {
    return actual.g.variantes.find((v) => v.id === actual.varianteId) || actual.g.variantes[0];
  }

  function renderResultado() {
    actual.g = Plantillas.generar(actual.plantilla, perfil, actual.opciones);
    const v = varianteActual();
    actual.varianteId = v.id;

    // Las pestañas se crean una vez por plantilla: si se redibujaran aquí, un
    // clic que llega justo después del "change" de otro campo se perdería.
    const tabs = $("resVariantes");
    if (tabs.dataset.plantilla !== actual.plantilla.id) {
      tabs.textContent = "";
      tabs.dataset.plantilla = actual.plantilla.id;
      for (const x of actual.g.variantes) {
        const b = document.createElement("button");
        b.type = "button";
        b.setAttribute("role", "tab");
        b.dataset.variante = x.id;
        b.textContent = x.etiqueta;
        tabs.appendChild(b);
      }
    }
    tabs.classList.toggle("oculto", actual.g.variantes.length < 2);
    tabs.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.variante === v.id)));

    const esLoop = actual.plantilla.tipo === "loop";
    $("resOpciones").classList.toggle("oculto", !esLoop);
    $("optCiclos").parentElement.classList.toggle("oculto", v.id === "code");
    $("lblIntervalo").classList.toggle("oculto", v.id !== "code");

    const pasos = $("resPasos");
    pasos.textContent = "";
    for (const t of v.pasos) {
      const li = document.createElement("li");
      li.textContent = t;
      pasos.appendChild(li);
    }

    const texto = actual.ediciones[v.id] != null ? actual.ediciones[v.id] : v.texto;
    $("resTexto").value = texto;
    $("btnDescargar").textContent = v.zip ? "⬇ Descargar ZIP" : "⬇ Descargar archivo";
    actualizarAviso(texto);
  }

  function actualizarAviso(texto) {
    const faltan = (texto.match(/\[COMPLETAR:/g) || []).length;
    const partes = [];
    if (faltan) partes.push(`Faltan ${faltan} dato${faltan === 1 ? "" : "s"} [COMPLETAR]: la IA te ${faltan === 1 ? "lo preguntará" : "los preguntará"}. Si prefieres, complétalos en el paso 1.`);
    partes.push("Revisa todo lo que la IA marque [VERIFICAR] antes de publicar, gastar dinero o usarlo con clientes.");
    $("resAviso").textContent = "⚠️ " + partes.join(" ");
  }

  // Si el usuario editó el nombre en el SKILL.md, la carpeta del ZIP debe coincidir.
  function nombreDesdeSkill(texto, porDefecto) {
    const m = /^---\s*\n[\s\S]*?^name:\s*["']?([^"'\n]+?)["']?\s*$/m.exec(texto);
    const nombre = m && m[1].trim();
    return nombre && /^[a-z0-9-]{1,64}$/.test(nombre) ? nombre : porDefecto;
  }

  function descargar(nombre, contenido, tipo) {
    const blob = new Blob([contenido], { type: tipo });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copiar(texto) {
    try {
      await navigator.clipboard.writeText(texto);
    } catch (e) {
      const t = $("resTexto");
      t.focus();
      t.select();
      document.execCommand("copy");
    }
    aviso("📋 Copiado. Pégalo en tu IA.");
  }

  // ---- Diálogos y avisos ----------------------------------------------------------

  function abrirDialogo(d) {
    if (typeof d.showModal === "function") d.showModal();
    else d.setAttribute("open", "");
  }

  function cerrarDialogo(d) {
    if (typeof d.close === "function") d.close();
    else d.removeAttribute("open");
  }

  let temporizador = null;
  function aviso(texto) {
    const t = $("toast");
    t.textContent = texto;
    t.classList.add("visible");
    clearTimeout(temporizador);
    temporizador = setTimeout(() => t.classList.remove("visible"), 2400);
  }

  // ---- Eventos ------------------------------------------------------------------------

  form.addEventListener("click", (e) => {
    const b = e.target.closest(".chips button");
    if (!b) return;
    const grupo = b.parentElement;
    if (grupo.dataset.tipo === "multi") {
      b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"));
    } else {
      grupo.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    }
  });

  let monedaAuto = "";
  form.elements.pais.addEventListener("input", () => {
    const sugerida = Motor.monedaDe(form.elements.pais.value);
    const actualMoneda = form.elements.moneda.value.trim();
    if (sugerida && (!actualMoneda || actualMoneda === monedaAuto)) {
      form.elements.moneda.value = sugerida;
      monedaAuto = sugerida;
      actualizarGanancia();
    }
  });

  NUMEROS.concat("moneda").forEach((n) => form.elements[n].addEventListener("input", actualizarGanancia));

  $("selRadar").addEventListener("change", (e) => {
    const r = radar[Number(e.target.value)];
    if (!r || e.target.value === "") return;
    form.elements.producto.value = r.producto;
    for (const n of ["precioVenta", "costoProducto", "costoEnvio"]) if (r[n] !== "" && r[n] != null) form.elements[n].value = r[n];
    actualizarGanancia();
    aviso("✅ Producto traído desde el Radar");
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    perfil = perfilDesdeForm();
    guardar();
    mostrarResumen(true);
    $("pasoCrear").scrollIntoView({ behavior: "smooth", block: "start" });
    aviso("✅ Guardado. Ahora elige qué crear.");
  });

  $("btnEjemplo").addEventListener("click", () => {
    formDesdePerfil(EJEMPLO);
    $("masDetalles").open = true;
    aviso("🎓 Ejemplo con datos inventados: cámbialos por los tuyos");
  });

  $("btnEditarPerfil").addEventListener("click", () => {
    formDesdePerfil(perfil);
    mostrarResumen(false);
    form.elements.tienda.focus();
  });

  $("filtros").addEventListener("click", (e) => {
    const b = e.target.closest(".filtro");
    if (b) elegirFiltro(b.dataset.tipo);
  });

  $("ruta").addEventListener("click", (e) => {
    const b = e.target.closest(".item");
    if (b) abrir(b.dataset.id);
  });

  $("resVariantes").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-variante]");
    if (!b) return;
    actual.varianteId = b.dataset.variante;
    renderResultado();
  });

  $("optCiclos").addEventListener("change", (e) => {
    actual.opciones.maxCiclos = Math.min(60, Math.max(1, Math.round(Number(e.target.value)) || actual.plantilla.maxCiclos));
    e.target.value = actual.opciones.maxCiclos;
    delete actual.ediciones.chat;
    renderResultado();
  });

  $("optIntervalo").addEventListener("change", (e) => {
    actual.opciones.intervalo = e.target.value;
    delete actual.ediciones.code;
    renderResultado();
  });

  $("resTexto").addEventListener("input", (e) => {
    actual.ediciones[actual.varianteId] = e.target.value;
    actualizarAviso(e.target.value);
  });

  $("btnCopiar").addEventListener("click", () => copiar($("resTexto").value));

  $("btnDescargar").addEventListener("click", () => {
    const v = varianteActual();
    const texto = $("resTexto").value;
    if (v.zip) {
      const nombre = nombreDesdeSkill(texto, actual.g.skill.nombre);
      descargar(`${nombre}.zip`, Motor.crearZip([{ ruta: `${nombre}/SKILL.md`, contenido: texto }]), "application/zip");
    } else {
      descargar(v.archivo, texto, v.archivo.endsWith(".md") ? "text/markdown;charset=utf-8" : "text/plain;charset=utf-8");
    }
    aviso("⬇ Descargado");
  });

  $("btnKit").addEventListener("click", () => {
    sincronizarPerfil();
    const kit = Plantillas.armarKit(perfil);
    descargar(kit.nombre, Motor.crearZip(kit.archivos), "application/zip");
    aviso("📦 Kit descargado. Abre LEEME.md primero.");
  });

  $("btnAyuda").addEventListener("click", () => abrirDialogo($("dlgAyuda")));

  document.querySelectorAll("dialog").forEach((d) => {
    d.addEventListener("click", (e) => {
      if (e.target === d || e.target.closest("[data-cerrar]")) cerrarDialogo(d);
    });
  });

  // ---- Inicio -------------------------------------------------------------------------

  try { filtro = localStorage.getItem(FILTRO_KEY) || "todo"; } catch (e) { filtro = "todo"; }
  cargarRadar();
  formDesdePerfil(perfil);
  mostrarResumen(hayDatos(perfil));
  elegirFiltro(filtro);
})();
