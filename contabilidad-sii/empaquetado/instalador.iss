; Instalador de Mi Contabilidad para Windows (Inno Setup 6).
; Se compila en GitHub Actions: ver .github/workflows/instalador-windows.yml
;   ISCC.exe /DSourceDir=<carpeta dist\MiContabilidad> /DMyAppVersion=0.1.0 /O<salida> instalador.iss
;
; Se instala para el usuario actual, sin pedir permisos de administrador.
; Los datos NO quedan en la carpeta del programa sino en Documentos\Mi Contabilidad,
; por lo que desinstalar o actualizar no borra la contabilidad.

#define MyAppName "Mi Contabilidad"
#define MyAppExe "MiContabilidad.exe"
#ifndef MyAppVersion
  #define MyAppVersion "0.1.0"
#endif
#ifndef SourceDir
  #define SourceDir "..\dist\MiContabilidad"
#endif

[Setup]
AppId={{23645CFF-1E31-426E-942E-B0C83C563A9A}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
DefaultDirName={localappdata}\Programs\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
DisableDirPage=yes
PrivilegesRequired=lowest
OutputBaseFilename=Instalar-MiContabilidad
SetupIconFile=icono.ico
UninstallDisplayIcon={app}\{#MyAppExe}
UninstallDisplayName={#MyAppName}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "escritorio"; Description: "Crear un acceso directo en el Escritorio"; GroupDescription: "Accesos directos:"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExe}"; Tasks: escritorio

[Run]
Filename: "{app}\{#MyAppExe}"; Description: "Abrir {#MyAppName} ahora"; Flags: nowait postinstall skipifsilent

[Messages]
spanish.FinishedLabel=La instalación terminó. Para abrir el programa use el acceso directo «Mi Contabilidad» del Escritorio o del menú Inicio. Sus datos se guardarán en Documentos\Mi Contabilidad.
