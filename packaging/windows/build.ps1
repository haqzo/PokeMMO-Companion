# Build an unsigned, local Windows x86_64 portable ZIP and checksum.
param([string]$PythonExecutable)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..\..")
$env:PYTHONUTF8 = "1"

function Invoke-Checked([string]$Command, [string[]]$Arguments) {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Command failed with exit code $LASTEXITCODE"
    }
}

$interpreter = if ($PythonExecutable) { $PythonExecutable } else { "py" }
$prefix = if ($PythonExecutable) { @() } else { @("-3.13") }
Invoke-Checked $interpreter (@($prefix) + @("-c", "import platform, struct, sys; sys.exit(sys.version_info[:2] != (3, 13) or struct.calcsize('P') != 8 or platform.machine().lower() not in ('amd64', 'x86_64'))"))
Invoke-Checked $interpreter (@($prefix) + @("-m", "venv", ".build-venv"))
$python = ".\.build-venv\Scripts\python.exe"
Invoke-Checked $python @("-m", "pip", "install", "--requirement", "packaging\requirements-build.txt")
Invoke-Checked $python @("-m", "PyInstaller", "--noconfirm", "--workpath", "build\pyinstaller",
    "--distpath", "dist", "packaging\companion.spec")
$version = Invoke-Checked $python @("-c", "import companion; print(companion.__version__)")
$stem = "PokeMMO-Companion-$version-windows-x86_64"
Invoke-Checked $python @("-c", "import shutil, sys; shutil.make_archive(sys.argv[1], 'zip', 'dist', 'pokemmo-companion')",
    "dist\$stem")
$zip = Get-Item "dist\$stem.zip"
# Use the pinned interpreter for the checksum as well as the ZIP. The isolated build shell
# need not have the optional Windows PowerShell utility cmdlets available.
$checksumScript = @'
import hashlib
import sys
from pathlib import Path

package = Path(sys.argv[1])
with package.open('rb') as stream:
    digest = hashlib.file_digest(stream, 'sha256').hexdigest()
package.with_name('SHA256SUMS').write_bytes(f'{digest}  {package.name}\n'.encode('ascii'))
'@
Invoke-Checked $python @("-c", $checksumScript, $zip.FullName)
Write-Host "$($zip.Length) bytes  $($zip.FullName)"
