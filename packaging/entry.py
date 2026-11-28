"""Entry point for packaged builds (PyInstaller)."""
import os
import sys
from pathlib import Path

LINUX_CA_BUNDLES = (
    "/etc/ssl/certs/ca-certificates.crt",  # Debian, Ubuntu, Arch
    "/etc/pki/tls/certs/ca-bundle.crt",  # Fedora, RHEL
    "/var/lib/ca-certificates/ca-bundle.pem",  # openSUSE
    "/etc/ssl/cert.pem",  # Alpine and others
)


def configure_linux_ca_store():
    """Use the host's trusted CA bundle rather than build-host OpenSSL paths."""
    if not sys.platform.startswith("linux"):
        return
    # Explicit overrides may intentionally select a different trust store.
    if "SSL_CERT_FILE" in os.environ or "SSL_CERT_DIR" in os.environ:
        return
    for candidate in LINUX_CA_BUNDLES:
        if Path(candidate).is_file():
            os.environ["SSL_CERT_FILE"] = candidate
            if Path("/etc/ssl/certs").is_dir():
                os.environ["SSL_CERT_DIR"] = "/etc/ssl/certs"
            return


def check_live_https(report):
    """Exercise the live provider from the verified package build."""
    import json
    from companion.tls import open_live_feed

    origin = "https://ntfy.pokemmotools.org"
    for code, path in ((11, "/alphapings/json?poll=1"), (12, "/swarmpings/json?poll=1"),
                       (13, "/alphapings,swarmpings/json?since=12h")):
        try:
            with open_live_feed(origin + path, timeout=30) as response:
                if response.status != 200:
                    raise ValueError(f"Expected HTTP 200, got {response.status}")
                if path.endswith("since=12h"):
                    frame = json.loads(response.readline(65536))
                    if frame.get("event") not in ("open", "keepalive", "message"):
                        raise ValueError("Unexpected Alphapedia stream frame")
        except (OSError, ValueError, AttributeError) as error:
            report(f"Packaged Alphapedia HTTPS {path}: {type(error).__name__}: {error}")
            raise SystemExit(code) from None
        report(f"Packaged Alphapedia HTTPS HTTP 200 {path}")


def packaged_main():
    configure_linux_ca_store()
    if sys.argv[1:] == ["--check-tls-trust"]:
        import ssl

        context = ssl.create_default_context()
        if (context.verify_mode != ssl.CERT_REQUIRED or not context.check_hostname
                or not context.cert_store_stats()["x509_ca"]):
            raise SystemExit("Packaged HTTPS trust store unavailable or verification disabled")
        from companion.tls import live_https_context

        if sys.platform == "win32":
            import truststore

            live_context = live_https_context()
            if (not isinstance(live_context, truststore.SSLContext)
                    or live_context.verify_mode != ssl.CERT_REQUIRED or not live_context.check_hostname):
                raise SystemExit("Packaged Windows live HTTPS verification unavailable")
        if probe_report := os.environ.get("COMPANION_LIVE_HTTPS_REPORT"):
            # The frozen Windows app has no console attached.
            with Path(probe_report).open("w", encoding="utf-8") as stream:
                check_live_https(lambda message: print(message, file=stream))
        print("Packaged HTTPS trust store: OK")
        return 0
    from companion.__main__ import main

    return main()


if __name__ == "__main__":
    sys.exit(packaged_main())
