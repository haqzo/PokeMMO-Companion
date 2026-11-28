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


def packaged_main():
    configure_linux_ca_store()
    if sys.argv[1:] == ["--check-tls-trust"]:
        import ssl

        context = ssl.create_default_context()
        if (context.verify_mode != ssl.CERT_REQUIRED or not context.check_hostname
                or not context.cert_store_stats()["x509_ca"]):
            raise SystemExit("Packaged HTTPS trust store unavailable or verification disabled")
        from companion.tls import live_https_context

        live_context = live_https_context()
        if live_context.verify_mode != ssl.CERT_REQUIRED or not live_context.check_hostname:
            raise SystemExit("Packaged live HTTPS verification disabled")
        print("Packaged HTTPS trust store: OK")
        return 0
    from companion.__main__ import main

    return main()


if __name__ == "__main__":
    sys.exit(packaged_main())
