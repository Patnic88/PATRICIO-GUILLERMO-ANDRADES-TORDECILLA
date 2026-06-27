@echo off
REM Lanzador del Supervisor de Codex para Windows.
REM Uso:
REM   supervisor.bat "Tu instruccion para Codex"
REM   supervisor.bat --file tareas.txt
REM Si lo abres con doble clic (sin argumentos), te pide la tarea por teclado.
setlocal

where node >nul 2>nul
if errorlevel 1 (
  echo No encuentro Node.js. Instalalo desde https://nodejs.org y vuelve a intentar.
  pause
  exit /b 1
)

set "DIR=%~dp0"

if "%~1"=="" (
  set /p TASK="Que tarea le doy a Codex? "
  node "%DIR%supervisor.js" "%TASK%"
  pause
  exit /b %errorlevel%
)

node "%DIR%supervisor.js" %*
exit /b %errorlevel%
