"""PDF encryption / decryption on top of pikepdf (qpdf).

This module is deliberately free of web-framework imports so it can run inside
the lightweight worker subprocess. It never logs, and never puts a password in
an exception message.
"""

from __future__ import annotations

import errno
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

import pikepdf
from pikepdf import Encryption, PasswordError, PdfError, Permissions

from app.core.errors import ProcessingError

ProgressCallback = Callable[[int], None]

# Standard security handler limits: R6 (AES-256) passwords are truncated at
# 127 UTF-8 bytes, R4 (AES-128) at 32 bytes in PDFDocEncoding (~ASCII).
MAX_PASSWORD_BYTES = {"aes-256": 127, "aes-128": 32}


@dataclass
class EncryptOptions:
    algorithm: str = "aes-256"  # "aes-256" (R6, PDF 2.0) or "aes-128" (R4, max compatibility)
    owner_password: str | None = None
    allow_print: bool = True
    allow_copy: bool = True
    allow_edit: bool = True


@dataclass
class Outcome:
    status: str  # "success" | "skipped"
    page_count: int = 0
    warnings: list[str] = field(default_factory=list)
    error_code: str | None = None  # set when status == "skipped"


# --------------------------------------------------------------------------- helpers


def _classify_pdf_error(exc: Exception) -> ProcessingError:
    text = str(exc).lower()
    if "encrypt" in text and any(w in text for w in ("unsupported", "unknown", "not supported")):
        return ProcessingError("unsupported_encryption")
    if isinstance(exc, PasswordError):
        return ProcessingError("invalid_password")
    return ProcessingError("corrupt_pdf")


def _wrap_os_error(exc: OSError) -> ProcessingError:
    if exc.errno in {errno.ENOSPC, getattr(errno, "EDQUOT", errno.ENOSPC)}:
        return ProcessingError("storage_full")
    return ProcessingError("internal_error")


def _is_restricted(allow: Permissions) -> bool:
    """True when the document restricts anything other than accessibility."""
    return not all(
        (
            allow.print_lowres,
            allow.print_highres,
            allow.extract,
            allow.modify_annotation,
            allow.modify_assembly,
            allow.modify_form,
            allow.modify_other,
        )
    )


def _has_signature(pdf: pikepdf.Pdf) -> bool:
    """Best-effort detection of digitally signed documents (modification invalidates them)."""
    try:
        acro = pdf.Root.get("/AcroForm")
        if acro is None:
            return False
        if int(acro.get("/SigFlags", 0)) & 1:
            return True
        stack = list(acro.get("/Fields", []))
        seen = 0
        while stack and seen < 5000:
            field_obj = stack.pop()
            seen += 1
            if str(field_obj.get("/FT", "")) == "/Sig" and "/V" in field_obj:
                return True
            stack.extend(field_obj.get("/Kids", []))
    except Exception:  # detection is advisory only
        return False
    return False


def _check_pages(pdf: pikepdf.Pdf, max_pages: int) -> int:
    count = len(pdf.pages)
    if count > max_pages:
        raise ProcessingError("too_many_pages")
    return count


def _permissions(opts: EncryptOptions) -> Permissions:
    return Permissions(
        accessibility=True,  # screen-reader access is always kept
        print_lowres=opts.allow_print,
        print_highres=opts.allow_print,
        extract=opts.allow_copy,
        modify_other=opts.allow_edit,
        modify_annotation=opts.allow_edit,
        modify_form=opts.allow_edit,
        modify_assembly=opts.allow_edit,
    )


