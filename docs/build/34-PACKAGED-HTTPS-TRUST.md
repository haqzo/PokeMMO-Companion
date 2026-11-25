# Pre-publication packaging issue: HTTPS trust roots

Owner's signed 0.8.0 AppImage (release snapshot 0df8ba546fdb811345bbf8ddce584ce783695504)
reported CERTIFICATE_VERIFY_FAILED in the Alpha/Swarm feed on CachyOS. A second owner recording
showed a successful verified connection and a real Fearow report after setting SSL_CERT_FILE
to /etc/ssl/certs/ca-certificates.crt and SSL_CERT_DIR to /etc/ssl/certs.

The packaged entry point now discovers common Linux system CA bundle paths before importing
the application. Explicit SSL_CERT_FILE or SSL_CERT_DIR overrides are preserved; Windows
continues using its native default trust store. Certificate and hostname verification are
not disabled. Release-package smoke checks now exercise the actual frozen runtime with
inherited CA overrides removed and require a nonempty trusted CA store and enabled peer
and hostname checks. This is a local trust-store check, not a live network test.

The existing published branch and tag are unchanged; no GitHub release has been published.
Before distributing the corrected candidate, review a new release snapshot, explicitly
approve the tag transition, rebuild both packages from that exact snapshot, verify an ordinary
AppImage launch without SSL overrides against the real feed, check news and updates online,
and assemble and sign fresh checksums. The previous signed packages remain separate evidence.
Windows interactive testing remains pending.
