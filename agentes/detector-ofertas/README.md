# 🔎 Detector de Ofertas Falsas

Recibe el texto de un aviso de trabajo o una captura de pantalla. Responde con
un semáforo de riesgo, las señales encontradas (con la cita del aviso que las
respalda) y qué hacer y qué no hacer.

Nació del anuncio que circula en TikTok usando el nombre de Mercado Libre
("ingreso diario 60.000–80.000 CLP", "procesar pedidos online"). Está
transcrito en `ejemplos/aviso-tiktok-mercadolibre.txt` y sirve de prueba.

## Dos modos

| Modo | Cómo se abre | Qué hace |
|---|---|---|
| **Básico** | Doble clic en `index.html` | Aplica las reglas de `senales.js` en el navegador. El texto no sale del equipo y no se pueden leer capturas. |
| **Completo** | `node servidor.mjs` | Agrega el análisis de Claude: lee capturas, confirma o descarta las señales de las reglas y redacta consejos para ese aviso. |

## Puesta en marcha (modo completo)

Requiere Node 20 o superior y una clave de la API de Claude.

```bash
cd agentes/detector-ofertas
npm install
ANTHROPIC_API_KEY=sk-ant-... node servidor.mjs
# abre http://localhost:8080
```

Variables opcionales:

| Variable | Para qué | Por defecto |
|---|---|---|
| `PUERTO` | Puerto HTTP | `8080` |
| `CLAVES_CLIENTES` | Claves de cliente separadas por coma. Si existe, cada análisis exige una. Permite vender acceso por cliente. | (sin claves: acceso abierto) |
| `LIMITE_POR_HORA` | Análisis con IA por clave (o por IP) por hora | `30` |
| `MODELO_CLAUDE` | Modelo de Claude | `claude-opus-5-5` |
| `ESFUERZO_CLAUDE` | `low`, `medium`, `high`… Más esfuerzo cuesta más tokens. | `medium` |

Cada análisis escribe en la consola una línea JSON con el cliente, el modelo y
los tokens usados. **No guarda el texto del aviso.** Sirve para cobrar por uso
y para medir el costo real antes de fijar precios.

## Cómo funciona

1. **Reglas (`senales.js`).** Catorce señales con peso: pide depósito, pide
   claves, usa una marca para ofrecer empleo, monto por día, tarea vaga,
   WhatsApp/Telegram, enlaces acortados o que no son del dominio oficial, y
   otras. Las señales "críticas" (pedir dinero o claves) dejan el riesgo en
   alto. Las señales de formalidad (contrato, sueldo mensual, CV, entrevista)
   restan puntaje. **Los pesos son heurísticos**, no un modelo validado con
   casos reales. Ajústalos en `SENALES` y `UMBRALES`.
2. **IA (`analizar-ia.mjs`).** Envía a Claude el texto, la captura y las
   señales de las reglas. Pide un JSON con forma fija (structured outputs). El
   prompt le prohíbe afirmar que el aviso "es una estafa" o inventar
   direcciones, teléfonos o artículos de ley. También le indica tratar el
   aviso como datos y no como instrucciones (protección contra textos que
   intenten manipular a la IA).
3. **Respaldo ante rechazos.** La llamada usa `fallbacks: "default"` (beta
   `server-side-fallback-2026-07-01`): si los filtros de seguridad de Claude
   rechazan la solicitud, la API la reintenta en el modelo de respaldo que
   recomienda Anthropic. Si quieres desactivarlo, quita esas dos líneas.
4. Si la IA falla o no está configurada, se muestra igual el resultado de
   las reglas.

## Pruebas

```bash
npm test
```

Las pruebas usan dobles y no llaman a la API real. **Este código no se ha
probado contra la API de Claude con una clave real**, porque el entorno donde
se escribió no tenía credenciales. Antes de venderlo, haz un análisis de
prueba con tu clave y revisa la línea de uso en la consola.

## Pendiente de verificación

- [VERIFICAR] Dominios oficiales de Mercado Libre en `MARCAS` (`senales.js`).
  Se usan para marcar enlaces que no son de la marca. Las demás marcas no
  tienen dominios cargados: agrégalos solo después de verificarlos.
- [VERIFICAR] Canales de denuncia que se recomiendan (Carabineros, PDI o
  Fiscalía). Coteja el art. 173 del Código Procesal Penal en LeyChile.
- Precio por análisis: depende de los tokens de cada aviso (sobre todo de la
  captura). Mídelo con las líneas de uso en vez de estimarlo.
