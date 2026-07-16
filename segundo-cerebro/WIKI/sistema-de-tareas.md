# Sistema de tareas

El sistema con que [[patricio-andrades|Patricio]] gestiona sus pendientes.
Vive en este mismo repositorio y tiene tres caras sincronizadas:

1. **App web** (`index.html` en la raíz del repo): lista con filtros,
   prioridades y enlace al correo original de cada tarea.
2. **Gmail**: la etiqueta **«📋 Tarea»** + el Apps Script `gmail-sync.gs`
   alimentan la lista automáticamente; hay recordatorios en Google Calendar y
   borradores de respuesta preparados.
3. **Obsidian**: la bóveda `vault/` (separada de este segundo cerebro), donde
   cada tarea es una nota con casilla. Puente: `node obsidian-sync.js`
   (exportar) / `node obsidian-sync.js import` (importar).

La fuente de datos común es `tasks.seed.js`.

## Regla de reparto

- **Pendiente accionable** → sistema de tareas (app / `vault/`).
- **Conocimiento y contexto** → este segundo cerebro (`WIKI/`).

## Relacionado

- [[metodo-segundo-cerebro]] — dónde va cada cosa.
- [[direccion-juridica-los-vilos]] — de dónde nacen las tareas.
