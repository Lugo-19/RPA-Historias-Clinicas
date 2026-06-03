; ============================================================
;  installer.iss — Inno Setup 6
;  Empaqueta la carpeta dist\ en un único RPA-HCHealth-Setup.exe.
;  Compilar con build.ps1 (o: ISCC.exe build\installer.iss).
;  Las rutas son relativas a la ubicación de este .iss (carpeta build\).
; ============================================================

#define AppName    "RPA HCHealth"
#define AppVersion "1.0.0"
#define AppExe     "RPA-HCHealth.exe"

[Setup]
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=QA Automatization
DefaultDirName={autopf}\RPA-HCHealth
DefaultGroupName=RPA HCHealth
DisableProgramGroupPage=yes
; El entregable final (un solo archivo) sale en la carpeta release\
OutputDir=..\release
OutputBaseFilename=RPA-HCHealth-Setup
Compression=lzma2
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64compatible
; Pesa cientos de MB (Chromium); no exigir admin si se instala por usuario
PrivilegesRequiredOverridesAllowed=dialog

[Languages]
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"

[Files]
; Copia TODA la carpeta dist\ (RPA-HCHealth.exe, reporte.exe, browser\, config.json, LEEME.txt)
Source: "..\dist\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\RPA HCHealth";        Filename: "{app}\{#AppExe}"; WorkingDir: "{app}"
Name: "{autodesktop}\RPA HCHealth";  Filename: "{app}\{#AppExe}"; WorkingDir: "{app}"; Tasks: desktopicon
Name: "{group}\Editar configuración"; Filename: "notepad.exe"; Parameters: """{app}\config.json"""

[Tasks]
Name: "desktopicon"; Description: "Crear acceso directo en el Escritorio"; GroupDescription: "Accesos directos:"

[Run]
Filename: "notepad.exe"; Parameters: """{app}\config.json"""; Description: "Editar configuración (BD, URL, paciente) ahora"; Flags: postinstall skipifsilent unchecked
Filename: "{app}\{#AppExe}"; Description: "Ejecutar el RPA ahora"; WorkingDir: "{app}"; Flags: postinstall skipifsilent nowait unchecked
