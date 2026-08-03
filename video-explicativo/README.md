# Video explicativo — "Tu equipo contable con IA"

Video de capacitación sobre los subagentes de contabilidad chilena que viven en
`.claude/agents/`. Explica qué hace cada uno, qué documentos necesitan y cuáles
son sus límites.

| | |
|---|---|
| **Archivo** | `equipo-contable-ia.mp4` |
| **Duración** | 1 min 34 s |
| **Resolución** | 1920 × 1080, 30 fps |
| **Peso** | 6 MB |
| **Audio** | Sin voz en off ni música (explicativo de texto animado) |

## Contenido

| # | Escena | Segundo |
|---|---|---|
| 1 | Título | 0 |
| 2 | Cómo se usa, con un ejemplo de mensaje | 7 |
| 3 | Los siete especialistas | 19 |
| 4 | Los tres documentos que necesita | 36 |
| 5 | La fórmula: Cliente + Período + Qué necesitas | 51 |
| 6 | "Nunca inventa una cifra" y la marca `[FALTA: ...]` | 61 |
| 7 | Lo que no hace (los tres límites) | 74 |
| 8 | Cierre | 86 |

## Cómo editarlo y volver a generarlo

El video se arma desde `index.html`: un solo archivo HTML donde cada escena es
una `<section class="clip">` con su segundo de inicio y su duración. Para
cambiar un texto, se edita ahí y se vuelve a renderizar — no hay que rehacer
nada desde cero.

Se genera con [HyperFrames](https://hyperframes.heygen.com), el motor de video
de HeyGen que renderiza a partir de HTML.

### Requisitos

- Node.js 22 o superior
- FFmpeg (`sudo apt-get install -y ffmpeg` en Ubuntu/Debian)
- El navegador de render: `npx hyperframes browser ensure` (se descarga una vez)

### Comandos

```bash
cd video-explicativo

npm run check     # valida diseño, animación, layout y contraste
npm run dev       # abre la vista previa en el navegador
npm run render    # genera equipo-contable-ia.mp4
```

`npm run check` debe pasar sin errores antes de renderizar. Verifica, entre
otras cosas, que ningún texto se salga del cuadro y que todos los contrastes
cumplan accesibilidad AA.

El render tarda unos 5 minutos por minuto de video en un equipo sin aceleración
gráfica.

## Estructura

| Archivo | Rol |
|---|---|
| `index.html` | La composición completa: textos, estilos y línea de tiempo |
| `assets/gsap.min.js` | Librería de animación, incluida localmente para poder renderizar sin conexión |
| `hyperframes.json` | Configuración del proyecto |
| `equipo-contable-ia.mp4` | El video ya renderizado |

## Pendientes posibles

- **Voz en off y música**: requieren credenciales de HeyGen o de un servicio de
  voz. El motor las soporta (`npx hyperframes tts`), solo falta configurarlas.
- **Versión vertical** para celular o redes: se cambia `data-width="1080"` y
  `data-height="1920"` en la raíz de `index.html` y se ajustan los tamaños de
  texto.
