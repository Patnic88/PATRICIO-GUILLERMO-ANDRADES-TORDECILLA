// Interfaz del detector. Funciona sola en el navegador (solo reglas) o
// servida por servidor.mjs (reglas + análisis con IA y lectura de capturas).

(function () {
  const $ = (id) => document.getElementById(id);
  const EJEMPLO = [
    "Mercado Libre Chile — Trabajo desde casa 2026",
    "¡Únete a un gran equipo y construye tu futuro con nosotros!",
    "Ingreso diario: 60.000 – 80.000 pesos chilenos (CLP)",
    "Horario de trabajo: Turno de mañana 09:00 – 13:00 · Turno de tarde 14:00 – 18:00 · Turno de noche 19:00 – 23:00",
    "(Puedes elegir el horario que mejor se adapte a ti)",
    "Descripción del trabajo: Usar un teléfono móvil o computadora para procesar pedidos online.",
    "Beneficios: Pago diario · Trabajo desde casa · Horario flexible · Proceso sencillo y eficiente",
    "Solicita ahora y obtén más información. Publicidad · Reservar ahora",
  ].join("\n");

  const estado = { servidor: false, ia: false, requiereClave: false, imagen: null };

  function guardar(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } }
  function leer(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }

  async function detectarServidor() {
    if (location.protocol === "file:") return pintarModo();
    try {
      const r = await fetch("api/estado");
      if (r.ok) Object.assign(estado, await r.json(), { servidor: true });
    } catch (e) { /* sin servidor: solo reglas */ }
    pintarModo();
  }

  function pintarModo() {
    $("modo").textContent = estado.ia
      ? "Modo completo: reglas automáticas + revisión con IA (lee capturas)."
      : "Modo básico: reglas automáticas en tu navegador. El texto no sale de tu equipo.";
    $("bloque-clave").hidden = !estado.requiereClave;
    $("clave").value = leer("detector.clave");
  }

  // Reduce la captura a 1600 px en su lado mayor antes de enviarla.
  function prepararImagen(archivo) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, 1600 / Math.max(img.width, img.height));
        const lienzo = document.createElement("canvas");
        lienzo.width = Math.round(img.width * escala);
        lienzo.height = Math.round(img.height * escala);
        lienzo.getContext("2d").drawImage(img, 0, 0, lienzo.width, lienzo.height);
        const url = lienzo.toDataURL("image/jpeg", 0.85);
        URL.revokeObjectURL(img.src);
        resolve({ media_type: "image/jpeg", data: url.split(",")[1], vista: url });
      };
      img.onerror = () => reject(new Error("No se pudo leer la imagen."));
      img.src = URL.createObjectURL(archivo);
    });
  }

  function lista(ul, items) {
    ul.replaceChildren(...items.map((t) => { const li = document.createElement("li"); li.textContent = t; return li; }));
  }

  function senalLi(titulo, evidencia, explicacion) {
    const li = document.createElement("li");
    const b = document.createElement("strong"); b.textContent = titulo;
    li.append(b);
    if (evidencia) { const q = document.createElement("q"); q.textContent = evidencia; li.append(q); }
    if (explicacion) { const p = document.createElement("p"); p.textContent = explicacion; li.append(p); }
    return li;
  }

  function mostrar(reglas, ia, avisoIA) {
    const nivel = ia && ia.nivel_riesgo !== "no_determinable" ? ia.nivel_riesgo : reglas.nivel;
    const info = Senales.NIVELES[nivel] || { etiqueta: "No determinable", resumen: "" };
    const sem = $("semaforo");
    sem.className = "tarjeta semaforo nivel-" + nivel;
    $("nivel").textContent = { alto: "🔴 ", medio: "🟡 ", bajo: "🟢 " }[nivel] || "⚪ ";
    $("nivel").textContent += ia && ia.nivel_riesgo === "no_determinable" ? "No parece una oferta de trabajo" : info.etiqueta;
    $("resumen").textContent = ia ? ia.resumen : info.resumen;
    $("origen").textContent = ia
      ? `Revisado con IA y reglas automáticas (puntaje de reglas: ${reglas.puntaje}/100).`
      : `Según reglas automáticas: ${reglas.puntaje}/100.` + (avisoIA ? ` ${avisoIA}` : "");

    const ul = $("senales");
    if (ia) {
      ul.replaceChildren(...ia.senales.map((s) => senalLi(s.senal, s.evidencia, s.por_que_importa)));
    } else {
      ul.replaceChildren(...reglas.senales.map((s) => senalLi(s.titulo, s.evidencia, s.explicacion)));
    }
    if (!ul.children.length) ul.replaceChildren(senalLi("No se detectaron señales de riesgo en el texto.", "", "Eso no prueba que sea legítima: verifica igual antes de postular."));

    const aFavor = ia ? ia.senales_a_favor : reglas.aFavor.map((s) => s.titulo);
    $("a-favor-bloque").hidden = !aFavor.length;
    lista($("a-favor"), aFavor);

    lista($("hacer"), ia && ia.que_hacer.length ? ia.que_hacer : Senales.CONSEJOS.hacer);
    lista($("no-hacer"), ia && ia.que_no_hacer.length ? ia.que_no_hacer : Senales.CONSEJOS.noHacer);

    const detectado = ia && ia.texto_detectado;
    $("detalle-texto").hidden = !detectado;
    $("texto-detectado").textContent = detectado || "";

    $("resultado").hidden = false;
    $("resultado").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function analizar(ev) {
    ev.preventDefault();
    const texto = $("texto").value;
    const reglas = Senales.analizar(texto);
    const boton = ev.submitter || document.querySelector("button[type=submit]");

    if (!estado.ia) {
      if (!texto.trim()) { $("aviso-imagen").hidden = !estado.imagen; return alert("Pega el texto del aviso para analizarlo."); }
      return mostrar(reglas, null, estado.imagen ? "La captura no se analizó: falta el modo con IA." : "");
    }
    if (!texto.trim() && !estado.imagen) return alert("Pega el texto del aviso o sube una captura.");

    boton.disabled = true;
    boton.textContent = "Revisando…";
    try {
      const clave = $("clave").value.trim();
      if (clave) guardar("detector.clave", clave);
      const r = await fetch("api/analizar", {
        method: "POST",
        headers: { "content-type": "application/json", "x-clave-cliente": clave },
        body: JSON.stringify({ texto, imagen: estado.imagen && { media_type: estado.imagen.media_type, data: estado.imagen.data } }),
      });
      const datos = await r.json();
      if (!r.ok && !datos.reglas) throw new Error(datos.error || "Error del servidor.");
      mostrar(datos.reglas || reglas, datos.ia, datos.avisoIA || datos.error);
    } catch (e) {
      mostrar(reglas, null, `No se pudo usar la IA (${e.message}).`);
    } finally {
      boton.disabled = false;
      boton.textContent = "Analizar aviso";
    }
  }

  $("imagen").addEventListener("change", async (ev) => {
    const archivo = ev.target.files[0];
    estado.imagen = null;
    $("vista-previa").hidden = true;
    $("aviso-imagen").hidden = true;
    if (!archivo) return;
    try {
      estado.imagen = await prepararImagen(archivo);
      $("vista-previa").src = estado.imagen.vista;
      $("vista-previa").hidden = false;
      $("aviso-imagen").hidden = estado.ia;
    } catch (e) { alert(e.message); }
  });

  $("ejemplo").addEventListener("click", () => { $("texto").value = EJEMPLO; $("texto").focus(); });
  $("formulario").addEventListener("submit", analizar);
  detectarServidor();
})();
