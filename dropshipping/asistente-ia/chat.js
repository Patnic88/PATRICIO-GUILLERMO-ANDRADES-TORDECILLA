// Ejecutar prompts, skills y loops con Claude dentro de la página: conexión
// (clave, modelo, presupuesto), conversación en streaming con costo estimado
// por respuesta y conversaciones guardadas en el navegador.
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const App = window.AppAsistente;
  const C = window.ClaudeAPI;
  const KEY_CONV = "asistente_ia_conversaciones_v1";
  const MAX_CONV = 30;
  const LARGO_PLEGADO = 700;

  let cliente = null;
  let clienteClave = "";
  let conv = null;
  let enCurso = null;
  let despuesDeConectar = null;

  function obtenerCliente() {
    const k = C.clave();
    if (!k) return null;
    if (!cliente || clienteClave !== k) { cliente = C.crearCliente(k); clienteClave = k; }
    return cliente;
  }

  function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }

  function nombreModelo(id) {
    const m = C.MODELOS.find((x) => x.id === id);
    return m ? m.corto : id || "—";
  }

  function hoyLargo() {
    return new Date().toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" });
  }

  // ---- Conversaciones guardadas -------------------------------------------------

  function leerConversaciones() {
    try { return JSON.parse(localStorage.getItem(KEY_CONV)) || []; } catch (e) { return []; }
  }

  function guardarConversacion(c) {
    const lista = leerConversaciones().filter((x) => x.id !== c.id);
    lista.unshift(c);
    try { localStorage.setItem(KEY_CONV, JSON.stringify(lista.slice(0, MAX_CONV))); }
    catch (e) { App.aviso("⚠️ No quedó espacio para guardar la conversación: usa «Guardar .md»."); }
    renderLista();
  }

  function borrarConversacion(id) {
    try { localStorage.setItem(KEY_CONV, JSON.stringify(leerConversaciones().filter((x) => x.id !== id))); } catch (e) { /* nada */ }
    renderLista();
  }

  function renderLista() {
    const ul = $("listaConv");
    ul.textContent = "";
    const lista = leerConversaciones();
    if (!lista.length) {
      ul.appendChild(el("li", "nota", "Aún no hay conversaciones. Abre cualquier resultado y pulsa «▶ Ejecutar con Claude»."));
      return;
    }
    for (const c of lista) {
      const li = el("li", "conv");
      const info = el("div");
      info.appendChild(el("b", null, c.titulo));
      const fecha = c.actualizada ? new Date(c.actualizada).toLocaleDateString("es-CL") : "sin enviar";
      const turnos = c.mensajes.filter((m) => m.role === "user").length;
      info.appendChild(el("small", null, `${nombreModelo(c.modelo)} · ${fecha} · ${turnos} mensaje${turnos === 1 ? "" : "s"} · ${C.usd(c.costo)}`));
      const abrir = el("button", "btn-link", "Abrir");
      abrir.type = "button";
      abrir.addEventListener("click", () => abrirChat(c));
      const borrar = el("button", "btn-link peligro", "Borrar");
      borrar.type = "button";
      borrar.addEventListener("click", () => { if (confirm(`¿Borrar la conversación «${c.titulo}»?`)) borrarConversacion(c.id); });
      li.append(info, abrir, borrar);
      ul.appendChild(li);
    }
  }

  // ---- Estado de conexión y presupuesto -------------------------------------------

  function renderEstado() {
    const a = C.ajustes();
    const conectado = Boolean(C.clave());
    const pct = a.presupuesto > 0 ? Math.min(100, (a.gastado / a.presupuesto) * 100) : 0;
    const estado = C.estadoPresupuesto(a);
    const cont = $("estadoClaude");
    cont.textContent = "";
    const linea = el("p");
    linea.appendChild(el("span", "chip " + (conectado ? "ok" : "no"), conectado ? "● Conectado" : "○ Sin conectar"));
    linea.appendChild(document.createTextNode(` · Modelo por defecto: ${nombreModelo(a.modelo)}`));
    const barra = el("div", "barra " + estado);
    barra.setAttribute("role", "meter");
    barra.setAttribute("aria-label", "Presupuesto usado");
    barra.setAttribute("aria-valuemin", "0");
    barra.setAttribute("aria-valuemax", "100");
    barra.setAttribute("aria-valuenow", String(Math.round(pct)));
    const relleno = el("div");
    relleno.style.width = pct + "%";
    barra.appendChild(relleno);
    const gasto = el("p", "nota", `Gastado (estimado): ${C.usd(a.gastado)} de USD ${a.presupuesto} · Quedan ≈ ${C.usd(Math.floor(Math.max(0, a.presupuesto - a.gastado) * 100) / 100)}`);
    cont.append(linea, barra, gasto);
  }

  // ---- Ajustes ---------------------------------------------------------------------

  function renderOpcionesModelo(seleccion) {
    const cont = $("opcionesModelo");
    cont.textContent = "";
    for (const m of C.MODELOS) {
      const t = C.PRECIOS[m.id][0];
      const lab = el("label", "opcion-modelo");
      const radio = el("input");
      radio.type = "radio";
      radio.name = "modeloDefecto";
      radio.value = m.id;
      radio.checked = m.id === seleccion;
      const txt = el("span");
      txt.appendChild(el("b", null, m.nombre));
      txt.appendChild(el("small", null, m.explica));
      const f = (n) => (n < 1 ? n.toFixed(2) : String(n)).replace(".", ",");
      txt.appendChild(el("small", "precio", `USD ${f(t.entrada)} entrada / USD ${f(t.salida)} salida por millón de tokens`));
      lab.append(radio, txt);
      cont.appendChild(lab);
    }
  }

  function abrirAjustes(mensaje) {
    const a = C.ajustes();
    $("inpClave").value = "";
    $("inpClave").placeholder = C.clave() ? "Clave conectada (déjalo vacío para mantenerla)" : "sk-ant-…";
    $("chkRecordar").checked = Boolean(a.recordar);
    renderOpcionesModelo(a.modelo);
    $("inpPresupuesto").value = a.presupuesto;
    $("txtGastado").textContent = C.usd(a.gastado);
    $("msgClaude").textContent = mensaje || "";
    App.abrirDialogo($("dlgClaude"));
    $("inpClave").focus();
  }

  async function guardarAjustesClaude(e) {
    e.preventDefault();
    const msg = $("msgClaude");
    const nueva = $("inpClave").value.trim();
    const clave = nueva || C.clave();
    const modelo = (document.querySelector('input[name="modeloDefecto"]:checked') || {}).value || "claude-haiku-5-5";
    const presupuesto = Math.max(1, Number($("inpPresupuesto").value) || 100);
    C.guardarAjustes({ modelo, presupuesto });
    renderEstado();
    if (!clave) { msg.textContent = "Pega tu clave de API para conectar."; return; }
    if (!C.formatoClaveValido(clave)) { msg.textContent = "Eso no parece una clave de API de Claude (empiezan con «sk-ant-»)."; return; }
    msg.textContent = "Probando la conexión…";
    try {
      const info = await C.probarConexion(clave, modelo);
      C.guardarClave(clave, $("chkRecordar").checked);
      cliente = null;
      renderEstado();
      msg.textContent = `✅ Conectado. Modelo disponible: ${(info && info.display_name) || nombreModelo(modelo)}.`;
      if (despuesDeConectar) {
        const accion = despuesDeConectar;
        despuesDeConectar = null;
        App.cerrarDialogo($("dlgClaude"));
        accion();
      }
    } catch (err) {
      msg.textContent = "⚠️ " + C.explicarError(err).texto;
    }
  }

  // ---- Conversación ------------------------------------------------------------------

  function nuevaConversacion(ctx) {
    const esSkill = ctx.plantilla.tipo === "skill";
    let instrucciones = "";
    if (esSkill) {
      instrucciones = ctx.variante.id === "claude" ? ctx.texto.replace(/^---[\s\S]*?---\s*/, "") : ctx.texto;
    }
    return {
      id: "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      titulo: ctx.plantilla.titulo,
      plantillaId: ctx.plantilla.id,
      tipo: ctx.plantilla.tipo,
      modelo: null,
      esfuerzo: null,
      busqueda: false,
      sistema: "",
      instrucciones,
      pais: (ctx.perfil && ctx.perfil.pais) || "",
      mensajes: [],
      notas: {},
      costo: 0,
      creada: new Date().toISOString(),
      actualizada: null,
      borrador: esSkill ? ctx.plantilla.ejemplo || "" : ctx.texto,
    };
  }

  function abrirDesdeResultado() {
    const ctx = App.contextoActual();
    if (!ctx) return;
    const c = nuevaConversacion(ctx);
    App.cerrarResultado();
    if (!C.clave()) {
      despuesDeConectar = () => abrirChat(c);
      abrirAjustes("Conecta tu clave de Claude para ejecutar este resultado aquí.");
      return;
    }
    abrirChat(c);
  }

  function bloquearConfig(bloquear) {
    ["chatModelo", "chatEsfuerzo", "chatBusqueda"].forEach((id) => { $(id).disabled = bloquear; });
    $("chatNota").textContent = bloquear ? "El modelo y las opciones quedan fijos en esta conversación. Para cambiarlos, ejecuta el resultado de nuevo." : "";
  }

  function nota(texto) { $("chatNota").textContent = texto; }

  function abrirChat(c) {
    conv = c;
    const tipo = window.Plantillas.TIPOS[c.tipo] || { icono: "💬", nombre: "Prompt" };
    $("chatTipo").className = `insignia ${c.tipo}`;
    $("chatTipo").textContent = `${tipo.icono} ${tipo.nombre}`;
    $("chatTitulo").textContent = c.titulo;
    const a = C.ajustes();
    $("chatModelo").textContent = "";
    for (const m of C.MODELOS) {
      const o = el("option", null, m.nombre);
      o.value = m.id;
      $("chatModelo").appendChild(o);
    }
    $("chatModelo").value = c.modelo || a.modelo;
    $("chatEsfuerzo").textContent = "";
    for (const x of C.ESFUERZOS) {
      const o = el("option", null, x.nombre);
      o.value = x.id;
      $("chatEsfuerzo").appendChild(o);
    }
    $("chatEsfuerzo").value = c.esfuerzo || a.esfuerzo || "medium";
    $("chatBusqueda").checked = Boolean(c.busqueda);
    bloquearConfig(c.mensajes.length > 0);
    $("chatTexto").value = c.borrador || "";
    $("chatContinuar").classList.toggle("oculto", c.tipo !== "loop" || !c.mensajes.length);
    renderChat();
    renderCostosChat();
    App.abrirDialogo($("dlgChat"));
    bajar(true);
  }

  function bajar(forzar) {
    const m = $("chatMensajes");
    if (forzar || m.scrollHeight - m.scrollTop - m.clientHeight < 120) m.scrollTop = m.scrollHeight;
  }

  function textoDeContenido(content) {
    if (typeof content === "string") return content;
    return (content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  }

  function burbujaUsuario(m) {
    const d = el("div", "msg usuario");
    const texto = textoDeContenido(m.content);
    if (texto.length > LARGO_PLEGADO) {
      const det = el("details");
      det.appendChild(el("summary", null, `📄 Prompt enviado (${texto.length.toLocaleString("es-CL")} caracteres)`));
      det.appendChild(el("div", "texto-plano", texto));
      d.appendChild(det);
    } else {
      d.appendChild(el("div", "texto-plano", texto));
    }
    return d;
  }

  function burbujaAsistente(m, notaMsg) {
    const r = C.resumirBloques(m.content);
    const d = el("div", "msg asistente");
    if (r.razonamiento) {
      const det = el("details", "razonamiento");
      det.appendChild(el("summary", null, "💭 Razonamiento (resumen)"));
      det.appendChild(el("div", "texto-plano", r.razonamiento));
      d.appendChild(det);
    }
    if (r.busquedas.length) d.appendChild(el("p", "busquedas", "🔎 Buscó: " + r.busquedas.join(" · ")));
    if (r.respaldo) d.appendChild(el("p", "nota", `↪ Respuesta con el modelo de respaldo (${r.respaldo}).`));
    const md = el("div", "md");
    md.innerHTML = window.Markdown.aHtml(r.texto || "(sin texto)");
    d.appendChild(md);
    if (r.fuentes.length) {
      const f = el("div", "fuentes");
      f.appendChild(el("b", null, "Fuentes:"));
      const ol = el("ol");
      for (const x of r.fuentes) {
        if (!/^https?:\/\//i.test(x.url)) continue;
        const li = el("li");
        const a = el("a", null, x.titulo);
        a.href = x.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        li.appendChild(a);
        ol.appendChild(li);
      }
      f.appendChild(ol);
      d.appendChild(f);
    }
    if (notaMsg) d.appendChild(el("p", "meta", `${nombreModelo(notaMsg.modelo)} · costo estimado ${C.usd(notaMsg.costo)}`));
    return d;
  }

  function renderChat() {
    const cont = $("chatMensajes");
    cont.textContent = "";
    if (!conv.mensajes.length) {
      cont.appendChild(el("p", "nota vacio", "Revisa el texto de abajo, elige el modelo y pulsa «Enviar». Cada respuesta muestra su costo estimado."));
      return;
    }
    conv.mensajes.forEach((m, i) => {
      cont.appendChild(m.role === "user" ? burbujaUsuario(m) : burbujaAsistente(m, conv.notas[i]));
    });
  }

  function renderCostosChat() {
    const a = C.ajustes();
    const estado = C.estadoPresupuesto(a);
    let texto = `Esta conversación: ${C.usd(conv.costo)} · Total gastado (estimado): ${C.usd(a.gastado)} de USD ${a.presupuesto}`;
    if (estado === "aviso") texto += " · ⚠️ Usaste más del 80 % del presupuesto.";
    if (estado === "agotado") texto += " · ⛔ Presupuesto agotado.";
    $("chatCostos").textContent = texto;
    $("chatCostos").className = "chat-costos " + estado;
  }

  function estadoBotones() {
    const ocupado = Boolean(enCurso);
    $("chatEnviar").disabled = ocupado;
    $("chatContinuar").disabled = ocupado;
    $("chatDetener").classList.toggle("oculto", !ocupado);
    $("chatContinuar").classList.toggle("oculto", conv.tipo !== "loop" || (!conv.mensajes.length && !ocupado));
  }

  function burbujaEnVivo() {
    const d = el("div", "msg asistente en-vivo");
    const estado = el("p", "estado", "⏳ Conectando…");
    const det = el("details", "razonamiento");
    det.hidden = true;
    det.appendChild(el("summary", null, "💭 Razonamiento (resumen)"));
    const raz = el("div", "texto-plano");
    det.appendChild(raz);
    const texto = el("div", "texto-plano");
    d.append(estado, det, texto);
    return { el: d, estado, det, raz, texto };
  }

  function eventosPara(vivo) {
    return {
      inicioBloque(b) {
        if (b.type === "thinking") vivo.estado.textContent = "💭 Pensando…";
        else if (b.type === "server_tool_use") vivo.estado.textContent = "🔎 Buscando en internet…";
        else if (b.type === "web_search_tool_result") vivo.estado.textContent = "📄 Leyendo resultados…";
        else if (b.type === "text") vivo.estado.textContent = "✍️ Escribiendo…";
        else if (b.type === "fallback") vivo.estado.textContent = "↪ Cambiando al modelo de respaldo…";
      },
      texto(t) { vivo.texto.textContent += t; bajar(); },
      razonamiento(t) { vivo.det.hidden = false; vivo.raz.textContent += t; },
    };
  }

  async function enviar(textoFijo) {
    if (enCurso || !conv) return;
    const texto = String(textoFijo != null ? textoFijo : $("chatTexto").value).trim();
    if (!texto) { nota("Escribe un mensaje para enviar."); return; }
    const cli = obtenerCliente();
    if (!cli) {
      despuesDeConectar = () => abrirChat(conv);
      App.cerrarDialogo($("dlgChat"));
      abrirAjustes("Conecta tu clave de Claude para enviar.");
      return;
    }
    const a = C.ajustes();
    if (C.estadoPresupuesto(a) === "agotado") {
      nota(`⛔ Llegaste al presupuesto fijado para esta app (USD ${a.presupuesto}). Súbelo en «🔌 Conectar y ajustes» si quieres seguir.`);
      return;
    }
    if (!conv.mensajes.length) {
      conv.modelo = $("chatModelo").value;
      conv.esfuerzo = $("chatEsfuerzo").value;
      conv.busqueda = $("chatBusqueda").checked;
      conv.sistema = C.sistemaBase({ fecha: hoyLargo(), pais: conv.pais, busqueda: conv.busqueda }) +
        (conv.instrucciones ? "\n\n# Instrucciones del asistente\n\n" + conv.instrucciones : "");
    }
    bloquearConfig(true);
    conv.mensajes.push({ role: "user", content: texto });
    conv.borrador = "";
    $("chatTexto").value = "";
    renderChat();
    const vivo = burbujaEnVivo();
    $("chatMensajes").appendChild(vivo.el);
    bajar(true);
    const senal = {};
    enCurso = { senal };
    estadoBotones();
    try {
      const r = await C.ejecutarTurno(cli, conv, eventosPara(vivo), senal);
      C.sumarGasto(r.costo);
      conv.costo += r.costo;
      if (r.refusal) {
        conv.mensajes.pop();
        $("chatTexto").value = texto;
        nota(`Claude no respondió esta solicitud${r.refusal.category ? ` (motivo: ${r.refusal.category})` : ""}. Reformúlala e intenta de nuevo. Costo estimado del intento: ${C.usd(r.costo)}.`);
      } else {
        r.respuestas.forEach((m, k) => {
          conv.mensajes.push({ role: "assistant", content: C.contenidoParaHistorial(m.content) });
          conv.notas[conv.mensajes.length - 1] = { costo: r.costos[k], modelo: m.model, stop: m.stop_reason };
        });
        if (r.stop_reason === "max_tokens") nota("La respuesta llegó al largo máximo y quedó cortada. Escribe «continúa» para seguir.");
        else if (r.stop_reason === "pause_turn") nota("La búsqueda quedó en pausa. Escribe «continúa» para que termine.");
      }
      conv.actualizada = new Date().toISOString();
      guardarConversacion(conv);
    } catch (err) {
      const info = C.explicarError(err);
      conv.mensajes.pop();
      $("chatTexto").value = texto;
      if (info.tipo === "clave") cliente = null;
      nota(info.tipo === "detenido"
        ? "⏹ Detuviste la respuesta. Lo que alcanzó a generarse igual se cobra, pero no se pudo estimar."
        : "⚠️ " + info.texto);
    } finally {
      enCurso = null;
      if (!conv.mensajes.length) bloquearConfig(false);
      estadoBotones();
      renderChat();
      renderCostosChat();
      renderEstado();
      bajar(true);
    }
  }

  function descargarConversacion() {
    if (!conv) return;
    const partes = [`# ${conv.titulo}`, "", `Modelo: ${nombreModelo(conv.modelo)} · Costo estimado: ${C.usd(conv.costo)} · ${new Date().toLocaleString("es-CL")}`, ""];
    conv.mensajes.forEach((m) => {
      if (m.role === "user") { partes.push("## 🧑 Tú", "", textoDeContenido(m.content), ""); return; }
      const r = C.resumirBloques(m.content);
      partes.push("## 🤖 Claude", "", r.texto, "");
      if (r.fuentes.length) partes.push("Fuentes:", ...r.fuentes.map((f) => `- [${f.titulo}](${f.url})`), "");
    });
    const nombre = "conversacion-" + window.Motor.slug(conv.titulo) + ".md";
    App.descargar(nombre, partes.join("\n"), "text/markdown;charset=utf-8");
  }

  async function revisarBusqueda() {
    if (!$("chatBusqueda").checked) return;
    const cli = obtenerCliente();
    if (!cli) return;
    try {
      const info = await cli.models.retrieve($("chatModelo").value);
      const ws = info && info.capabilities && info.capabilities.server_tools && info.capabilities.server_tools.web_search;
      if (ws && ws.supported === false) {
        $("chatBusqueda").checked = false;
        nota("Según la API, este modelo no admite búsqueda web.");
      }
    } catch (e) { /* se valida al enviar */ }
  }

  // ---- Eventos ---------------------------------------------------------------------------

  $("btnClaude").addEventListener("click", () => abrirAjustes());
  $("btnConfigClaude").addEventListener("click", () => abrirAjustes());
  $("formClaude").addEventListener("submit", guardarAjustesClaude);
  $("btnOlvidarClave").addEventListener("click", () => {
    C.olvidarClave();
    cliente = null;
    renderEstado();
    $("inpClave").placeholder = "sk-ant-…";
    $("msgClaude").textContent = "Clave olvidada en este navegador. Si ya no la usarás, revócala también en la Consola de Claude.";
  });
  $("btnReiniciarGasto").addEventListener("click", () => {
    if (!confirm("¿Volver a cero el contador de gasto estimado? No cambia tu saldo real.")) return;
    C.guardarAjustes({ gastado: 0 });
    $("txtGastado").textContent = C.usd(0);
    renderEstado();
  });
  $("dlgClaude").addEventListener("close", () => { despuesDeConectar = null; });

  $("btnEjecutar").addEventListener("click", abrirDesdeResultado);
  $("chatEnviar").addEventListener("click", () => enviar());
  $("chatContinuar").addEventListener("click", () => enviar("CONTINUAR"));
  $("chatDetener").addEventListener("click", () => { if (enCurso && enCurso.senal.abortar) enCurso.senal.abortar(); });
  $("chatDescargar").addEventListener("click", descargarConversacion);
  $("chatBusqueda").addEventListener("change", revisarBusqueda);
  $("chatModelo").addEventListener("change", revisarBusqueda);
  $("chatTexto").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); enviar(); }
  });
  $("chatTexto").addEventListener("input", (e) => { if (conv) conv.borrador = e.target.value; });
  $("dlgChat").addEventListener("close", () => {
    if (enCurso && enCurso.senal.abortar) enCurso.senal.abortar();
  });

  renderEstado();
  renderLista();
})();
