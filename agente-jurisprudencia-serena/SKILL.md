---
name: jurisprudencia-ca-la-serena
description: >
  Agente que trabaja SOLO con fallos de la Corte de Apelaciones de La Serena: lee las
  notas "Noticias sobre fallos" del Poder Judicial (pjud.cl, jurisdicción C.A. de La
  Serena), descarta juzgados, TOP, ministros en visita y noticias institucionales,
  arma fichas literales de cada fallo, elige los más útiles para Choapa Justa y entrega
  un reporte para crear carruseles de Instagram (guion validado contra la ficha y
  captions), que envía por Gmail a Patricio Andrades. Disparar con: "fallos de la Corte
  de La Serena", "reporte de jurisprudencia de La Serena", "qué falló la Corte de La
  Serena esta semana", "carrusel de un fallo de la Corte de La Serena", "renderiza el
  carrusel del fallo <número>", o desde la rutina semanal "Reporte Fallos C.A. La Serena".
---

# Agente Jurisprudencia C.A. La Serena → carruseles

La búsqueda y el reporte los arma un programa determinista, `reporte.mjs`. Tu trabajo
es: ejecutarlo, escribir el guion de cada carrusel recomendado **usando solo su ficha**,
validarlo con `validar-carrusel.mjs`, recomponer el reporte y enviarlo por Gmail sin
cambiarlo.

En el repositorio `Patnic88/PATRICIO-GUILLERMO-ANDRADES-TORDECILLA` los programas están
en `agente-jurisprudencia-serena/`. En el skill descargable están junto a este archivo.
`<agente>` es esa carpeta. Como `<salida>` usa `salidas/jurisprudencia-serena/<hoy>`
dentro del repositorio (carpeta ignorada por git) o una carpeta temporal.

## Pasos

1. **Buscar.** Ejecuta con un timeout de 600000 ms:

   - Rutina semanal (los 7 días completos anteriores a hoy):
     ```bash
     node <agente>/reporte.mjs --salida <salida> --dias-anteriores 7
     ```
   - A pedido, un período concreto:
     ```bash
     node <agente>/reporte.mjs --salida <salida> --desde AAAA-MM-DD --hasta AAAA-MM-DD
     ```
   - **Modo carpeta**: notas que Patricio abrió en su navegador y guardó como `.html`
     (por ejemplo, adjuntas en la conversación o descargadas de su Google Drive a una
     carpeta local). No usa la red:
     ```bash
     node <agente>/reporte.mjs --salida <salida> --entrada <carpeta con los .html>
     ```

   Imprime un JSON (también en `<salida>/resultado.json`) con `accion` (`"reporte"` o
   `"aviso"`), `asunto`, `para`, `cc`, `recomendados` (cada uno con su `carpeta`) y
   `archivos.html`.

2. **Si `accion` es `"aviso"`**, salta al paso 5: el sitio no se pudo leer. Si el aviso
   dice que pjud.cl pidió una **verificación humana (CAPTCHA)**, no intentes resolverla
   ni evadirla (ni con otro navegador, ni con otro agente de usuario, ni con lectores web
   o archivos de terceros): el aviso ya le explica a Patricio el modo carpeta.

