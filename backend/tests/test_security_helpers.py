import pytest

from app.core.security import looks_like_pdf, safe_stem, sanitize_suffix


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("invoice.pdf", "invoice"),
        ("INVOICE.PDF", "INVOICE"),
        ("../../etc/passwd.pdf", "passwd"),
        ("..\\..\\windows\\system32\\evil.pdf", "evil"),
        ("a<b>c:d\"e|f?g*.pdf", "a_b_c_d_e_f_g_"),
        ("CON.pdf", "_CON"),
        ("lpt1", "_lpt1"),
        ("   ", "document"),
        ("....pdf", "document"),
        (None, "document"),
        ("a\x00b\nc.pdf", "a_b_c"),
        ("x" * 500 + ".pdf", "x" * 100),
    ],
)
def test_safe_stem(raw, expected):
    assert safe_stem(raw) == expected


def test_suffix_validation_falls_back():
    assert sanitize_suffix("_locked", "_x") == "_locked"
    assert sanitize_suffix("", "_x") == ""
    assert sanitize_suffix("../evil", "_x") == "_x"
    assert sanitize_suffix("a" * 40, "_x") == "_x"
    assert sanitize_suffix(None, "_x") == "_x"


def test_pdf_signature_detection():
    assert looks_like_pdf(b"%PDF-1.7\n...")
    assert looks_like_pdf(b"\xef\xbb\xbfjunk%PDF-1.4")
    assert not looks_like_pdf(b"PK\x03\x04 zip")
    assert not looks_like_pdf(b"x" * 2000 + b"%PDF-")
