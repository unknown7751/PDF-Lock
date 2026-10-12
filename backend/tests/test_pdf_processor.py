"""Engine-level tests: real encryption / decryption with pikepdf (no HTTP)."""

from __future__ import annotations

from pathlib import Path

import pikepdf
import pytest
from pikepdf import Permissions

from app.core.errors import ProcessingError
from app.services.pdf_processor import EncryptOptions, decrypt_pdf, encrypt_pdf
from tests.conftest import OPEN_PW, OWNER_PW, WRONG_PW, make_encrypted_pdf, make_pdf, page_text_streams

MAX_PAGES = 100


def test_encrypts_unprotected_pdf_with_aes256(pdf_dir: Path):
    src, dst = make_pdf(pdf_dir / "a.pdf", pages=3), pdf_dir / "a_protected.pdf"
    out = encrypt_pdf(src, dst, OPEN_PW, EncryptOptions(), max_pages=MAX_PAGES)
    assert out.status == "success" and out.page_count == 3
    with pikepdf.open(dst, password=OPEN_PW) as pdf:
        assert pdf.is_encrypted and pdf.encryption.R == 6 and pdf.encryption.bits == 256
    with pytest.raises(pikepdf.PasswordError):
        pikepdf.open(dst, password=WRONG_PW)
    with pytest.raises(pikepdf.PasswordError):
        pikepdf.open(dst)


def test_encrypts_with_aes128_compat(pdf_dir: Path):
    src, dst = make_pdf(pdf_dir / "a.pdf"), pdf_dir / "o.pdf"
    encrypt_pdf(src, dst, OPEN_PW, EncryptOptions(algorithm="aes-128"), max_pages=MAX_PAGES)
    with pikepdf.open(dst, password=OPEN_PW) as pdf:
        assert pdf.encryption.R == 4 and pdf.encryption.bits == 128


def test_permission_restrictions_are_written(pdf_dir: Path):
    src, dst = make_pdf(pdf_dir / "a.pdf"), pdf_dir / "o.pdf"
    opts = EncryptOptions(owner_password=OWNER_PW, allow_print=False, allow_copy=False, allow_edit=False)
    encrypt_pdf(src, dst, OPEN_PW, opts, max_pages=MAX_PAGES)
    with pikepdf.open(dst, password=OPEN_PW) as pdf:
        assert not pdf.allow.print_highres and not pdf.allow.extract and not pdf.allow.modify_other
        assert pdf.allow.accessibility


@pytest.mark.parametrize("owner", [None, OPEN_PW])
def test_restrictions_require_distinct_owner_password(pdf_dir: Path, owner):
    src = make_pdf(pdf_dir / "a.pdf")
    with pytest.raises(ProcessingError) as e:
        encrypt_pdf(src, pdf_dir / "o.pdf", OPEN_PW, EncryptOptions(owner_password=owner, allow_print=False),
                    max_pages=MAX_PAGES)
    assert e.value.code == "invalid_options"
    assert not (pdf_dir / "o.pdf").exists()


@pytest.mark.parametrize(
    "algorithm,password",
    [("aes-128", "x" * 33), ("aes-128", "pässword"), ("aes-256", "y" * 128)],
)
def test_password_limits_per_algorithm(pdf_dir: Path, algorithm, password):
    with pytest.raises(ProcessingError) as e:
        encrypt_pdf(make_pdf(pdf_dir / "a.pdf"), pdf_dir / "o.pdf", password,
                    EncryptOptions(algorithm=algorithm), max_pages=MAX_PAGES)
    assert e.value.code == "invalid_options"


def test_unicode_password_roundtrip_aes256(pdf_dir: Path):
    pw = "pässwörd-日本語-🔒"
    src, enc, dec = make_pdf(pdf_dir / "a.pdf"), pdf_dir / "e.pdf", pdf_dir / "d.pdf"
    encrypt_pdf(src, enc, pw, EncryptOptions(), max_pages=MAX_PAGES)
    assert decrypt_pdf(enc, dec, pw, max_pages=MAX_PAGES).status == "success"


def test_encrypt_rejects_empty_password(pdf_dir: Path):
    with pytest.raises(ProcessingError) as e:
        encrypt_pdf(make_pdf(pdf_dir / "a.pdf"), pdf_dir / "o.pdf", "", EncryptOptions(), max_pages=MAX_PAGES)
    assert e.value.code == "password_required"


def test_encrypt_rejects_already_encrypted(pdf_dir: Path):
    enc = make_encrypted_pdf(pdf_dir / "e.pdf")
    with pytest.raises(ProcessingError) as e:
        encrypt_pdf(enc, pdf_dir / "o.pdf", "another-pw", EncryptOptions(), max_pages=MAX_PAGES)
    assert e.value.code == "already_encrypted"


@pytest.mark.parametrize("password", [OPEN_PW, OWNER_PW])
def test_decrypts_with_correct_password_and_preserves_content(pdf_dir: Path, password):
    enc = make_encrypted_pdf(pdf_dir / "e.pdf", pages=3)
    dst = pdf_dir / "d.pdf"
    out = decrypt_pdf(enc, dst, password, max_pages=MAX_PAGES)
    assert out.status == "success" and out.page_count == 3
    with pikepdf.open(dst) as pdf:  # opens with NO password
        assert not pdf.is_encrypted
        assert len(pdf.pages) == 3
        assert [float(x) for x in pdf.pages[0].MediaBox] == [0, 0, 612, 792]
        assert str(pdf.docinfo["/Title"]) == "PDFLock Test Document"
        assert str(pdf.docinfo["/Author"]) == "Test Author"
    assert page_text_streams(dst) == page_text_streams(enc, OPEN_PW)
    assert b"PDFLock page 1" in page_text_streams(dst)[0]


