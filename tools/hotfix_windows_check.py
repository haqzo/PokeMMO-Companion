"""Exercise shipped Windows executables on the runner with disposable profiles."""
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
import shutil
import ssl
import subprocess
import sys
import tempfile
from threading import Thread
import time
from urllib.request import urlopen
from zipfile import ZipFile

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

from windows_candidate_check import running, schema, verify_reporting_scope

ORIGIN = "https://ntfy.pokemmotools.org"
PUBLISHED = ("https://github.com/haqzo/PokeMMO-Companion/releases/download/v0.8.1/"
             "PokeMMO-Companion-0.8.1-windows-x86_64.zip")
PUBLISHED_SHA256 = "00c387cdd0ac20935301fbfa816d86d36e514e30e50b0ebfc5fa0645bf3f7937"


def unpack(archive, folder):
    with ZipFile(archive) as zip_file:
        zip_file.extractall(folder)
    return (folder / "pokemmo-companion" / "pokemmo-companion.exe").resolve(strict=True)


def check_source(api, origin=ORIGIN):
    settings = api("PATCH", "/api/settings", {
        "live.ntfy.consented": True, "live.ntfy.enabled": True, "live.ntfy.server": origin,
        "app_updates.auto_check": False, "reference.auto_update": False,
        "updates.auto_check": False, "notify.alpha": "off", "notify.swarm": "off",
    })
    assert settings["applied"]["live.ntfy.server"] == origin, settings
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        status = api("GET", "/api/live/source")
        if status["last_success_at"] or status["status"] in ("error", "offline"):
            return status
        time.sleep(0.15)
    raise AssertionError(f"Feed did not report a connection result: {status}")


class StreamHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        assert self.path == "/alphapings,swarmpings/json?since=12h"
        assert self.headers["User-Agent"] == "PokeMMO-Companion/0.8.2 (read-only)"
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"event":"open"}\n')


def certificate(name, *, issuer=None, expired=False):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, name)])
    now = datetime.now(timezone.utc)
    cert = (x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(issuer[0].subject if issuer else subject)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now - timedelta(days=3))
            .not_valid_after(now + timedelta(days=-1 if expired else 2))
            .add_extension(x509.BasicConstraints(ca=issuer is None, path_length=None), critical=True))
    if issuer:
        cert = cert.add_extension(x509.SubjectAlternativeName([x509.DNSName(name)]), critical=False)
        cert = cert.add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False)
    return cert.sign(issuer[1] if issuer else key, hashes.SHA256()), key


@contextmanager
def local_https(folder, cert, key, issuer):
    certfile, keyfile = folder / "leaf.pem", folder / "leaf-key.pem"
    certfile.write_bytes(cert.public_bytes(serialization.Encoding.PEM)
                         + issuer.public_bytes(serialization.Encoding.PEM))
    keyfile.write_bytes(key.private_bytes(serialization.Encoding.PEM,
                                         serialization.PrivateFormat.PKCS8,
                                         serialization.NoEncryption()))
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certfile, keyfile)
    with ThreadingHTTPServer(("127.0.0.1", 0), StreamHandler) as http:
        http.socket = context.wrap_socket(http.socket, server_side=True)
        thread = Thread(target=http.serve_forever)
        thread.start()
        try:
            yield f"https://localhost:{http.server_port}"
        finally:
            http.shutdown()
            thread.join()


def verify_certificates(exe, folder):
    trusted = certificate("Companion hotfix CI ephemeral root")
    untrusted = certificate("Companion hotfix CI untrusted root")
    root = folder / "ca.cer"
    root.write_bytes(trusted[0].public_bytes(serialization.Encoding.DER))
    root_id = trusted[0].fingerprint(hashes.SHA1()).hex()
    try:
        # The current-user Root store opens a confirmation dialog. The disposable
        # administrator runner can use the machine Root store without a UI.
        subprocess.run(["certutil", "-f", "-addstore", "Root", str(root)], check=True, timeout=30)
        for label, name, issuer, expired, reason in (
            ("valid", "localhost", trusted, False, None),
            ("expired", "localhost", trusted, True, r"expired|validity period|0x800b0101"),
            ("untrusted", "localhost", untrusted, False, r"not trusted|untrusted|0x800b0109|0x800b010a"),
            ("wrong-hostname", "wrong.invalid", trusted, False, r"does not match|name.*invalid|mismatch|0x800b010f|wrong principal"),
        ):
            cert, key = certificate(name, issuer=issuer, expired=expired)
            with local_https(folder, cert, key, issuer[0]) as origin, running(exe, folder / label) as api:
                status = check_source(api, origin)
            if reason is None:
                assert status["last_success_at"], status
                print("Frozen Windows runtime accepted the trusted, in-date, matching control")
            else:
                assert not status["last_success_at"] and status["status"] == "offline", status
                assert re.search(reason, status["detail"], re.IGNORECASE), status
                print(f"Frozen Windows runtime rejected {label}: {status['detail']}")
    finally:
        subprocess.run(["certutil", "-delstore", "Root", root_id], check=True, timeout=30)


