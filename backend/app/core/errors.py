"""Error catalogue and the single error response shape used by the API.

Every client-facing error (HTTP-level or per-file) has the form
``{"code": str, "message": str, "hint": str | None}``. Messages are generic and
never contain passwords, file contents or server paths.
"""

from __future__ import annotations

from dataclasses import dataclass

# code -> (message, hint). Per-file processing errors.
FILE_ERRORS: dict[str, tuple[str, str | None]] = {
    "invalid_password": (
        "The password is incorrect.",
        "Check the password for this file and retry. PDFLock never guesses or bypasses passwords.",
    ),
    "password_required": (
        "No password was provided for this file.",
        "Enter the password and retry.",
    ),
    "not_encrypted": (
        "This PDF isn't password-protected, so there was nothing to decrypt.",
        "You can use the file as it is, or switch to the Encrypt tab to protect it.",
    ),
    "already_encrypted": (
        "This PDF is already password-protected.",
        "Decrypt it first with its current password, then encrypt it again with a new one.",
    ),
    "owner_password_required": (
        "This PDF has usage restrictions (printing, copying or editing).",
        "Removing them requires the owner password. Enter it and retry.",
    ),
    "unsupported_encryption": (
        "This PDF uses an encryption method PDFLock can't process.",
        "Certificate-based or proprietary encryption isn't supported. Use the software that created it.",
    ),
    "corrupt_pdf": (
        "This file couldn't be read as a valid PDF.",
        "It may be damaged or incomplete. Try re-exporting or re-downloading it.",
    ),
    "not_a_pdf": (
        "This file isn't a PDF.",
        "Only files with PDF content can be processed.",
    ),
    "empty_file": ("This file is empty.", "Choose a file that contains data."),
    "file_too_large": (
        "This file is larger than the allowed size.",
        "Reduce the file size or split the document, then try again.",
    ),
    "too_many_pages": (
        "This PDF has more pages than the allowed maximum.",
        "Split the document into smaller parts and try again.",
    ),
    "invalid_options": (
        "The selected encryption options aren't valid.",
        "Review the password and permission settings.",
    ),
    "processing_timeout": (
        "Processing took too long and was stopped.",
        "Try again, or split very large documents into smaller parts.",
    ),
    "storage_full": (
        "The server ran out of temporary storage.",
        "Try again in a few minutes.",
    ),
    "cancelled": ("Processing was cancelled.", "Retry this file whenever you're ready."),
    "internal_error": (
        "Something went wrong while processing this file.",
        "Please try again. If it keeps failing, the file may be unusual or damaged.",
    ),
}


@dataclass
class ProcessingError(Exception):
    """Raised by the PDF engine. ``code`` indexes FILE_ERRORS; ``message`` may override."""

    code: str
    message: str | None = None
    hint: str | None = None

    def __str__(self) -> str:  # never include user data
        return self.code


class AppError(Exception):
    """HTTP-level error rendered with the standard error envelope."""

    def __init__(self, code: str, message: str, *, status: int = 400, hint: str | None = None):
        super().__init__(code)
        self.code = code
        self.message = message
        self.status = status
        self.hint = hint


def file_error_info(code: str, message: str | None = None, hint: str | None = None) -> dict:
    default_message, default_hint = FILE_ERRORS.get(code, FILE_ERRORS["internal_error"])
    return {"code": code, "message": message or default_message, "hint": hint or default_hint}
