# Build an unsigned, local Windows x86_64 portable ZIP and checksum.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..\..")
$env:PYTHONUTF8 = "1"

function Invoke-Checked([string]$Command, [string[]]$Arguments) {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Command failed with exit code $LASTEXITCODE"
    }
}

Invoke-Checked py @("-3.13", "-c", "import platform, sys; sys.exit(platform.machine().lower() not in ('amd64', 'x86_64'))")
Invoke-Checked py @("-3.13", "-m", "venv", ".build-venv")
$python = ".\.build-venv\Scripts\python.exe"
Invoke-Checked $python @("-m", "pip", "install", "--requirement", "packaging\requirements-build.txt")
Invoke-Checked $python @("-m", "PyInstaller", "--noconfirm", "--workpath", "build\pyinstaller",
    "--distpath", "dist", "packaging\companion.spec")
$version = Invoke-Checked $python @("-c", "import companion; print(companion.__version__)")
$stem = "PokeMMO-Companion-$version-windows-x86_64"
Invoke-Checked $python @("-c", "import shutil, sys; shutil.make_archive(sys.argv[1], 'zip', 'dist', 'pokemmo-companion')",
    "dist\$stem")
$zip = Get-Item "dist\$stem.zip"
$hash = (Get-FileHash $zip.FullName -Algorithm SHA256).Hash.ToLower()
Set-Content -Path dist\SHA256SUMS -Encoding ascii -Value "$hash  $($zip.Name)"
Write-Host "$($zip.Length) bytes  $($zip.FullName)"
