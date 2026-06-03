# ===========================================================
#  build.ps1 - Empaqueta el RPA HCHealth en un entregable autonomo
#  Produce dist\ (RPA-HCHealth.exe + reporte.exe + browser\ + config.json)
#  y, si Inno Setup esta instalado, release\RPA-HCHealth-Setup.exe.
#
#  Uso:  npm run build   (o)   powershell -ExecutionPolicy Bypass -File build\build.ps1
#  Requisitos en la maquina de BUILD (no en la del usuario final):
#    - Node 22 + npm           (bundle del RPA con @yao-pkg/pkg)
#    - Python 3.12 + PyInstaller + openpyxl + Pillow   (bundle del reporte)
#    - Playwright Chromium ya instalado (npx playwright install chromium)
#    - Inno Setup 6 (opcional, para generar el instalador)
#  NOTA: archivo en ASCII puro a proposito (PowerShell 5.1 corrompe no-ASCII).
# ===========================================================
$ErrorActionPreference = 'Stop'
$proj = Split-Path -Parent $PSScriptRoot      # raiz del proyecto
$dist = Join-Path $proj 'dist'
Set-Location $proj

Write-Host "== RPA HCHealth - build ==" -ForegroundColor Cyan
Write-Host "Proyecto: $proj"

# Limpiar/crear dist
if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
New-Item -ItemType Directory -Path $dist | Out-Null

# 0. Dependencias Node
if (-not (Test-Path (Join-Path $proj 'node_modules'))) {
  Write-Host "`n[0/5] npm install..." -ForegroundColor Yellow
  npm install
}

# 1. Bundle del RPA (Node -> .exe) con @yao-pkg/pkg
Write-Host "`n[1/5] Empaquetando rpa.js con @yao-pkg/pkg..." -ForegroundColor Yellow
npx --yes @yao-pkg/pkg . --targets node22-win-x64 --output (Join-Path $dist 'RPA-HCHealth.exe')
if (-not (Test-Path (Join-Path $dist 'RPA-HCHealth.exe'))) { throw "pkg no genero el .exe" }

# 2. Bundle del reporte (Python -> reporte.exe)
Write-Host "`n[2/5] Empaquetando reporte.py con PyInstaller..." -ForegroundColor Yellow
$pyi = (Get-Command pyinstaller -ErrorAction SilentlyContinue)
if ($null -eq $pyi) {
  Write-Warning "PyInstaller no esta instalado. Instalalo: pip install pyinstaller openpyxl Pillow"
  throw "Falta PyInstaller"
}
pyinstaller --onefile --name reporte `
  --hidden-import openpyxl --hidden-import PIL `
  --distpath $dist `
  --workpath (Join-Path $PSScriptRoot '_pyi_work') `
  --specpath (Join-Path $PSScriptRoot '_pyi_spec') `
  (Join-Path $proj 'reporte.py')
if (-not (Test-Path (Join-Path $dist 'reporte.exe'))) { throw "PyInstaller no genero reporte.exe" }

# 3. Copiar Chromium de Playwright
Write-Host "`n[3/5] Copiando Chromium de Playwright..." -ForegroundColor Yellow
$chromeExe = node -e "console.log(require('playwright').chromium.executablePath())"
if (-not (Test-Path $chromeExe)) {
  throw "No se encontro Chromium. Ejecuta: npx playwright install chromium"
}
# executablePath = ...\ms-playwright\chromium-XXXX\chrome-winNN\chrome.exe
# Copiamos la carpeta chromium-XXXX completa a dist\browser\
$chromiumRoot = Split-Path -Parent (Split-Path -Parent $chromeExe)   # ...\chromium-XXXX
$browserDest  = Join-Path $dist 'browser'
New-Item -ItemType Directory -Path $browserDest | Out-Null
Copy-Item $chromiumRoot -Destination $browserDest -Recurse
Write-Host ("  Chromium copiado: " + (Split-Path -Leaf $chromiumRoot))

# 4. Archivos de configuracion y ayuda
Write-Host "`n[4/5] Copiando config.json y LEEME..." -ForegroundColor Yellow
Copy-Item (Join-Path $proj 'config.json.example') (Join-Path $dist 'config.json')
Copy-Item (Join-Path $proj 'LEEME.txt')           (Join-Path $dist 'LEEME.txt') -ErrorAction SilentlyContinue

# 5. Instalador con Inno Setup (opcional)
Write-Host "`n[5/5] Generando instalador (Inno Setup)..." -ForegroundColor Yellow
$iscc = @(
  "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
  "C:\Program Files\Inno Setup 6\ISCC.exe",
  (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe')
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($iscc) {
  & $iscc (Join-Path $PSScriptRoot 'installer.iss')
  Write-Host "  Instalador generado en release\RPA-HCHealth-Setup.exe" -ForegroundColor Green
} else {
  Write-Warning "Inno Setup no encontrado. La carpeta dist\ ya es portatil (comprimela en .zip)."
  Write-Warning "Para el instalador instala Inno Setup 6: https://jrsoftware.org/isdl.php"
}

Write-Host "`n== Listo. Entregable en: $dist ==" -ForegroundColor Cyan
