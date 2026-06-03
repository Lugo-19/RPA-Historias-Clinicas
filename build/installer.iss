; ============================================================
;  installer.iss - Inno Setup 6
;  Empaqueta la carpeta dist\ en un unico RPA-HCHealth-Setup.exe.
;  Compilar con build.ps1 (o: ISCC.exe build\installer.iss).
;  Las rutas son relativas a la ubicacion de este .iss (carpeta build\).
;  NOTA: guardar este archivo en UTF-8 CON BOM (build.ps1 lo reescribe asi)
;  para que los acentos del nombre se vean bien.
; ============================================================

#define AppName    "RPA Historias Clínicas"
#define AppVersion "1.0.0"
#define AppExe     "RPA-HCHealth.exe"

[Setup]
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=QA Automatization
; Carpeta de instalacion (sin acentos para evitar problemas de ruta)
DefaultDirName={autopf}\RPA Historias Clinicas
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
; El entregable final (un solo archivo) sale en la carpeta release\
OutputDir=..\release
OutputBaseFilename=RPA-HCHealth-Setup
Compression=lzma2
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64compatible
; Icono del instalador y de la entrada en "Programas y caracteristicas".
; Solo se aplica si existe build\icono.ico (lo genera build.ps1 desde icono.png).
#if FileExists(SourcePath + "icono.ico")
SetupIconFile=icono.ico
#endif
UninstallDisplayIcon={app}\icono.ico
; Pesa cientos de MB (Chromium); no exigir admin si se instala por usuario
PrivilegesRequiredOverridesAllowed=dialog

[Languages]
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"

[Files]
; Copia TODA la carpeta dist\ (RPA-HCHealth.exe, reporte.exe, browser\, config.json, LEEME.txt)
Source: "..\dist\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\{#AppName}";        Filename: "{app}\{#AppExe}"; WorkingDir: "{app}"; IconFilename: "{app}\icono.ico"
Name: "{autodesktop}\{#AppName}";  Filename: "{app}\{#AppExe}"; WorkingDir: "{app}"; Tasks: desktopicon; IconFilename: "{app}\icono.ico"
Name: "{group}\Editar configuración"; Filename: "notepad.exe"; Parameters: """{app}\config.json"""

[Tasks]
Name: "desktopicon"; Description: "Crear acceso directo en el Escritorio"; GroupDescription: "Accesos directos:"

[Run]
Filename: "notepad.exe"; Parameters: """{app}\config.json"""; Description: "Editar configuración (BD, URL, paciente) ahora"; Flags: postinstall skipifsilent unchecked
Filename: "{app}\{#AppExe}"; Description: "Ejecutar el RPA ahora"; WorkingDir: "{app}"; Flags: postinstall skipifsilent nowait unchecked
