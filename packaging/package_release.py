#!/usr/bin/env python3
"""Build and verify a native package, or assemble verified packages for draft review."""
import argparse
import hashlib
import json
import os
import platform
import re
import subprocess
import sys
import tempfile
import tomllib
import zipfile
from pathlib import Path

from bundle_assets import bundle_assets

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from companion import APP_NAME, __version__
from companion.release import package_names, release_channel

MAIN = "refs/remotes/origin/main"
REPORT = "{target}-build.json"
RELEASE_PYTHON = (3, 13, 14)
LINUX_GLIBC_LIMIT = (2, 35)
LINUX_TOOL_HASHES = {
    "COMPANION_APPIMAGETOOL": "ed4ce84f0d9caff66f50bcca6ff6f35aae54ce8135408b3fa33abfc3cb384eb0",
    "COMPANION_APPIMAGE_RUNTIME": "2fca8b443c92510f1483a883f60061ad09b46b978b2631c807cd873a47ec260d",
}


def output(*command):
    return subprocess.check_output(command, cwd=ROOT, text=True).strip()


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def file_info(path):
    return {"name": path.name, "bytes": path.stat().st_size, "sha256": digest(path)}


def checksum_line(info):
    return f"{info['sha256']}  {info['name']}\n"


def source_revision(tag):
    if output("git", "status", "--porcelain"):
        raise ValueError("Use a clean source checkout.")
    version = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))["project"]["version"]
    if version != __version__:
        raise ValueError("Runtime and project metadata versions differ.")
    sha = output("git", "rev-parse", "HEAD")
    if tag:
        if not re.fullmatch(r"v(?:0\.(?:8|9)|[1-9][0-9]*\.(?:0|[1-9][0-9]*))\.(?:0|[1-9][0-9]*)", tag):
            raise ValueError("Expected an exact release tag such as v0.8.0.")
        if tag != f"v{version}" or output("git", "rev-parse", "--verify", f"refs/tags/{tag}^{{commit}}") != sha:
            raise ValueError("HEAD, the exact tag, and the declared version must agree.")
        subprocess.run(["git", "merge-base", "--is-ancestor", sha, MAIN], cwd=ROOT, check=True)
    return sha


def development_source():
    marker = ROOT / "RELEASE-SOURCE"
    if not marker.is_file():
        return None
    sha = marker.read_text(encoding="ascii").strip()
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise ValueError("RELEASE-SOURCE must contain the full reviewed development commit SHA.")
    return sha


def verify_linux_dependencies(appimage, extracted, internal):
    required = set()
    search_path = os.pathsep.join(map(str, (internal, internal / "PySide6/Qt/lib")))
    env = {**os.environ, "LC_ALL": "C", "LD_LIBRARY_PATH": search_path}
    for file in [appimage, *extracted.rglob("*")]:
        if file.is_symlink() or not file.is_file():
            continue
        with file.open("rb") as stream:
            if stream.read(4) != b"\x7fELF":
                continue
        versions = output("env", "LC_ALL=C", "readelf", "--version-info", str(file))
        # A static ELF such as the AppImage runtime has no interpreter or
        # shared library dependencies. Check the launcher and all dynamic DSOs.
        dynamic = output("env", "LC_ALL=C", "readelf", "--dynamic", str(file))
        if "(NEEDED)" in dynamic:
            linked = subprocess.run(["ldd", str(file)], cwd=ROOT, env=env, capture_output=True, text=True)
            if linked.returncode or "not found" in linked.stdout + linked.stderr:
                raise ValueError(f"Unresolved dependency in {file}: {linked.stdout}{linked.stderr}")
        needs = versions.partition("Version needs section")[2]
        required.update(tuple(map(int, version.split(".")))
                        for version in re.findall(r"Name: GLIBC_([0-9.]+)\b", needs))
    if not required:
        raise ValueError("No versioned glibc imports were found in the Linux bundle.")
    highest = max(required)
    glibc = ".".join(map(str, highest))
    if highest > LINUX_GLIBC_LIMIT:
        limit = ".".join(map(str, LINUX_GLIBC_LIMIT))
        raise ValueError(f"Bundled ELF files require glibc {glibc}; limit is {limit}.")
    return glibc


def smoke(artifact, target, release=False):
    with tempfile.TemporaryDirectory(prefix="Companion package QA ") as directory:
        work = Path(directory)
        profile = work / "fresh profile"
        if target == "windows":
            with zipfile.ZipFile(artifact) as archive:
                archive.extractall(work)
            app = work / "pokemmo-companion"
            launcher = app / "pokemmo-companion.exe"
            runtime = f"python{sys.version_info.major}{sys.version_info.minor}.dll"
            qt_files = ("Qt6Core.dll", "Qt6WebEngineCore.dll", "QtWebEngineProcess.exe", "qwindows.dll")
            command = [str(launcher)]
        else:
            subprocess.run([str(artifact), "--appimage-extract"], cwd=work, check=True,
                           stdout=subprocess.DEVNULL, timeout=180)
            app = work / "squashfs-root/usr/lib/pokemmo-companion"
            runtime = f"libpython{sys.version_info.major}.{sys.version_info.minor}.so*"
            qt_files = ("libQt6Core.so.6", "libQt6WebEngineCore.so.6", "QtWebEngineProcess", "libqxcb.so")
            command = [str(artifact), "--appimage-extract-and-run"]

        internal = app / "_internal"
        for path in bundle_assets(ROOT):
            if digest(internal / path) != digest(ROOT / path):
                raise ValueError(f"Packaged file differs from source: {path}")
        if not any(internal.glob(runtime)):
            raise ValueError(f"Missing packaged Python runtime: {runtime}")
        for name in qt_files:
            if not any(internal.rglob(name)):
                raise ValueError(f"Missing bundled Qt file: {name}")
        glibc = verify_linux_dependencies(artifact, work / "squashfs-root", internal) if target == "linux" and release else None

        env = os.environ.copy()
        for key in ("PYTHONPATH", "PYTHONHOME"):
            env.pop(key, None)
        # Exercise the frozen runtime's default trust setup without inherited CA overrides.
        tls_env = env.copy()
        for key in ("SSL_CERT_FILE", "SSL_CERT_DIR"):
            tls_env.pop(key, None)
        subprocess.run([*command, "--check-tls-trust"], cwd=work,
                       env=tls_env, check=True, timeout=120)
        subprocess.run([*command, "--check", "--data-dir", str(profile)], cwd=work,
                       env=env, check=True, timeout=120)
        expected = f"{APP_NAME} {__version__} — data dir "
        if not (profile / "companion.sqlite3").is_file() or expected not in (
                profile / "logs/companion.log").read_text(encoding="utf-8"):
            raise ValueError("Fresh-profile self-check did not log the expected version or create its database.")
        return glibc


