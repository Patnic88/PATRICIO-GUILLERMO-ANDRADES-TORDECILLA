---
description: Reporte de fallos de la Corte de Apelaciones de La Serena en modo navegador (Claude en Chrome), con el rol de cada sentencia
argument-hint: "[desde AAAA-MM-DD] [hasta AAAA-MM-DD]"
---

Ejecuta el agente de jurisprudencia de la Corte de Apelaciones de La Serena en
**modo navegador**, siguiendo `agente-jurisprudencia-serena/SKILL.md`
(secciones «Modo navegador» y «Rol obligatorio»).

- **Período:** $ARGUMENTS. Si está vacío, los 7 días completos anteriores a hoy
  (hora de Chile).
- **Carpetas:** entrada `salidas/navegador/<hoy>`; salida
  `salidas/jurisprudencia-serena/<hoy>`.
- **CAPTCHA o reCAPTCHA:** detente y pídeme que lo resuelva en la pestaña. No
  intentes resolverlo tú.
- **Notas:** abre solo las que indique `--por-leer`, con unos 15 segundos entre una
  y otra.
- **Rol:** para cada fallo sin rol, busca su sentencia en el Portal Unificado con
  las frases del reporte, guárdala como `sentencia-<nota>.txt` (o `.pdf`) en la
  carpeta de entrada y vuelve a procesar la carpeta. Si el agente la rechaza,
  muéstrame el motivo; no fuerces el rol.
- **Carruseles:** escribe los de los recomendados, valídalos y recompón el reporte.
- **Entrega:** si esta sesión tiene Gmail, envíame el reporte; si no, dime la ruta
  de `reporte.html`.
