# 📋 Tablero de Tareas

> Patricio Andrades · Dirección Jurídica — Municipalidad de Los Vilos

**10** pendientes · **0** completadas · **10** en total

_Este tablero se genera con `node obsidian-sync.js`. No lo edites a mano: edita cada tarea o vuelve a exportar._

## ⏫ Prioridad alta

- [[Tareas/subir-al-sistema-el-recurso-de-proteccion-revisado-vence-el|Subir al sistema el recurso de protección revisado (vence el plazo)]] — Judicial · 📅 2026-05-29
- [[Tareas/transparencia-activa-mayo-2026-juicios-vigentes-informes-en|Transparencia Activa Mayo 2026: juicios vigentes + informes en derecho]] — Transparencia · 📅 2026-06-09
- [[Tareas/elaborar-borrador-de-convenio-de-laboratorio-con-el-servicio|Elaborar borrador de convenio de laboratorio con el Servicio de Salud Coquimbo (HLV)]] — Convenios
- [[Tareas/consultar-en-el-cbr-el-estado-del-documento-de-prohibicion-e|Consultar en el CBR el estado del documento de prohibición e informar fecha tentativa]] — Judicial
- [[Tareas/finalizar-contestacion-de-la-demanda-causa-rol-c-114-2026|Finalizar contestación de la demanda Causa Rol C-114-2026]] — Judicial

## 🔼 Prioridad media

- [[Tareas/contestar-fiscalizacion-horas-de-incidentes-sesion-ordinaria|Contestar fiscalización — Horas de Incidentes, Sesión Ordinaria N°53]] — Concejo
- [[Tareas/verificar-funcionario-aludido-en-rex-n-15445-2026-y-solicita|Verificar funcionario aludido en Rex N°15445/2026 y solicitar antecedentes a RR.HH.]] — Administrativo
- [[Tareas/informar-funcionarios-de-la-direccion-juridica-con-poliza-de|Informar funcionarios de la Dirección Jurídica con póliza de conducción autorizada]] — Administrativo
- [[Tareas/revisar-notificacion-de-litigante-causa-rit-o-3-2026|Revisar notificación de litigante — causa RIT O-3-2026]] — Judicial

## 🔽 Prioridad baja

- [[Tareas/revisar-tema-de-patentes-rectificacion-de-escritura-de-compr|Revisar tema de patentes (rectificación de escritura de compraventa)]] — Administrativo

---

## 🔎 Consultas dinámicas (opcionales)

Si instalas el plugin **Tasks**, esta consulta reúne todas las casillas pendientes de la bóveda:

```tasks
not done
path includes Tareas
sort by priority
```

Si instalas el plugin **Dataview**, esta tabla lista las tareas por prioridad:

```dataview
TABLE prioridad AS "Prioridad", categoria AS "Categoría", vence AS "Vence"
FROM "Tareas"
WHERE hecha = false
SORT prioridad ASC, vence ASC
```