def test_wrong_password_is_rejected_and_leaves_no_output(pdf_dir: Path):
    enc = make_encrypted_pdf(pdf_dir / "e.pdf")
    dst = pdf_dir / "d.pdf"
    with pytest.raises(ProcessingError) as e:
        decrypt_pdf(enc, dst, WRONG_PW, max_pages=MAX_PAGES)
    assert e.value.code == "invalid_password"
    assert not dst.exists()


def test_empty_password_is_rejected_even_for_owner_only_files(pdf_dir: Path):
    # Owner-only PDFs open with an empty password; PDFLock must not strip restrictions that way.
    enc = make_encrypted_pdf(pdf_dir / "e.pdf", user="", allow=Permissions(extract=False))
    with pytest.raises(ProcessingError) as e:
        decrypt_pdf(enc, pdf_dir / "d.pdf", "", max_pages=MAX_PAGES)
    assert e.value.code == "password_required"
    with pytest.raises(ProcessingError) as e:
        decrypt_pdf(enc, pdf_dir / "d.pdf", WRONG_PW, max_pages=MAX_PAGES)
    assert e.value.code == "invalid_password"


def test_empty_password_on_user_protected_pdf_asks_for_password(pdf_dir: Path):
    enc = make_encrypted_pdf(pdf_dir / "e.pdf")
    with pytest.raises(ProcessingError) as e:
        decrypt_pdf(enc, pdf_dir / "d.pdf", "", max_pages=MAX_PAGES)
    assert e.value.code == "password_required"


def test_unencrypted_pdf_is_reported_even_without_password(pdf_dir: Path):
    out = decrypt_pdf(make_pdf(pdf_dir / "p.pdf"), pdf_dir / "d.pdf", "", max_pages=MAX_PAGES)
    assert out.status == "skipped" and out.error_code == "not_encrypted"


def test_restricted_pdf_needs_owner_password_to_decrypt(pdf_dir: Path):
    enc = make_encrypted_pdf(pdf_dir / "e.pdf", allow=Permissions(extract=False, print_highres=False))
    with pytest.raises(ProcessingError) as e:
        decrypt_pdf(enc, pdf_dir / "d.pdf", OPEN_PW, max_pages=MAX_PAGES)
    assert e.value.code == "owner_password_required"
    assert decrypt_pdf(enc, pdf_dir / "d.pdf", OWNER_PW, max_pages=MAX_PAGES).status == "success"


def test_decrypting_unencrypted_pdf_is_reported_not_faked(pdf_dir: Path):
    plain, dst = make_pdf(pdf_dir / "p.pdf"), pdf_dir / "d.pdf"
    out = decrypt_pdf(plain, dst, "whatever", max_pages=MAX_PAGES)
    assert out.status == "skipped" and out.error_code == "not_encrypted"
    assert not dst.exists()


def test_corrupt_pdf_is_rejected(pdf_dir: Path):
    bad = pdf_dir / "bad.pdf"
    bad.write_bytes(b"%PDF-1.7\nthis is not a real pdf body at all\n%%EOF")
    for fn, args in ((decrypt_pdf, ("pw",)), (encrypt_pdf, ("pw", EncryptOptions()))):
        with pytest.raises(ProcessingError) as e:
            fn(bad, pdf_dir / "o.pdf", *args, max_pages=MAX_PAGES)
        assert e.value.code == "corrupt_pdf"
    assert not (pdf_dir / "o.pdf").exists()


def test_page_limit_enforced(pdf_dir: Path):
    src = make_pdf(pdf_dir / "a.pdf", pages=5)
    with pytest.raises(ProcessingError) as e:
        encrypt_pdf(src, pdf_dir / "o.pdf", OPEN_PW, EncryptOptions(), max_pages=4)
    assert e.value.code == "too_many_pages"


def test_unsupported_encryption_handler_is_reported(pdf_dir: Path):
    enc = make_encrypted_pdf(pdf_dir / "e.pdf")
    raw = enc.read_bytes()
    assert b"/Standard" in raw
    patched = pdf_dir / "pubsec.pdf"
    patched.write_bytes(raw.replace(b"/Standard", b"/Adobe.X9"))  # same length, unknown handler
    with pytest.raises(ProcessingError) as e:
        decrypt_pdf(patched, pdf_dir / "o.pdf", OPEN_PW, max_pages=MAX_PAGES)
    assert e.value.code == "unsupported_encryption"


def test_progress_callback_reports_increasing_percentages(pdf_dir: Path):
    seen: list[int] = []
    encrypt_pdf(make_pdf(pdf_dir / "a.pdf", pages=10), pdf_dir / "o.pdf", OPEN_PW, EncryptOptions(),
                max_pages=MAX_PAGES, progress=seen.append)
    assert seen and seen[-1] == 100 and seen == sorted(seen)
