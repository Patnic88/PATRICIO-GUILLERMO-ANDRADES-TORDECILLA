# Mesa de trading multi-agente — Prompt maestro

`PROMPT_MAESTRO.md` es un prompt que se pega en Claude Code y que construye, por fases:

- **Capa A (equipo de construcción):** 9 subagentes y 8 skills de Claude Code que diseñan, programan y auditan el sistema.
- **Capa B (la mesa):** un servicio 24/7 con 6 agentes runtime y «la Sala», un chat en vivo donde se ve a los agentes conversar, como en el video del post.

Los agentes runtime son ATLAS, ORION, TITAN y NOVA, que vienen del post, más VEGA y LYRA, que son propuestas mías porque el post no describe los otros dos.

## Cómo usarlo

1. Abre Claude Code en un repositorio nuevo o vacío.
2. Si quieres, rellena las variables `{{…}}` del bloque 0. Si no, Claude Code pregunta las que no tienen valor por defecto.
3. Pega todo el contenido de `PROMPT_MAESTRO.md`.
4. Claude Code se detiene en tres puntos para esperar tu respuesta:
   - **Fase 0:** confirmación del plan y de los parámetros.
   - **Fase 1:** revisión de `docs/FUENTES.md`, con direcciones, endpoints y modelos verificados.
   - **Fase 9:** auditoría de seguridad. El modo LIVE (dinero real) lo activas tú; el prompt le prohíbe a Claude hacerlo.

## Decisiones de diseño

| Decisión | Por qué |
|---|---|
| «El LLM propone, el código dispone» | Un modelo de lenguaje puede alucinar o ser manipulado. Los límites de dinero deben vivir en código con tests, no en un prompt. |
| PAPER obligatorio + 4 condiciones para LIVE | Evita operar con dinero real antes de medir el sistema. |
| Datos on-chain tratados como no confiables | Cualquiera puede crear un token cuyo nombre sea una instrucción dirigida al LLM (inyección de prompt). |
| NOVA y VEGA con veto y fail-closed | Si falta un dato, no se opera. |
| Direcciones y endpoints solo desde fuentes oficiales | Una dirección de router equivocada puede significar perder los fondos. |
| LLM solo en eventos | Llamar a un modelo en cada bloque, 24/7, tiene un costo alto. El escaneo es código. |
| Libro auxiliar CSV | Deja la trazabilidad lista para la revisión contable y tributaria. |

## Estado de verificación del contexto (consulta del 2026-10-09)

- **Robinhood Chain existe y está en mainnet pública desde el 1-jul-2026.** Es una L2 sobre Arbitrum, EVM, con gas en ETH. Fuente secundaria: Cointelegraph y otros medios.
- **Chain ID 4663 (mainnet) / 46630 (testnet), RPC oficial y explorador Blockscout.** Fuentes secundarias: guías de Chainstack y Quicknode. No pude abrir la documentación oficial (`docs.robinhood.com/chain`), así que el prompt obliga a confirmarla en la Fase 1.
- **$RBNX, el token del post.** Un resultado de búsqueda lo asocia a «Robynite (RBNX)», un token de terceros sin afiliación con Robinhood, con una liquidez reportada de unos USD 93. **No pude abrir la página (DexPaprika) para confirmarlo.** Ese dato salió de un resumen de búsqueda y es una foto de un momento dado. Si es correcto, ese pool no soportaría las operaciones del tamaño que sugiere el post.
- **Resultado del post (46 operaciones, +$4.955).** No es verificable: no hay wallet, transacciones ni costos publicados.

## Qué personalizar

- Los límites del bloque 0. Los valores por defecto son una propuesta conservadora mía, no un estándar.
- Los nombres de VEGA y LYRA.
- El canal de alertas (Telegram o correo).
- Dónde corre 24/7: un VPS o un PC siempre encendido.

## Fuentes consultadas (secundarias)

- [Cointelegraph — Robinhood public blockchain mainnet launch](https://cointelegraph.com/news/robinhood-public-blockchain-mainnet-launch)
- [ArbitrumDAO Factsheet: Robinhood Chain Mainnet Launch](https://forum.arbitrum.foundation/t/arbitrumdao-factsheet-robinhood-chain-mainnet-launch/31041) — no se pudo abrir desde este entorno
- [Chainstack — Robinhood tooling](https://docs.chainstack.com/docs/robinhood-tooling)
- [Quicknode — What is Robinhood Chain](https://www.quicknode.com/guides/robinhood/what-is-robinhood-chain)
- [Blockscout — Robinhood API](https://docs.blockscout.com/robinhood-api)
- [DexPaprika — Robynite (RBNX)](https://dexpaprika.com/robinhood/token/0x93981539f9023d429b41e364abdfb3067430c6dd) — no se pudo abrir desde este entorno
