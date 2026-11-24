# Build a Windows x86_64 folder bundle + zip of PokeMMO Companion (maintainer machine; NOT needed by players).
# Needs: Python 3.11+ (python.org), network for pip. Optional: Inno Setup for an installer (not provided yet).
# Status 2026-11-24: written, not yet run — test on Windows 10/11 before publishing anything.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..\..")
python -m venv .build-venv
.\.build-venv\Scripts\pip install --upgrade pip
.\.build-venv\Scripts\pip install "PySide6>=6.6" "cryptography>=42" "pyinstaller>=6"
.\.build-venv\Scripts\pyinstaller --noconfirm --workpath build\pyinstaller --distpath dist packaging\companion.spec
$version = (python -c "import companion; print(companion.__version__)")
$zip = "dist\PokeMMO-Companion-$version-windows-x86_64.zip"
Compress-Archive -Path dist\pokemmo-companion\* -DestinationPath $zip -Force
$hash = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
Add-Content dist\SHA256SUMS "$hash  $(Split-Path $zip -Leaf)"
Write-Host "Built $zip (unsigned; sign SHA256SUMS before publishing)"
