# Bibliotecas incluidas

`anthropic-sdk-0.127.0.js` es el SDK oficial de Anthropic para JavaScript
(`@anthropic-ai/sdk`, versión 0.127.0, licencia MIT, ver
`LICENSE-anthropic-sdk.txt`), empaquetado en un solo archivo para que la app
funcione sin servidor ni instalación. Expone `window.AnthropicSDK`.

Cómo se generó (para actualizarlo):

```bash
npm install @anthropic-ai/sdk@0.127.0 esbuild@0.25.10
echo 'import Anthropic from "@anthropic-ai/sdk"; globalThis.AnthropicSDK = Anthropic;' > entrada.mjs
npx esbuild entrada.mjs --bundle --minify --format=iife --platform=browser \
  --target=es2020 --legal-comments=eof --outfile=anthropic-sdk-0.127.0.js
```
