# 🎯 Radar Dropshipping

App web sin servidor para **analizar lo que funciona en redes sociales** (TikTok,
Reels, Facebook, anuncios de Meta) y **adaptarlo a una tienda Shopify** de
principiante: ficha de producto, precio, guion de anuncio y CSV de importación.

> El sistema replica la **estructura** de lo que funciona (tipo de gancho,
> formato, oferta, rango de precio), no el contenido. El video, la música y
> el texto de otros vendedores están protegidos por derecho de autor; la app
> genera plantillas para que grabes y escribas material propio.

## Cómo usarla

Abre `index.html` en el navegador (computador o celular). Está pensada para
alguien **sin experiencia**: una pregunta por pantalla, ejemplos en cada
campo, ayudas "¿dónde encuentro esto?" y un resultado tipo semáforo.

1. **Inicio**: explica el método en 3 pasos. El botón **🎓 Ver un ejemplo**
   carga un producto con **datos inventados** (marcado como "Ejemplo") para
   aprender sin riesgo.
2. **🔍 Analizar** (asistente de 7 pasos con barra de avance):
   1. Qué producto viste y dónde (botones grandes: TikTok, Instagram…).
   2. Cuánta gente reaccionó. Acepta los números como aparecen en redes:
      `1,2 M`, `15 mil`, `8K`, `19.990`.
   3. Señales de venta: si el video decía "Patrocinado" y cuántos de 20
      comentarios preguntan el precio o dónde comprarlo.
   4. Cómo era el video: inicio, tipo de video y oferta, con tarjetas que
      explican cada opción con un ejemplo.
   5. Cuentas: precio, costo del proveedor y envío. Muestra en vivo cuánto
      ganarías por venta.
   6. Ocho preguntas Sí / No / No sé sobre el producto. Dos son
      **importantes** (marcas y productos restringidos).
   7. (Opcional) Descripción con tus palabras para la página y el video.
3. **Resultado**: semáforo 🟢 *¡Buen candidato!* · 🟡 *Pruébalo con poco
   dinero* · ⚪ *Mejor busca otro* · 🔴 *No lo vendas*, con las razones en
   palabras simples (✅ / ➖ / ❌). El puntaje numérico queda en un desplegable.
4. **📋 Mis productos**: lista ordenada del mejor al peor, con accesos a
   corregir, ver el video, llevar a la tienda o borrar.
5. **🛒 Mi tienda**: cinco etapas numeradas —precio (con un deslizador
   "más barato ↔ más ganancia"), vista previa de la página de producto, guion
   del video como línea de tiempo, subida a Shopify (archivo o Claude) y
   lista de revisión antes de publicar.
6. **💡 Tendencias**: qué tienen en común tus productos 🟢 y 🟡.

En celular el menú queda abajo, como en una app, y los botones Atrás /
Siguiente siempre están a la vista. Respeta el modo oscuro del teléfono.

### Subir a Shopify

- **Opción A (recomendada)**: *Descargar archivo para Shopify* → en
  Shopify, **Productos → Importar** → elegir el archivo. Entra como
  **borrador**: agrega tus fotos y publícalo.
- **Opción B**: *Copiar texto para Claude* y pegarlo en una conversación
  con Claude que tenga el conector de Shopify activo. También crea un
  borrador.

### Guardar tus datos

Se guardan solo en ese navegador. En **Inicio → ⚙️ Herramientas
avanzadas** puedes descargar una copia, recuperarla en otro equipo o
exportar todos los productos aptos a un solo archivo de Shopify.

## Cómo se calcula el puntaje

| Componente | Peso | Qué mide | Puntaje máximo cuando… |
|---|---|---|---|
| Demanda | 30 | Engagement (interacciones / vistas) y vistas por día (escala log.) | engagement ≥ 10 % y ≥ 50.000 vistas/día |
| Margen | 25 | (precio − costo − envío) / precio | margen ≥ 65 % |
| Señales de venta | 15 | Días que lleva activo el anuncio pagado, o comentarios que preguntan precio / dónde comprar (de 20 leídos) | ≥ 30 días activo, o ≥ 5 de 20 comentarios |
| Checklist | 30 | 8 criterios cualitativos (efecto wow, resuelve problema, etc.) | todos marcados |

**Estos umbrales son heurísticos**: reflejan criterios de práctica habitual
en dropshipping, no un modelo validado con datos de ventas. Ajústalos en
`UMBRALES` y `PESOS` de `scoring.js` según tus resultados reales. La
premisa de que "un anuncio activo por semanas probablemente vende" es una
inferencia: nadie paga publicidad a pérdida por mucho tiempo, pero no
prueba ventas.

Los criterios **"No usa marca registrada"** y **"No es producto
restringido"** son obligatorios: si no se marcan, el producto queda *No apto*
y no se exporta al CSV.

## Módulo opcional: Biblioteca de Anuncios de Meta

En **Inicio → ⚙️ Herramientas avanzadas**, la búsqueda de Meta consulta la API oficial (`ads_archive`) y
ordena los anuncios por días activo. Con **🔍 Analizar este** se
precarga el asistente.

Limitaciones (fuentes secundarias; no pude abrir la documentación oficial
desde este entorno, revísala en
`developers.facebook.com/docs/graph-api/reference/ads_archive`):

- Con `ad_type=ALL`, la API entrega anuncios **comerciales** solo si se
  mostraron en la **UE o el Reino Unido**. Fuera de esa zona (Chile incluido)
  queda limitada en la práctica a anuncios políticos o de temas sociales.
  Sirve para detectar tendencias europeas antes de que lleguen a tu mercado.
- Requiere un token de una app de Meta con acceso a la Ad Library API
  (incluye verificación de identidad). El token se guarda solo en tu
  navegador.
- La versión de la API viene por defecto en `v25.0` y se puede cambiar en
  esa sección. Si Meta responde con error, el mensaje se muestra tal cual.

**TikTok** no está integrado: su Commercial Content API requiere solicitar
acceso (revisión de 1–2 semanas) y solo entrega datos de Europa. Para TikTok
usa el registro manual.

## Archivos

| Archivo | Descripción |
|---|---|
| `index.html` | Interfaz: inicio, asistente, resultado, productos, tienda, tendencias y ayuda |
| `styles.css` | Estilos |
| `app.js` | Navegación, asistente paso a paso, semáforo y persistencia |
| `scoring.js` | Motor de puntuación (umbrales y pesos editables), preguntas del checklist y lector de números |
| `generadores.js` | Ficha, guion (en pasos), CSV de Shopify y texto para Claude |
| `meta-api.js` | Cliente de la Biblioteca de Anuncios de Meta |
| `tests/scoring.test.js` | Pruebas: `node tests/scoring.test.js` |

## Pendiente de verificación

- Columnas del CSV: tomadas de la plantilla de Shopify según la ayuda de
  Shopify citada en fuentes secundarias (solo `Handle` y `Title` son
  obligatorias; los encabezados distinguen mayúsculas). **Importa primero un
  solo producto de prueba** para confirmarlo con tu tienda.
- Precio "antes" tachado: no se ofrece en la interfaz. Mostrar un precio anterior que
  nunca se cobró puede infringir la normativa de protección al consumidor
  (en Chile, Ley 19.496 [VERIFICAR artículo aplicable y vigencia]).
