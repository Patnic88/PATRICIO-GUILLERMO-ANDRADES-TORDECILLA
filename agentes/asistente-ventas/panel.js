// Panel del vendedor: lista los borradores y permite publicarlos o descartarlos.

(function () {
  const $ = (id) => document.getElementById(id);
  let filtro = "pendiente";
  let borradores = [];
  const ediciones = {}; // texto editado y aún no publicado, por id (sobrevive a la recarga periódica)

  async function api(ruta, opciones) {
    const r = await fetch(ruta, opciones);
    const datos = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(datos.error || `Error ${r.status}`), { datos });
    return datos;
  }

  async function cargarEstado() {
    const e = await api("api/estado");
    $("conectar").hidden = e.conectado;
    $("revisar").hidden = !e.conectado;
    $("estado-cuenta").textContent = e.conectado
      ? `Cuenta conectada${e.vendedor && e.vendedor.apodo ? `: ${e.vendedor.apodo}` : ""}.`
      : "Aún no conectas tu cuenta de vendedor.";
    const notas = [e.autoPublicar
      ? "Publicación automática ACTIVADA: se publican solos los borradores de confianza alta y sin alertas."
      : "Publicación automática desactivada: todo pasa por tu revisión."];
    if (!e.politicas) notas.push("No cargaste las políticas de tu tienda (politicas.md): la IA responderá con menos información.");
    $("nota-cuenta").textContent = notas.join(" ");
  }

  async function cargarBorradores() {
    borradores = (await api("api/borradores")).borradores;
    pintar();
  }

  function pintar() {
    const visibles = borradores.filter((b) => filtro === "todas" ||
      (filtro === "pendiente" ? ["pendiente", "error", "redactando"].includes(b.estado) : b.estado === filtro));
    $("n-pendiente").textContent = `(${borradores.filter((b) => ["pendiente", "error"].includes(b.estado)).length})`;
    $("lista").replaceChildren(...visibles.map(tarjeta));
    $("vacio").hidden = visibles.length > 0;
  }

  function insignia(texto, clase) {
    const s = document.createElement("span");
    s.className = "insignia " + (clase || "");
    s.textContent = texto;
    return s;
  }

  function tarjeta(b) {
    const nodo = $("plantilla").content.firstElementChild.cloneNode(true);
    const enlace = nodo.querySelector(".publicacion a");
    enlace.textContent = b.titulo || b.item_id;
    if (b.enlace) enlace.href = b.enlace; else enlace.removeAttribute("href");
    nodo.querySelector(".pregunta").textContent = b.pregunta;

    const ins = nodo.querySelector(".insignias");
    const estados = { pendiente: "Por revisar", publicada: b.auto ? "Publicada (automática)" : "Publicada", descartada: "Descartada", error: "Sin borrador", redactando: "Redactando…" };
    ins.append(insignia(estados[b.estado] || b.estado, "estado-" + b.estado));
    if (b.confianza) ins.append(insignia(`Confianza ${b.confianza}`, "confianza-" + b.confianza));
    if (b.requiere_revision) ins.append(insignia("Requiere tu revisión", "confianza-baja"));

    nodo.querySelector(".motivo").textContent = b.error || b.motivo_revision || "";
    const area = nodo.querySelector("textarea");
    area.value = ediciones[b.id] ?? (b.respuesta || "");
    const contador = nodo.querySelector(".contador");
    const alertasUl = nodo.querySelector(".alertas");
    const revisar = () => {
      const r = ReglasRespuesta.revisar(area.value);
      contador.textContent = `${area.value.length}/${ReglasRespuesta.LARGO_MAX}`;
      alertasUl.replaceChildren(...r.alertas.map((a) => {
        const li = document.createElement("li");
        li.textContent = (a.bloqueante ? "⛔ " : "⚠️ ") + a.mensaje;
        return li;
      }));
      return r;
    };
    area.addEventListener("input", () => { ediciones[b.id] = area.value; revisar(); });
    revisar();

    const usados = b.datos_usados || [];
    nodo.querySelector(".respaldo").hidden = !usados.length;
    nodo.querySelector(".respaldo ul").replaceChildren(...usados.map((t) => { const li = document.createElement("li"); li.textContent = t; return li; }));

    const editable = ["pendiente", "error"].includes(b.estado);
    area.readOnly = !editable;
    nodo.querySelector(".acciones").hidden = !editable;

    nodo.querySelector(".publicar").addEventListener("click", async (ev) => {
      const r = revisar();
      let forzar = false;
      if (r.bloqueada) {
        forzar = confirm("La respuesta tiene alertas (⛔). ¿Publicarla de todos modos?");
        if (!forzar) return;
      }
      ev.target.disabled = true;
      try {
        await api(`api/borradores/${b.id}/publicar`, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ texto: area.value, forzar }),
        });
        delete ediciones[b.id];
        await cargarBorradores();
      } catch (e) { alert(e.message); ev.target.disabled = false; }
    });
    nodo.querySelector(".descartar").addEventListener("click", async () => {
      if (!confirm("¿Descartar este borrador? La pregunta seguirá sin responder en la plataforma.")) return;
      await api(`api/borradores/${b.id}/descartar`, { method: "POST" }).catch((e) => alert(e.message));
      await cargarBorradores();
    });
    return nodo;
  }

  $("revisar").addEventListener("click", async (ev) => {
    ev.target.disabled = true;
    ev.target.textContent = "Buscando y redactando…";
    try {
      const { nuevas } = await api("api/revisar", { method: "POST" });
      if (!nuevas) alert("No hay preguntas nuevas sin responder.");
      await cargarBorradores();
    } catch (e) { alert(e.message); }
    ev.target.disabled = false;
    ev.target.textContent = "Buscar preguntas nuevas";
  });

  document.querySelectorAll(".pestanas button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".pestanas button").forEach((x) => x.classList.toggle("activa", x === b));
    filtro = b.dataset.filtro;
    pintar();
  }));

  cargarEstado().catch((e) => { $("estado-cuenta").textContent = e.message; });
  cargarBorradores().catch(() => {});
  // Recarga cada 30 s, salvo mientras escribes en una respuesta.
  setInterval(() => {
    if (!document.hidden && !(document.activeElement && document.activeElement.tagName === "TEXTAREA")) cargarBorradores().catch(() => {});
  }, 30_000);
})();