3. **Escribir cada carrusel recomendado** (en orden; son a lo más 3). En su `carpeta`
   hay `ficha.json`, `brief.md` y `spec.base.json`. Lee los tres. Si el skill
   `carrusel-juridico-choapajusta` está disponible, cárgalo y sigue su narrativa y su
   guía de captions; si no, sigue `brief.md`.

   a. Copia `spec.base.json` a `spec.json` y reemplaza cada `[REDACTAR: …]`.
   b. Escribe `captions.md` con el caption de Instagram (gancho, desarrollo, CTA, una
      línea `Fuente: Corte de Apelaciones de La Serena, …` y hashtags con `#choapajusta`)
      y la versión de Facebook.
   c. Valida:
      ```bash
      node <agente>/validar-carrusel.mjs <carpeta>
      ```
      Si hay errores, corrige el texto (no la regla) y vuelve a validar, hasta 3 veces.
      Si aún falla, déjalo así: el reporte lo mostrará como "no usar".

   Reglas para redactar (el validador revisa las tres primeras; las demás dependen de ti):
   - **Cita literal.** La slide `cita` copia texto de la ficha tal cual; puedes acortarla
     con `(…)`. No cambies su `fuente`.
   - **Cifras y organismos solo de la ficha.** Ningún número, plazo, monto, artículo, ley,
     rol, tribunal u organismo que no esté en la nota.
   - **Rol.** Si la nota no lo trae, el `[VERIFICAR: rol en la OJV]` se queda: el
     carrusel saldrá con banda BORRADOR hasta que Patricio lo confirme.
   - **Criterio, no ley.** "La Corte consideró que…", nunca "la ley dice que…". La fecha
     disponible es la de la nota, no la de la sentencia.
   - **Nada que la nota no diga.** No completes con búsquedas web ni con memoria. Si un
     dato hace falta y no está, no lo pongas.
   - **Personas.** No identifiques a ninguna persona; con `cuidado` o `delicado` en la
     ficha, sé especialmente sobrio.
   - **Sin consejo para un caso** ni promesas de resultado: el cierre invita a consultar.

4. **Recomponer el reporte** con los carruseles validados:
   ```bash
   node <agente>/reporte.mjs --componer <salida>
   ```
   Vuelve a imprimir el JSON, con el estado de cada carrusel.

5. **Enviar.** Lee **completo** `archivos.html` y envía **un solo** correo con la
   herramienta de Gmail `send_message`:
   - `to`: `para`; `cc`: `cc`; `subject`: `asunto`, tal cual;
   - `htmlBody`: el contenido exacto de `archivos.html` (no envíes `body`).

   No resumas ni agregues nada al correo.

6. **Si un programa termina con error** (código distinto de 0 o `"accion": "error"`),
   envía un correo breve a `pandrades23@gmail.com` con CC
   `andradestordecilla.abogado@gmail.com`, asunto `⚖️ Fallos C.A. La Serena — el agente
   falló` y el mensaje de error textual. No armes un reporte a mano.

7. Termina con una sola línea: qué enviaste (`accion` y asunto) y a quién.

## Renderizar las láminas (a pedido)

Cuando Patricio pida "renderiza el carrusel del fallo <número de nota>":

1. Ubica la carpeta `carruseles/<fecha>_<número>` de la última ejecución. Si ya no
   existe (el entorno se reinició), vuelve a ejecutar el paso 1 con `--desde` y `--hasta`
   iguales a la fecha de la nota y rehace el paso 3 para ese fallo.
2. Valida con `validar-carrusel.mjs`. Si no pasa, corrige antes de seguir.
3. Genera las láminas con el script del skill `carrusel-juridico-choapajusta`:
   ```bash
   python3 <skill carrusel>/scripts/generar_carrusel.py <carpeta>/spec.json <carpeta>/laminas/
   ```
   Mira cada PNG (texto cortado, desbordes) y entrégalos en orden junto a `captions.md`.
   Si queda algún `[VERIFICAR]`, dilo primero: esas láminas no se publican.

## Reglas

- **Solo la Corte de Apelaciones de La Serena.** Juzgados, TOP, ministros en visita y la
  Corte Suprema quedan fuera, aunque el tema sea atractivo. No amplíes la búsqueda a otros
  tribunales ni a otras fuentes.
- **Fuente única:** las notas del Poder Judicial que el programa leyó. Lo que no esté en
  la ficha no va en el carrusel ni en el correo.
- **No insistas ante el sitio.** Si pjud.cl rechaza una lectura o pide verificación
  humana, el programa se detiene y deja las notas como "no leídas". No reintentes ni
  busques otra vía para leerlas: quedan para revisión manual con su enlace, o para el
  modo carpeta.
- **Un aviso es un resultado válido.** Envíalo tal cual.
- **Un correo por ejecución.**

## Configuración

Destinatarios, filtros de pjud.cl, temas y puntaje mínimo están al inicio de
`jurisprudencia.mjs` (`CONFIG` y `TEMAS`).
