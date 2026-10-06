# Prueba de humo del programa empaquetado: lo abre, recorre el flujo del mes con
# los datos ficticios de ejemplos/ y verifica el total del F29 y la descarga a Excel.
param(
    [Parameter(Mandatory = $true)] [string] $Exe,
    [int] $Puerto = 8799,
    [string] $Carpeta = "",
    [switch] $EsperarDocumentos
)
$ErrorActionPreference = "Stop"
$base = "http://127.0.0.1:$Puerto"
$ejemplos = Join-Path $PSScriptRoot "..\ejemplos"
$argumentos = @("--no-abrir", "--puerto", "$Puerto")
if ($Carpeta) { $argumentos += @("--carpeta", "`"$Carpeta`"") }

$log = Join-Path $env:RUNNER_TEMP "contasii-$Puerto.log"
$proc = Start-Process -FilePath $Exe -ArgumentList $argumentos -PassThru `
    -RedirectStandardOutput $log -RedirectStandardError "$log.err"
try {
    $listo = $false
    for ($i = 0; $i -lt 60; $i++) {
        try { if ((Invoke-RestMethod "$base/api/ping").app -eq "contasii") { $listo = $true; break } } catch { }
        Start-Sleep -Milliseconds 500
    }
    if (-not $listo) {
        Get-Content $log, "$log.err" -ErrorAction SilentlyContinue
        throw "El programa no respondió en $base"
    }
    $h = @{ "X-Contasii" = "1" }
    function Post($ruta, $obj) {
        Invoke-RestMethod -Method Post -Uri "$base/api/$ruta" -Headers $h `
            -ContentType "application/json; charset=utf-8" -Body ($obj | ConvertTo-Json -Depth 5)
    }
    $emp = Post "empresa" @{ rut = "76111111-6"; nombre = "EMPRESA DEMO (FICTICIA)"; regimen = "14D3"; tipo = "empresa" }
    $e = "e/$($emp.archivo)"
    foreach ($f in "rcv_compras_2026-10.csv", "rcv_ventas_2026-10.csv", "honorarios_recibidos_2026-10.csv") {
        $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $ejemplos $f)))
        $r = Post "$e/importar" @{ contenido = $b64; periodo = "2026-10"; nombre = $f }
        Write-Host "$f -> $($r.importados) documentos"
    }
    $f29 = Invoke-RestMethod "$base/api/$e/f29?periodo=2026-10"
    Write-Host "F29 total: $($f29.total)  vence: $($f29.vencimiento)"
    if ($f29.total -ne 1005875) { throw "Total F29 inesperado: $($f29.total)" }
    $x = Invoke-WebRequest "$base/api/$e/excel?periodo=2026-10"
    if ($x.StatusCode -ne 200 -or $x.Content[0] -ne 80 -or $x.Content[1] -ne 75) { throw "La descarga a Excel falló" }
    Write-Host "Excel: $($x.Content.Length) bytes"
    $c = (Invoke-RestMethod "$base/api/carpeta").carpeta
    Write-Host "Carpeta de datos: $c"
    if ($EsperarDocumentos -and ($c -notlike "*Documents*Mi Contabilidad*")) { throw "Carpeta de datos inesperada: $c" }
    if (-not (Test-Path (Join-Path $c "76111111-6.db"))) { throw "No se creó la base de datos en $c" }
    Write-Host "PRUEBA DE HUMO OK"
}
finally {
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
}