def build(tag):
    sha = source_revision(tag)
    develop = development_source()
    target = {"win32": "windows", "linux": "linux"}.get(sys.platform)
    if not target:
        raise ValueError("Use a native Linux or Windows build host.")
    if tag and (sys.version_info[:3] != RELEASE_PYTHON or platform.machine().lower() not in ("x86_64", "amd64")):
        required = ".".join(map(str, RELEASE_PYTHON))
        raise ValueError(f"Release builds require Python {required} on x86-64.")
    dist = ROOT / "dist"
    report = dist / REPORT.format(target=target)
    report.unlink(missing_ok=True)
    artifact = dist / package_names(__version__)[target]
    artifact.unlink(missing_ok=True)
    tools = {}
    if target == "windows":
        command = ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
                   "packaging/windows/build.ps1", "-PythonExecutable", sys.executable]
        python = ROOT / ".build-venv/Scripts/python.exe"
    else:
        for key, expected in LINUX_TOOL_HASHES.items():
            path = os.getenv(key)
            if path:
                tools[key] = file_info(Path(path))
                if tag and tools[key]["sha256"] != expected:
                    raise ValueError(f"{key} does not match the pinned SHA-256.")
            elif tag:
                raise ValueError(f"Set {key} to a verified local file for a release build.")
        command = ["bash", "packaging/linux/build-appimage.sh"]
        python = ROOT / ".build-venv/bin/python"
    subprocess.run(command, cwd=ROOT, check=True,
                   env={**os.environ, "COMPANION_BUILD_PYTHON": sys.executable})
    info = file_info(artifact)
    if (dist / "SHA256SUMS").read_text(encoding="ascii") != checksum_line(info):
        raise ValueError("The package does not match its build checksum.")
    glibc = smoke(artifact, target, release=bool(tag))
    if target == "linux" and not tag:
        print("Internal Linux build. The release glibc ceiling was not checked.")
    checks = ["checksum", "bundled assets and runtimes", "packaged HTTPS trust store", "fresh-profile backend self-check"]
    if glibc is not None:
        checks += ["dynamic ELF dependencies", "maximum GLIBC requirement"]
    provenance = {"commit": sha, "tag": tag, "version": __version__, "platform": target,
                  "host": platform.platform(), "runner_image": os.getenv("ImageVersion"),
                  "python": output(str(python), "--version"),
                  "dependencies": output(str(python), "-m", "pip", "freeze", "--all").splitlines(),
                  "external_tools": tools, "max_required_glibc": glibc, "package": info,
                  "checks": checks}
    if develop is not None:
        provenance["develop_source"] = develop
    report.write_text(json.dumps(provenance, indent=2) + "\n", encoding="utf-8")
    print(f"Verified {artifact.name}: {info['bytes']} bytes, SHA-256 {info['sha256']}")
    print(report.read_text(encoding="utf-8"), end="")


def assemble(tag, stage):
    sha = source_revision(tag)
    develop = development_source()
    reports = {}
    checksums = []
    for target, name in package_names(__version__).items():
        report = json.loads((stage / REPORT.format(target=target)).read_text(encoding="utf-8"))
        actual = file_info(stage / name)
        if (report["commit"], report["tag"], report["version"], report["platform"], report["package"]) != (
                sha, tag, __version__, target, actual):
            raise ValueError(f"The {target} package and report do not match this release source.")
        if report.get("develop_source") != develop:
            raise ValueError(f"The {target} report does not match the recorded development source.")
        reports[target] = report
        checksums.append(checksum_line(actual))
    (stage / "SHA256SUMS").write_bytes("".join(checksums).encode("ascii"))
    provenance = {"commit": sha, "tag": tag, "channel": release_channel(tag), "builds": reports}
    if develop is not None:
        provenance["develop_source"] = develop
    (stage / "build-provenance.json").write_text(json.dumps(provenance, indent=2) + "\n", encoding="utf-8")
    print(f"Prepared {tag} ({release_channel(tag)}) at {sha} in {stage}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="action", required=True)
    commands.add_parser("build").add_argument("--tag")
    staging = commands.add_parser("assemble")
    staging.add_argument("--tag", required=True)
    staging.add_argument("--stage", type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.action == "build":
            build(args.tag)
        else:
            assemble(args.tag, args.stage.resolve())
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
