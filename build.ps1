# Compile Fief et prépare tout ce qui se distribue.
#   powershell -ExecutionPolicy Bypass -File build.ps1
#
#   dist\                      le programme prêt à lancer (Fief.exe + theme\)
#   release\Fief-x.y.z-win-x64.zip   l'archive à joindre à une version GitHub
#   docs\download\Fief-win-x64.zip   la même, servie par la page de présentation
#   docs\demo\                 copie du thème, pour la démo en ligne de la page
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dist = Join-Path $root 'dist'
$exe = Join-Path $dist 'Fief.exe'

# une instance en cours verrouille les fichiers : on lui demande de quitter
$running = Get-Process Fief -ErrorAction SilentlyContinue
if ($running) {
    $any = $running | Select-Object -First 1
    Start-Process -FilePath $any.Path -ArgumentList '--exit'
    $running | Wait-Process -Timeout 10 -ErrorAction SilentlyContinue
}

dotnet build (Join-Path $root 'host\Fief.csproj') -c Release -nologo -v q -o $dist
if ($LASTEXITCODE -ne 0) { throw 'La compilation a échoué.' }

# fichiers inutiles à l'exécution
Remove-Item (Join-Path $dist 'Microsoft.Web.WebView2.Wpf.dll') -ErrorAction SilentlyContinue
Remove-Item (Join-Path $dist 'runtimes') -Recurse -Force -ErrorAction SilentlyContinue

# le thème (pages web qui dessinent le monde) voyage avec l'exécutable
function Copy-Theme($to) {
    if (Test-Path $to) { Remove-Item $to -Recurse -Force }
    Copy-Item (Join-Path $root 'theme') $to -Recurse
    Remove-Item (Join-Path $to 'sprites.html') -ErrorAction SilentlyContinue
}
Copy-Theme (Join-Path $dist 'theme')

# packs de thèmes payants : seulement dans la copie locale (dist), jamais dans l'archive ni la démo publiques
$packs = Join-Path $root 'packs'
if (Test-Path $packs) { Copy-Item $packs (Join-Path $dist 'theme\packs') -Recurse }

# démo en ligne : le thème sans la page de réglages
$demo = Join-Path $root 'docs\demo'
Copy-Theme $demo
Remove-Item (Join-Path $demo 'settings.html') -ErrorAction SilentlyContinue

# archive à distribuer : un dossier « Fief » avec le programme, la licence et un mode d'emploi
[xml]$proj = Get-Content (Join-Path $root 'host\Fief.csproj')
$version = $proj.Project.PropertyGroup.Version
$stage = Join-Path $root 'release\Fief'
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force $stage | Out-Null
Copy-Item (Join-Path $dist '*') $stage -Recurse
Remove-Item (Join-Path $stage 'theme\packs') -Recurse -Force -ErrorAction SilentlyContinue
foreach ($f in 'LICENSE', 'tools\LISEZMOI.txt', 'tools\README.txt') {
    $src = Join-Path $root $f
    if (Test-Path $src) { Copy-Item $src $stage }
}
$zip = Join-Path $root "release\Fief-$version-win-x64.zip"
if (Test-Path $zip) { Remove-Item $zip }
Compress-Archive -Path $stage -DestinationPath $zip -CompressionLevel Optimal
Remove-Item $stage -Recurse -Force
New-Item -ItemType Directory -Force (Join-Path $root 'docs\download') | Out-Null
Copy-Item $zip (Join-Path $root 'docs\download\Fief-win-x64.zip') -Force

Write-Host "Programme : $exe"
Write-Host "Archive   : $zip ($([math]::Round((Get-Item $zip).Length / 1KB)) Ko)"
