"""C2PA signing helpers.

Provides a c2pa ``Signer`` and configures trust anchors. In production, supply a
real signing certificate chain + private key (PEM) via settings. For dev/test we
generate and cache a self-issued CA + leaf signing cert that satisfies the C2PA
certificate profile (KeyUsage=digitalSignature, EKU=emailProtection, proper
chain), so Content Credentials can be embedded and read without external infra.

Note on this sandbox's prebuilt c2pa wheel (0.32.x): claim-signature
*verification* mis-reports ``claimSignature.mismatch`` even when c2pa itself
performs the signing (``from_info``). Content-hash binding (tamper evidence) and
trust-anchor checks work correctly, so the gate relies on those by default. A
correct production build can enable strict full-validation via
``SCS_C2PA_REQUIRE_VALID_STATE=true``.
"""
from __future__ import annotations

import datetime
from pathlib import Path

from app.config import get_settings

try:
    import c2pa

    _C2PA_AVAILABLE = True
except Exception:  # pragma: no cover - c2pa optional
    _C2PA_AVAILABLE = False


def c2pa_available() -> bool:
    return _C2PA_AVAILABLE


def _generate_dev_chain() -> tuple[bytes, bytes, bytes]:
    """Return (leaf+ca chain PEM, leaf key PEM, ca PEM) meeting the C2PA profile."""
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

    now = datetime.datetime.utcnow()
    ca_key = ec.generate_private_key(ec.SECP256R1())
    ca_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "SCS Dev Root CA")])
    ca_ski = x509.SubjectKeyIdentifier.from_public_key(ca_key.public_key())
    ca = (
        x509.CertificateBuilder()
        .subject_name(ca_name)
        .issuer_name(ca_name)
        .public_key(ca_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=3650))
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .add_extension(
            x509.KeyUsage(False, False, False, False, False, True, True, False, False),
            critical=True,
        )
        .add_extension(ca_ski, critical=False)
        .sign(ca_key, hashes.SHA256())
    )

    leaf_key = ec.generate_private_key(ec.SECP256R1())
    leaf_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "SCS Dev Signer")])
    leaf = (
        x509.CertificateBuilder()
        .subject_name(leaf_name)
        .issuer_name(ca_name)
        .public_key(leaf_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=3650))
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(
            x509.KeyUsage(True, False, False, False, False, False, False, False, False),
            critical=True,
        )
        .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.EMAIL_PROTECTION]), critical=False)
        .add_extension(
            x509.SubjectKeyIdentifier.from_public_key(leaf_key.public_key()), critical=False
        )
        .add_extension(
            x509.AuthorityKeyIdentifier.from_issuer_subject_key_identifier(ca_ski), critical=False
        )
        .sign(ca_key, hashes.SHA256())
    )

    enc = serialization.Encoding.PEM
    leaf_pem = leaf.public_bytes(enc)
    ca_pem = ca.public_bytes(enc)
    key_pem = leaf_key.private_bytes(
        enc, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    )
    return leaf_pem + ca_pem, key_pem, ca_pem


def load_or_create_credentials() -> tuple[bytes, bytes, bytes]:
    """Load configured PEM cert/key, else generate + cache dev credentials."""
    settings = get_settings()
    if settings.c2pa_cert_path and settings.c2pa_key_path:
        chain = Path(settings.c2pa_cert_path).read_bytes()
        key = Path(settings.c2pa_key_path).read_bytes()
        # CA anchor optional alongside the chain; trust handled by deployment.
        return chain, key, b""

    cert_dir = Path(settings.storage_dir) / "_dev_certs"
    cert_dir.mkdir(parents=True, exist_ok=True)
    chain_p, key_p, ca_p = cert_dir / "chain.pem", cert_dir / "key.pem", cert_dir / "ca.pem"
    if not (chain_p.exists() and key_p.exists() and ca_p.exists()):
        chain, key, ca = _generate_dev_chain()
        chain_p.write_bytes(chain)
        key_p.write_bytes(key)
        ca_p.write_bytes(ca)
    return chain_p.read_bytes(), key_p.read_bytes(), ca_p.read_bytes()


def configure_trust(ca_pem: bytes) -> None:
    """Register the dev CA as a trust anchor so signingCredential.trusted holds."""
    if not (_C2PA_AVAILABLE and ca_pem):
        return
    try:
        c2pa.load_settings({"trust": {"trust_anchors": ca_pem.decode()}, "verify": {"verify_trust": True}})
    except Exception:  # pragma: no cover - settings best-effort
        pass


def build_signer():
    """Construct a c2pa ``Signer`` (ES256) with timestamping disabled."""
    if not _C2PA_AVAILABLE:  # pragma: no cover
        raise RuntimeError("c2pa-python is not installed")
    chain, key, ca = load_or_create_credentials()
    configure_trust(ca)
    info = c2pa.C2paSignerInfo(alg=b"es256", sign_cert=chain, private_key=key, ta_url=b"x")
    info.ta_url = None  # NULL pointer → no RFC-3161 timestamp authority call
    return c2pa.Signer.from_info(info)
