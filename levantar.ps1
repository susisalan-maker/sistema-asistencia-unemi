# Levanta el proyecto en esta computadora (Windows PowerShell).
# Uso (desde la raiz del repositorio):
#   powershell -ExecutionPolicy Bypass -File .\levantar.ps1            -> microservicio + panel web
#   powershell -ExecutionPolicy Bypass -File .\levantar.ps1 -Movil     -> ademas la app movil (Expo)
param([switch]$Movil)
$ErrorActionPreference = 'Stop'
$raiz = $PSScriptRoot
$ms   = Join-Path $raiz 'backend\ia-microservicio'
$web  = Join-Path $raiz 'frontend\panel-web'
$mov  = Join-Path $raiz 'frontend\app-movil'

function Fallar($m) { Write-Host "ERROR: $m" -ForegroundColor Red; exit 1 }
function Existe($c) { [bool](Get-Command $c -ErrorAction SilentlyContinue) }

# 1) Programas
foreach ($c in 'git','node','npm') { if (-not (Existe $c)) { Fallar "Falta instalar $c" } }
$py = $null
foreach ($c in 'python','py') {
  if (Existe $c) {
    & $c -c "import sys; sys.exit(0 if sys.version_info >= (3,11) else 1)" 2>$null
    if ($LASTEXITCODE -eq 0) { $py = $c; break }
  }
}
if (-not $py) { Fallar 'Falta Python 3.11 o superior (python --version)' }
Write-Host "Node $(node -v) | Python OK ($py)" -ForegroundColor Green

# 2) Archivos .env
$carpetas = @($ms, $web) ; if ($Movil) { $carpetas += $mov }
$envs = @((Join-Path $ms '.env'), (Join-Path $web '.env.local')) ; if ($Movil) { $envs += (Join-Path $mov '.env.local') }
foreach ($e in $envs) { if (-not (Test-Path $e)) { Fallar "Falta el archivo $e (copia el .env.example de esa carpeta y completalo)" } }
$clave = (Select-String -Path (Join-Path $ms '.env') -Pattern '^SUPABASE_SERVICE_ROLE_KEY=(.+)$').Matches
if (-not $clave) { Fallar 'Falta SUPABASE_SERVICE_ROLE_KEY en backend\ia-microservicio\.env' }

# 3) Dependencias
Write-Host '--- Microservicio: entorno de Python y dependencias' -ForegroundColor Cyan
Push-Location $ms
if (-not (Test-Path '.venv\Scripts\python.exe')) { & $py -m venv .venv; if ($LASTEXITCODE -ne 0) { Fallar 'No se pudo crear .venv' } }
& .\.venv\Scripts\python.exe -m pip install -q -r requirements.txt
if ($LASTEXITCODE -ne 0) { Fallar 'pip install fallo' }

# Modelos faciales (~15 MB, solo la primera vez) y clave de cifrado de los rostros
& .\.venv\Scripts\python.exe scripts\descargar_modelos.py
if ($LASTEXITCODE -ne 0) { Fallar 'No se pudieron descargar los modelos faciales (scripts\descargar_modelos.py)' }
$envMs = Join-Path $ms '.env'
$tieneClave = Select-String -Path $envMs -Pattern '^ROSTRO_CLAVE_AES=.+$' -Quiet
$simulada = Select-String -Path $envMs -Pattern '^VERIFICACION_FACIAL=simulada' -Quiet
if (-not $tieneClave -and -not $simulada) {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $nueva = ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
  $lineas = @(Get-Content -Path $envMs | Where-Object { $_ -notmatch '^ROSTRO_CLAVE_AES=\s*$' })
  $lineas += "ROSTRO_CLAVE_AES=$nueva"
  Set-Content -Path $envMs -Value $lineas
  Write-Host 'Se genero ROSTRO_CLAVE_AES en backend\ia-microservicio\.env (no se muestra). Guardala aparte: si la pierdes, todos deben registrar su rostro de nuevo.' -ForegroundColor Yellow
}
$tieneProc = Select-String -Path $envMs -Pattern '^PROCESOS_SECRETO=.+$' -Quiet
if (-not $tieneProc) {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $nuevo = ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
  $lineas = @(Get-Content -Path $envMs | Where-Object { $_ -notmatch '^PROCESOS_SECRETO=\s*$' })
  $lineas += "PROCESOS_SECRETO=$nuevo"
  Set-Content -Path $envMs -Value $lineas
  Write-Host 'Se genero PROCESOS_SECRETO en backend\ia-microservicio\.env (no se muestra). Autoriza al proceso de ausencias (POST /procesos/ausencias).' -ForegroundColor Yellow
}
Pop-Location

Write-Host '--- Panel web: npm install' -ForegroundColor Cyan
Push-Location $web ; npm install --no-audit --no-fund ; if ($LASTEXITCODE -ne 0) { Fallar 'npm install (panel web) fallo' } ; Pop-Location

if ($Movil) {
  Write-Host '--- App movil: npm install' -ForegroundColor Cyan
  Push-Location $mov ; npm install --no-audit --no-fund ; if ($LASTEXITCODE -ne 0) { Fallar 'npm install (app movil) fallo' } ; Pop-Location
}

# 4) Abrir cada proceso en su propia ventana (dejalas abiertas)
Start-Process powershell -ArgumentList '-NoExit','-Command',"Set-Location '$ms'; .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
Start-Process powershell -ArgumentList '-NoExit','-Command',"Set-Location '$web'; npm run dev"
if ($Movil) { Start-Process powershell -ArgumentList '-NoExit','-Command',"Set-Location '$mov'; npx expo start -c" }

Write-Host ''
Write-Host 'Listo. Comprueba:' -ForegroundColor Green
Write-Host '  Microservicio: http://localhost:8000/health  (debe decir {"estado":"ok"})'
Write-Host '  Panel web:     http://localhost:5173'
if ($Movil) { Write-Host '  Movil: escanea el QR de la ventana de Expo (necesitas haber hecho npx expo login)' }
