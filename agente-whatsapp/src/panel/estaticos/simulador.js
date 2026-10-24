// Simulador del panel: envía mensajes al agente como si llegaran por WhatsApp.
(() => {
  const csrf = document.querySelector('meta[name="csrf"]').content;
  const chat = document.getElementById("sim-chat");
  const traza = document.getElementById("sim-traza");
  const form = document.getElementById("sim-form");
  const texto = document.getElementById("sim-texto");
  const archivo = document.getElementById("sim-archivo");
  const telefono = document.getElementById("sim-telefono");

  const burbuja = (clase, contenido, meta) => {
    const d = document.createElement("div");
    d.className = `burbuja ${clase}`;
    const m = document.createElement("div");
    m.className = "meta";
    m.textContent = meta;
    const c = document.createElement("div");
    c.textContent = contenido;
    d.append(m, c);
    chat.append(d);
    chat.scrollTop = chat.scrollHeight;
  };

  const leerArchivo = (f) => new Promise((ok, mal) => {
    const r = new FileReader();
    r.onload = () => ok({ nombre: f.name, mime: f.type || "application/octet-stream", base64: String(r.result).split(",")[1] });
    r.onerror = mal;
    r.readAsDataURL(f);
  });

  const pintarTraza = (datos) => {
    traza.replaceChildren();
    const add = (titulo, cuerpo) => {
      const d = document.createElement("div");
      d.className = "traza";
      const b = document.createElement("b");
      b.textContent = titulo;
      const p = document.createElement("div");
      p.textContent = cuerpo;
      d.append(b, p);
      traza.append(d);
    };
    if (!datos.acciones.length) add("Sin herramientas", "El agente respondió sin usar herramientas.");
    for (const a of datos.acciones) add(`Herramienta: ${a.herramienta}`, `Entrada: ${JSON.stringify(a.entrada)}\nResultado: ${JSON.stringify(a.resultado)}`);
    for (const p of datos.problemas) add("Respuesta bloqueada por control", p);
    if (datos.error) add("Error", datos.error);
    for (const a of datos.alertas) add(`Alerta ${a.prioridad}: ${a.tipo}`, a.descripcion);
  };

  const llamar = async (ruta, cuerpo) => {
    const r = await fetch(ruta, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF": csrf }, body: JSON.stringify(cuerpo) });
    const d = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    return d;
  };

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = archivo.files[0];
    if (!texto.value.trim() && !f) return;
    burbuja("entrante", (f ? `[archivo: ${f.name}] ` : "") + texto.value, `cliente ${telefono.value}`);
    const cuerpo = { telefono: telefono.value, texto: texto.value, archivo: f ? await leerArchivo(f) : null };
    texto.value = ""; archivo.value = "";
    try {
      const d = await llamar("/panel/simulador/enviar", cuerpo);
      if (d.respuesta) burbuja("saliente", d.respuesta, "agente");
      else if (d.sin_respuesta) burbuja("saliente patricio", "(Respuestas automáticas pausadas: el mensaje queda para Patricio)", "sistema");
      else burbuja("saliente patricio", "(Sin respuesta)", "sistema");
      pintarTraza(d);
    } catch (e) {
      burbuja("saliente patricio", `Error: ${e.message}`, "sistema");
    }
  });

  document.getElementById("sim-reiniciar").addEventListener("click", async () => {
    await llamar("/panel/simulador/reiniciar", { telefono: telefono.value }).catch(() => null);
    chat.replaceChildren();
    traza.replaceChildren();
  });
})();
