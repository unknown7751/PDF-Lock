import type { Inspection } from "../types";

/** Browsers accept the %PDF- marker anywhere in the first 1 KiB. */
export function hasPdfHeader(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, 1024) - 4;
  for (let i = 0; i < limit; i++) {
    if (bytes[i] === 0x25 && bytes[i + 1] === 0x50 && bytes[i + 2] === 0x44 && bytes[i + 3] === 0x46 && bytes[i + 4] === 0x2d) {
      return true;
    }
  }
  return false;
}

export async function readBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function") return new Uint8Array(await blob.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

export async function isPdfFile(file: File): Promise<boolean> {
  if (file.size === 0) return false;
  return hasPdfHeader(await readBytes(file.slice(0, 1024)));
}

/** Files above this size skip the in-browser pre-check (the server always validates). */
export const INSPECT_MAX_BYTES = 25 * 1024 * 1024;

/**
 * Advisory pre-check using pdf-lib: tells us whether a PDF is password-protected
 * (pdf-lib refuses to load encrypted documents) so the UI can warn before upload.
 * The server remains the source of truth. pdf-lib is loaded lazily.
 */
export async function inspectPdf(file: File): Promise<Extract<Inspection, { state: "done" }>> {
  if (file.size > INSPECT_MAX_BYTES) return { state: "done", encrypted: "unknown" };
  try {
    const { PDFDocument } = await import("pdf-lib");
    const bytes = await readBytes(file);
    // ignoreEncryption lets us read the structure of protected files and ask pdf-lib whether
    // they are encrypted (its EncryptedPDFError doesn't survive `instanceof`, so don't rely on it).
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false });
    return { state: "done", encrypted: doc.isEncrypted, pageCount: doc.getPageCount() };
  } catch {
    return { state: "done", encrypted: "unknown" };
  }
}