def validate_encrypt_inputs(password: str, opts: EncryptOptions) -> None:
    """Validate new-password rules for the chosen algorithm. Raises ProcessingError."""
    if opts.algorithm not in MAX_PASSWORD_BYTES:
        raise ProcessingError("invalid_options", "Unknown encryption algorithm.")
    if not password:
        raise ProcessingError("password_required", "Enter a new password for this file.")

    limit = MAX_PASSWORD_BYTES[opts.algorithm]
    owner = opts.owner_password or None
    for pw in filter(None, (password, owner)):
        if len(pw.encode("utf-8")) > limit:
            raise ProcessingError(
                "invalid_options",
                f"Passwords for {opts.algorithm.upper()} can be at most {limit} bytes.",
                "Use a shorter password, or choose AES-256.",
            )
        if opts.algorithm == "aes-128" and not pw.isascii():
            raise ProcessingError(
                "invalid_options",
                "AES-128 passwords must use plain ASCII characters.",
                "Remove accented/non-Latin characters, or choose AES-256.",
            )

    restricted = not (opts.allow_print and opts.allow_copy and opts.allow_edit)
    if restricted and (owner is None or owner == password):
        raise ProcessingError(
            "invalid_options",
            "Permission restrictions need a separate owner password.",
            "Set an owner password that differs from the open password, or allow all actions.",
        )


# --------------------------------------------------------------------------- operations


def decrypt_pdf(
    src: Path,
    dst: Path,
    password: str,
    *,
    max_pages: int,
    progress: ProgressCallback | None = None,
) -> Outcome:
    try:
        with pikepdf.open(src, password=password) as pdf:
            if not pdf.is_encrypted:
                return Outcome("skipped", len(pdf.pages), error_code="not_encrypted")
            if not password:
                # Owner-only PDFs open with an empty password; never strip them that way.
                raise ProcessingError("password_required")
            pages = _check_pages(pdf, max_pages)
            # Respect the author's access control: stripping restrictions needs the owner password.
            if not pdf.owner_password_matched and _is_restricted(pdf.allow):
                raise ProcessingError("owner_password_required")
            warnings = ["signature"] if _has_signature(pdf) else []
            pdf.save(dst, progress=progress)  # no `encryption` argument => written unencrypted
    except ProcessingError:
        _unlink(dst)
        raise
    except PasswordError:
        raise ProcessingError("invalid_password" if password else "password_required") from None
    except PdfError as exc:
        _unlink(dst)
        raise _classify_pdf_error(exc) from None
    except OSError as exc:
        _unlink(dst)
        raise _wrap_os_error(exc) from None

    # Verify the result really opens without a password.
    try:
        with pikepdf.open(dst) as check:
            if check.is_encrypted:
                raise ProcessingError("internal_error")
    except (PdfError, PasswordError):
        _unlink(dst)
        raise ProcessingError("internal_error") from None
    return Outcome("success", pages, warnings)


def encrypt_pdf(
    src: Path,
    dst: Path,
    password: str,
    options: EncryptOptions,
    *,
    max_pages: int,
    progress: ProgressCallback | None = None,
) -> Outcome:
    validate_encrypt_inputs(password, options)
    owner = options.owner_password or password
    r_level = 6 if options.algorithm == "aes-256" else 4
    try:
        with pikepdf.open(src) as pdf:  # no password: encrypted inputs are rejected below
            if pdf.is_encrypted:
                raise ProcessingError("already_encrypted")
            pages = _check_pages(pdf, max_pages)
            warnings = ["signature"] if _has_signature(pdf) else []
            enc = Encryption(
                user=password,
                owner=owner,
                R=r_level,
                allow=_permissions(options),
                aes=True,
                metadata=True,
            )
            pdf.save(dst, encryption=enc, progress=progress)
    except ProcessingError:
        _unlink(dst)
        raise
    except PasswordError:
        # Opening without a password failed => the file is already protected.
        raise ProcessingError("already_encrypted") from None
    except PdfError as exc:
        _unlink(dst)
        raise _classify_pdf_error(exc) from None
    except OSError as exc:
        _unlink(dst)
        raise _wrap_os_error(exc) from None

    # Verify the output opens with the new password (and is encrypted).
    try:
        with pikepdf.open(dst, password=password) as check:
            if not check.is_encrypted:
                raise ProcessingError("internal_error")
    except (PdfError, PasswordError):
        _unlink(dst)
        raise ProcessingError("internal_error") from None
    return Outcome("success", pages, warnings)


def _unlink(path: Path) -> None:
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass
