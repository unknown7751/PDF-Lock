"""Filename sanitisation and small validation helpers."""

from __future__ import annotations

import re
import unicodedata

_INVALID_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f\x7f]')
_WHITESPACE = re.compile(r"\s+")
_RESERVED = {
    "CON", "PRN", "AUX", "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
}
_SUFFIX_RE = re.compile(r"^[\w .()\-]{0,32}$")

MAX_STEM = 100


def safe_stem(filename: str | None) -> str:
    """Return a filesystem-safe stem for a client-supplied filename.

    Strips any path components, the .pdf extension, control characters and
    characters that are invalid on common filesystems, and avoids reserved
    Windows device names. Never returns an empty string.
    """
    name = (filename or "").replace("\\", "/").rsplit("/", 1)[-1]
    name = unicodedata.normalize("NFC", name)
    if name.lower().endswith(".pdf"):
        name = name[:-4]
    name = _INVALID_CHARS.sub("_", name)
    name = _WHITESPACE.sub(" ", name).strip(" .")
    name = name[:MAX_STEM].strip(" .")
    if not name or set(name) <= {"_"}:
        return "document"
    if name.split(".")[0].upper() in _RESERVED:
        name = f"_{name}"
    return name


def sanitize_suffix(suffix: str | None, default: str) -> str:
    """Validate the user-chosen output suffix; fall back to the default if unsafe."""
    if suffix is None or not _SUFFIX_RE.fullmatch(suffix):
        return default
    return suffix


def looks_like_pdf(head: bytes) -> bool:
    """PDF readers accept the %PDF- header anywhere in the first 1024 bytes."""
    return b"%PDF-" in head[:1024]
