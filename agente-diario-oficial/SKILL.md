---
name: diario-oficial
description: >
  Revisa la edición del día del Diario Oficial de Chile (diariooficial.interior.gob.cl)
  y envía por Gmail el reporte a Patricio Andrades: destacadas por tema (Los Vilos /
  Choapa / Coquimbo, municipal, laboral, Contraloría, tributario), Normas Generales,
  Avisos destacados y coincidencias en Normas Particulares y Publicaciones Judiciales.
  Disparar con: "revisa el Diario Oficial", "reporte del Diario Oficial", "qué salió hoy
  en el Diario Oficial", o desde la rutina diaria "Reporte Diario Oficial".
---

# Agente Diario Oficial

El reporte lo arma un programa determinista, `reporte.mjs`, con la misma lógica que
`diario-oficial.gs`. Tu trabajo es **ejecutarlo y enviar por Gmail exactamente lo que
produce**. No resumas, no completes y no interpretes.

## Pasos

1. Ejecuta el programa con un timeout de 600000 ms. Hay dos modos:

   - **Período** (lo usa la rutina cada dos días): los N días anteriores completos,
     con **todas** las ediciones de cada día (1ª, 2ª…):

     ```bash
     node <directorio de este skill>/reporte.mjs --salida <carpeta temporal> --dias-anteriores 2
     ```

   - **Edición de hoy** (cuando el usuario pide "lo de hoy"). Si la edición todavía no
     aparece, el programa espera y reintenta, hasta unos 8 minutos:

     ```bash
     node <directorio de este skill>/reporte.mjs --salida <carpeta temporal>
     ```

   En el repositorio `Patnic88/PATRICIO-GUILLERMO-ANDRADES-TORDECILLA` el programa
   está en `agente-diario-oficial/reporte.mjs`.

2. El programa imprime un JSON, que también queda en `<salida>/resultado.json`, con:
   - `accion`: `"reporte"` o `"aviso"`;
   - `asunto`, `para` y `cc`;
   - `archivos.html` y `archivos.texto`;
   - `secciones` (edición de hoy) o `dias` (período): estado de lo leído.

3. Lee **completo** `archivos.html`. Envía **un solo** correo con la herramienta de
   Gmail `send_message`:
   - `to`: `para`;
   - `cc`: `cc`;
   - `subject`: `asunto`, tal cual;
   - `htmlBody`: el contenido exacto de `archivos.html`.

   No envíes `body`: `archivos.texto` es la misma información en texto plano y queda
   solo como respaldo (así no se transcribe dos veces un reporte largo).

   Copia los archivos sin cambiar nada. No resumas, no traduzcas y no agregues
   comentarios, normas, CVE ni conclusiones.

4. Si el programa termina con error (código de salida distinto de 0 o
   `"accion": "error"`), envía un correo breve a los mismos destinatarios:
   - asunto: `📰 Diario Oficial <fecha> — el agente falló`;
   - cuerpo: el mensaje de error, textual.

   Si no tienes `para` y `cc` porque el programa falló antes de producirlos, usa
   `pandrades23@gmail.com` y CC `andradestordecilla.abogado@gmail.com`. No armes un
   reporte a mano.

5. Termina con una sola línea: qué enviaste (`accion` y asunto) y a quién.

## Reglas

- **Fuente única:** los archivos que genera el programa. Lo que no esté ahí no va en
  el correo.
- **Un aviso es un resultado válido:** `"aviso"` significa que el sitio no se pudo
  leer o que no hay edición de hoy. Envíalo tal cual; no es un error que debas
  resolver buscando la información por otra vía (búsquedas web, memoria, etc.).
- **Bloqueo de red:** si el aviso dice que la red del entorno bloqueó el dominio,
  agrega a tu línea final que hay que permitir `www.diariooficial.interior.gob.cl` en
  Network access → Allowed domains del entorno.
- **Un correo por ejecución.**

## Configuración

Temas, secciones y destinatarios se editan en `diario-oficial.gs`, en las constantes
`DO_TEMAS`, `DO_SECCIONES`, `DIGEST_TO` y `DIGEST_CC`.
