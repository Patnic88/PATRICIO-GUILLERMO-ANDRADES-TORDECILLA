# 🤖 Supervisor de Codex

Una herramienta sencilla para **lanzar el agente Codex** (la CLI de IA de OpenAI)
sobre tus tareas y **supervisar** su ejecución desde tu computador: lo arranca con
la instrucción que le des, guarda todo lo que hace, lo reintenta si falla y deja un
historial de cada ejecución.

No tiene dependencias raras: solo necesitas **Node.js** (para correr el supervisor)
y la **CLI de Codex** (el agente que hará el trabajo).

---

## ¿Qué es esto exactamente?

| Pieza | Qué es |
|---|---|
| **Codex** | El agente de IA que escribe/edita código por ti, desde la terminal. Lo instala OpenAI. |
| **Supervisor** | Este pequeño programa. *No* reemplaza a Codex: lo **dirige y vigila**. |

El supervisor se encarga de lo aburrido y frágil: ejecutar a Codex, capturar sus
registros, cortar si se cuelga, reintentar si falla y anotar qué pasó. Tú solo le
dices *qué_ quieres que haga.

---

## 1. Requisitos (instalar una sola vez)

### a) Node.js
Descárgalo de <https://nodejs.org> (versión LTS). Para comprobar que quedó bien,
abre una terminal y escribe:
```
node --version
```
Debe mostrar un número como `v20.x` o superior.

### b) La CLI de Codex
Sigue la guía oficial de OpenAI para instalar y **autenticar** Codex en tu equipo:
<https://developers.openai.com/codex/cli> (también suele instalarse con
`npm install -g @openai/codex`). Para comprobarlo:
```
codex --version
```
> Si este comando no funciona, el supervisor te lo avisará y no reintentará en
> vano: primero hay que dejar Codex operativo.

---

## 2. Cómo usarlo

Abre una terminal **dentro de esta carpeta** (`codex-supervisor`).

### Opción rápida (una tarea):
- **Windows:** doble clic en `supervisor.bat`, o en la terminal:
  ```
  supervisor.bat "Corrige los errores de ortografía del README"
  ```
- **macOS / Linux:**
  ```
  ./supervisor.sh "Corrige los errores de ortografía del README"
  ```
- **Cualquier sistema (directo con Node):**
  ```
  node supervisor.js "Corrige los errores de ortografía del README"
  ```

> La primera vez en Mac/Linux quizá tengas que dar permiso de ejecución:
> `chmod +x supervisor.sh`

### Varias tareas de una vez (cola):
Crea un archivo de texto con **una tarea por línea** (puedes partir del ejemplo
`tareas.ejemplo.txt`) y pásalo así:
```
node supervisor.js --file tareas.txt
```
El supervisor las irá ejecutando una tras otra y reintentando las que fallen.

### Ayuda:
```
node supervisor.js --help
```

---

## 3. Qué genera

Al ejecutarse, el supervisor crea (y no versiona) estos archivos:

| Archivo / carpeta | Para qué sirve |
|---|---|
| `logs/` | Un registro completo por cada ejecución (lo que dijo e hizo Codex). |
| `history.json` | Resumen de cada tarea: cuándo, cuántos intentos, si tuvo éxito. |
| `config.json` | La configuración (se crea sola la primera vez; edítala a tu gusto). |

---

## 4. Configuración (`config.json`)

Se crea automáticamente la primera vez. Estos son los ajustes:

| Ajuste | Significado | Por defecto |
|---|---|---|
| `codexCommand` | El comando de la CLI de Codex. | `"codex"` |
| `codexArgs` | Argumentos para correr sin preguntar. | `["exec"]` |
| `maxRetries` | Cuántas veces reintentar si falla. | `3` |
| `retryBackoffSeconds` | Espera entre reintentos (creciente). | `[10, 30, 60]` |
| `timeoutMinutes` | Si tarda más, se considera colgado y se corta. | `30` |
| `workingDir` | Carpeta donde Codex trabaja (relativa a esta). | `".."` (la raíz de tu proyecto) |

> **Importante:** por defecto `workingDir` es `".."`, es decir, la carpeta que
> contiene a `codex-supervisor`. Así Codex trabaja sobre tu proyecto principal. Si
> quieres que opere en otro lugar, pon ahí la ruta de esa carpeta.

---

## 5. Preguntas frecuentes

**¿Esto le da acceso a Codex a toda mi máquina?**
No más de lo que Codex ya tiene por sí solo: el supervisor solo lo lanza en la
carpeta `workingDir`. Revisa siempre lo que Codex propone antes de aceptar cambios
importantes; el modo `exec` está pensado para tareas acotadas.

**¿Por qué a veces reintenta?**
Las fallas de red o errores temporales son comunes. El supervisor espera y vuelve a
intentar, en vez de rendirse al primer tropiezo. Si Codex no está instalado, *no*
reintenta (sería inútil) y te lo dice.

**¿Puedo programarlo para que corra solo?**
Sí: puedes invocar `node supervisor.js --file tareas.txt` desde el Programador de
tareas de Windows o desde `cron` en Mac/Linux. Pero revisa los resultados en
`logs/` antes de confiar en una automatización desatendida.