def verify_release_upgrade(exe, folder):
    published_zip = folder / "0.8.1.zip"
    with urlopen(PUBLISHED, timeout=90) as response, published_zip.open("wb") as output:
        shutil.copyfileobj(response, output)
    with published_zip.open("rb") as source:
        assert hashlib.file_digest(source, "sha256").hexdigest() == PUBLISHED_SHA256
    published = unpack(published_zip, folder / "published")
    profile = folder / "upgrade profile"
    with running(published, profile) as api:
        status = check_source(api)
        print(f"Published Windows 0.8.1 on this runner: {status['status']}, {status['detail']}; "
              f"successful HTTPS: {bool(status['last_success_at'])}")
        api("PATCH", "/api/settings", {"app.language": "es", "live.ntfy.enabled": False})
        note = api("POST", "/api/notes", {"title": "Synthetic hotfix QA", "body": "Preserve local data."})["id"]
        report = api("POST", "/api/live/test", {"kind": "alpha"})["id"]
    before = schema(profile / "companion.sqlite3")
    with running(exe, profile) as api:
        assert api("GET", "/api/settings")["app.language"] == "es"
        assert api("GET", f"/api/notes/{note}")["title"] == "Synthetic hotfix QA"
        assert api("GET", f"/api/live/reports/{report}")["is_test"]
        verify_reporting_scope(api)
    assert schema(profile / "companion.sqlite3") == before
    print(f"Published 0.8.1 profile upgraded to 0.8.2 with note, report and preferences intact (schema {before})")


def record_alphapedia(exe, folder):
    probe = folder / "frozen https report.txt"
    completed = subprocess.run([exe, "--check-tls-trust"], timeout=120,
                               env={**os.environ, "COMPANION_LIVE_HTTPS_REPORT": str(probe)})
    lines = probe.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 5, lines
    statuses = {}
    for line in lines:
        match = re.fullmatch(r"Packaged Alphapedia HTTPS HTTP (200|403) (/\S+)", line)
        assert match, line
        code, path = match.groups()
        statuses[path] = int(code)
        print(line, flush=True)
    assert len(statuses) == 5, statuses
    assert completed.returncode in (0, 13, 14, 15), completed.returncode
    with running(exe, folder / "live profile") as api:
        state = check_source(api)
    if state["last_success_at"]:
        print("Frozen 0.8.2 Windows live service connected to the actual combined Alphapedia feed")
    else:
        assert state["status"] == "offline" and "HTTP Error 403: Forbidden" in state["detail"], state
        print("RELEASE BLOCKER: the frozen Windows live service received HTTP 403 from Alphapedia.")
    return {"probe_status": statuses, "combined_live_connected": bool(state["last_success_at"]),
            "combined_live_detail": state["detail"]}


def main():
    if sys.platform != "win32":
        raise SystemExit("Requires the native Windows CI runner.")
    with tempfile.TemporaryDirectory(prefix="Companion hotfix QA ") as directory:
        folder = Path(directory)
        archive = Path(sys.argv[1]).resolve()
        exe = unpack(archive, folder / "candidate")
        verify_release_upgrade(exe, folder)
        verify_certificates(exe, folder)
        alphapedia = record_alphapedia(exe, folder)
        report_file = archive.with_name("windows-build.json")
        report = json.loads(report_file.read_text(encoding="utf-8"))
        report["alphapedia_https"] = alphapedia
        report["checks"] += ["frozen certificate acceptance and rejection", "published 0.8.1 profile preservation"]
        report_file.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
