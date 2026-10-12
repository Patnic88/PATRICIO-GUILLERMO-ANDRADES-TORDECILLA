# 💬 Asistente de Respuestas para vendedores

Agente para vendedores reales de Mercado Libre Chile. Cuando entra una
pregunta de un comprador, Claude revisa la publicación (precio, stock,
envío, garantía, atributos y descripción) y las políticas de la tienda, y
redacta una respuesta. El vendedor la aprueba, la edita o la descarta desde un
panel web.

> **Nombre y marca.** Según un extracto de los términos para desarrolladores
> de Mercado Libre Chile, la aplicación no debe usar "mercado", "libre",
> "pago", "envíos" ni "crédito" en su título, contenido o diseño, y debe dejar
> claro que no pertenece a Mercado Libre. Por eso el panel se llama
> "Asistente de Respuestas" y lleva ese aviso al pie. [VERIFICAR en la página
> oficial antes de elegir el nombre comercial.]

## Qué hace y qué no

- ✅ Recibe avisos de preguntas nuevas (tópico `questions`) y responde 200 de
  inmediato. Después redacta el borrador en una cola, de a una pregunta.
- ✅ Botón **Buscar preguntas nuevas**: trae las preguntas `UNANSWERED` por si
  se perdió algún aviso.
- ✅ Revisa cada respuesta antes de publicarla (`reglas-respuesta.js`). Bloquea
  teléfonos, correos, redes, enlaces y pagos por fuera; avisa de promesas
  absolutas; exige como máximo 2000 caracteres.
- ✅ Publicación automática **opcional** (`AUTO_PUBLICAR=true`). Solo publica
  borradores con confianza alta, sin necesidad de revisión y sin alertas.
  Viene desactivada.
- ❌ No envía mensajes de posventa. Esa mensajería tiene reglas propias:
  350 caracteres, el vendedor no inicia la conversación y en Chile se usan
  "motivos para comunicarse". Queda para una segunda versión.
- ❌ No guarda datos del comprador. Guarda el id y el texto de la pregunta, la
  publicación, el borrador y su estado.

## Puesta en marcha

1. **Registra una aplicación** en el DevCenter de Mercado Libre Chile, con
   permisos de comunicación pre y posventa y de acceso *offline* (el *offline*
   es necesario para recibir `refresh_token`). Define:
   - URL de redirección: `https://TU-DOMINIO/callback`
   - URL de notificaciones: `https://TU-DOMINIO/notificaciones`, tópico `questions`
2. **Prepara las políticas:** `cp politicas.ejemplo.md politicas.md` y escribe
   datos reales. La IA no inventa lo que no está ahí o en la publicación.
3. **Instala y arranca** (Node 20+, en un servidor con HTTPS):

   ```bash
   cd agentes/asistente-ventas
   npm install
   ML_CLIENT_ID=... ML_CLIENT_SECRET=... ML_REDIRECT_URI=https://TU-DOMINIO/callback \
   ANTHROPIC_API_KEY=sk-ant-... PANEL_CLAVE=una-clave-larga \
   node servidor.mjs
   ```

4. Entra a `https://TU-DOMINIO/` (usuario `vendedor` y la `PANEL_CLAVE`) y pulsa
   **Conectar cuenta de vendedor**.

| Variable | Para qué | Por defecto |
|---|---|---|
| `PANEL_CLAVE` | Clave del panel (obligatoria) | — |
| `PANEL_USUARIO` | Usuario del panel | `vendedor` |
| `AUTO_PUBLICAR` | `true` para publicar solos los borradores seguros | `false` |
| `POLITICAS` | Archivo de políticas de la tienda | `politicas.md` |
| `DATOS` | Carpeta de tokens y borradores (permisos 600) | `./datos` |
| `ML_AUTH_URL` | URL de autorización | `https://auth.mercadolibre.cl/authorization` [VERIFICAR] |
| `MODELO_CLAUDE` / `ESFUERZO_CLAUDE` | Modelo y esfuerzo de Claude | `claude-opus-5-5` / `medium` |
| `PUERTO` | Puerto HTTP | `8090` |

Cada instalación atiende **una** cuenta de vendedor. Para vender el servicio,
la forma más simple es una instalación por cliente.

## Cómo funciona por dentro

- `api-ml.mjs`: OAuth con PKCE (S256) y `state` de un solo uso. Lee
  `expires_in` en cada respuesta. Renueva el token antes de que venza y guarda
  de inmediato el nuevo `refresh_token`, porque es de un solo uso. Reintenta
  ante 401 (una vez) y 429 (con `Retry-After`).
- `agente.mjs`: tool runner del SDK de Anthropic con dos herramientas,
  `ver_publicacion` y `ver_descripcion`. Entrega un JSON con forma fija:
  respuesta, confianza, si requiere revisión y los datos usados. Las políticas
  van en el prompt de sistema con caché. Usa `fallbacks: "default"` igual que
  el detector.
- `servidor.mjs`: panel con autenticación básica, cola de procesamiento,
  deduplicación de avisos repetidos y filtro por `application_id`.

## Pruebas

```bash
npm test
```

Cubren las reglas, el cliente de la API (con un `fetch` falso), el agente
(con el SDK real y respuestas simuladas de Claude) y el servidor completo. **No
se probó contra las APIs reales de Mercado Libre ni de Claude**: el entorno
donde se escribió no tenía acceso a esas APIs ni credenciales. Pruébalo
primero con una cuenta de vendedor de prueba.

## Pendiente de verificación (antes de vender)

La documentación oficial no se pudo abrir completa: los datos vienen de
extractos de búsqueda de developers.mercadolibre.cl y .com.ar.

- [VERIFICAR] **Términos para desarrolladores**
  (developers.mercadolibre.cl/es-cl-terminos-y-condiciones). El extracto
  prohíbe "comercializar o sublicenciar la API a terceros" y permite
  distribuir aplicaciones que interactúan con ella. No encontré una cláusula
  que permita o prohíba expresamente cobrar a los vendedores por una app de
  terceros. También hay que revisar la certificación de aplicaciones (cl. 3).
- [VERIFICAR] **Datos personales.** El extracto define al vendedor como
  responsable y al desarrollador como "Encargado" (cl. 6). Revisa también las
  obligaciones bajo la normativa chilena de datos personales vigente.
- [VERIFICAR] Que la URL de autorización para Chile sea
  `auth.mercadolibre.cl`. El ejemplo de la página chilena usa `.com.ar`. Se
  puede cambiar con `ML_AUTH_URL`.
- [VERIFICAR] Que `GET /questions/search` acepte juntos `seller_id` y
  `status=UNANSWERED`. Ambos filtros están documentados, pero no vi un ejemplo
  con los dos.
- [VERIFICAR] Las reglas de la plataforma sobre datos de contacto en las
  respuestas. Las de `reglas-respuesta.js` son una política prudente de la
  herramienta, no una transcripción de esas reglas.
- Plazo de los avisos: el extracto indica que hay que responder 200 en
  500 ms. El servidor responde antes de procesar.
