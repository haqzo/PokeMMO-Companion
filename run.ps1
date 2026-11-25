# PokeMMO Companion source launcher for Windows. See packaging/README.md for release QA.
# First time:  py -3 -m venv .venv ; .\.venv\Scripts\python -m pip install -r requirements-native.txt
# Then:        .\run.ps1          (or .\run.ps1 --browser)
Set-Location -Path $PSScriptRoot
$py = if (Test-Path ".\.venv\Scripts\python.exe") { ".\.venv\Scripts\python.exe" } else { "py" }
if ($py -eq "py") { & py -3 -m companion @args } else { & $py -m companion @args }
