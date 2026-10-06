# 🎯 Radar Dropshipping

App web sin servidor para **analizar lo que funciona en redes sociales** (TikTok,
Reels, Facebook, anuncios de Meta) y **adaptarlo a una tienda Shopify** de
principiante: ficha de producto, precio, guion de anuncio y CSV de importación.

> El sistema replica la **estructura** de lo que funciona (tipo de gancho,
> formato, oferta, rango de precio), no el contenido. El video, la música y
> el texto de otros vendedores están protegidos por derecho de autor; la app
> genera plantillas para que grabes y escribas material propio.

## Cómo usarla

Abre `index.html` en el navegador. Flujo en 4 pasos:

1. **Registrar**: cuando veas un video o anuncio que funciona, anota las
   métricas visibles (vistas, likes, comentarios, compartidos), la estructura
   (gancho, formato, oferta) y los números del negocio (precio observado,
   costo del proveedor, envío). Marca el checklist del producto.
2. **Ranking**: cada producto recibe un puntaje de 0 a 100 y un veredicto:
   *Ganador probable* (≥70), *Testear con poco presupuesto* (50–69),
   *Descartar* (<50) o *No apto* (si falla un criterio obligatorio).
3. **Patrones**: muestra qué ganchos, formatos, ofertas, plataformas y nichos
   se repiten entre tus mejores productos, y las medianas de precio, margen y
   engagement.
4. **Aplicar a mi tienda**: genera la ficha de producto, el precio sugerido,
   un guion de anuncio de 30 segundos y el checklist previo a publicar.
   Exporta:
   - **CSV para Shopify** (Admin → Productos → Importar). Los productos
     entran como **borrador** (`Status = draft`).
   - **JSON para Claude**: pégalo en una conversación con el conector de
     Shopify activo y Claude crea el producto como borrador.

Los datos quedan en `localStorage` de ese navegador. Usa **⬇ Respaldo JSON**
(pestaña Ranking) para no perderlos y **⬆ Restaurar respaldo** para
recuperarlos o pasarlos a otro equipo.

## Cómo se calcula el puntaje

| Componente | Peso | Qué mide | Puntaje máximo cuando… |
|---|---|---|---|
| Demanda | 30 | Engagement (interacciones / vistas) y vistas por día (escala log.) | engagement ≥ 10 % y ≥ 50.000 vistas/día |
| Margen | 25 | (precio − costo − envío) / precio | margen ≥ 65 % |
| Prueba de rentabilidad | 15 | Días activo del anuncio pagado, o % de comentarios con intención de compra | ≥ 30 días activo, o ≥ 5 % de comentarios de compra |
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

La pestaña **Meta Ad Library** consulta la API oficial (`ads_archive`) y
ordena los anuncios por días activo. Con **➕ Analizar este anuncio** se
precarga el formulario.

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
  la pestaña. Si Meta responde con error, el mensaje se muestra tal cual.

**TikTok** no está integrado: su Commercial Content API requiere solicitar
acceso (revisión de 1–2 semanas) y solo entrega datos de Europa. Para TikTok
usa el registro manual.

## Archivos

| Archivo | Descripción |
|---|---|
| `index.html` | Interfaz (5 pestañas) |
| `styles.css` | Estilos |
| `app.js` | Lógica de interfaz y persistencia |
| `scoring.js` | Motor de puntuación (umbrales y pesos editables) |
| `generadores.js` | Ficha, guion, CSV de Shopify y JSON para Claude |
| `meta-api.js` | Cliente de la Biblioteca de Anuncios de Meta |
| `tests/scoring.test.js` | Pruebas: `node tests/scoring.test.js` |

## Pendiente de verificación

- Columnas del CSV: tomadas de la plantilla de Shopify según la ayuda de
  Shopify citada en fuentes secundarias (solo `Handle` y `Title` son
  obligatorias; los encabezados distinguen mayúsculas). **Importa primero un
  solo producto de prueba** para confirmarlo con tu tienda.
- Precio "antes" tachado: viene desactivado. Mostrar un precio anterior que
  nunca se cobró puede infringir la normativa de protección al consumidor
  (en Chile, Ley 19.496 [VERIFICAR artículo aplicable y vigencia]).
