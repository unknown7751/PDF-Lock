import type { FileResult, JobSnapshot } from "../lib/schemas";

/** Generated test documents (no real user data). Encrypted fixture password: "second-pw-22". */
export const TEST_PASSWORD = "second-pw-22";

const PLAIN_B64 =
  "JVBERi0xLjMKJb/3ov4KMSAwIG9iago8PCAvUGFnZXMgMyAwIFIgL1R5cGUgL0NhdGFsb2cgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL0F1dGhvciAoVGVzdCBBdXRob3IpIC9UaXRsZSAoUERGTG9jayBUZXN0IERvY3VtZW50KSA+PgplbmRvYmoKMyAwIG9iago8PCAvQ291bnQgMiAvS2lkcyBbIDQgMCBSIDUgMCBSIF0gL1R5cGUgL1BhZ2VzID4+CmVuZG9iago0IDAgb2JqCjw8IC9Db250ZW50cyA2IDAgUiAvTWVkaWFCb3ggWyAwIDAgNjEyIDc5MiBdIC9QYXJlbnQgMyAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNyAwIFIgPj4gPj4gL1R5cGUgL1BhZ2UgPj4KZW5kb2JqCjUgMCBvYmoKPDwgL0NvbnRlbnRzIDggMCBSIC9NZWRpYUJveCBbIDAgMCA2MTIgNzkyIF0gL1BhcmVudCAzIDAgUiAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA3IDAgUiA+PiA+PiAvVHlwZSAvUGFnZSA+PgplbmRvYmoKNiAwIG9iago8PCAvTGVuZ3RoIDUzIC9GaWx0ZXIgL0ZsYXRlRGVjb2RlID4+CnN0cmVhbQp4nHMKUdB3M1QwMlEISVMwN1IwNzBQCElR0AhwcfPJT85WKEhMT1Uw1FQIyVJwDQEA86oLTgplbmRzdHJlYW0KZW5kb2JqCjcgMCBvYmoKPDwgL0Jhc2VGb250IC9IZWx2ZXRpY2EgL1N1YnR5cGUgL1R5cGUxIC9UeXBlIC9Gb250ID4+CmVuZG9iago4IDAgb2JqCjw8IC9MZW5ndGggNTMgL0ZpbHRlciAvRmxhdGVEZWNvZGUgPj4Kc3RyZWFtCniccwpR0HczVDAyUQhJUzA3UjA3MFAISVHQCHBx88lPzlYoSExPVTDSVAjJUnANAQDzsgtPCmVuZHN0cmVhbQplbmRvYmoKeHJlZgowIDkKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDE1IDAwMDAwIG4gCjAwMDAwMDAwNjQgMDAwMDAgbiAKMDAwMDAwMDEzOCAwMDAwMCBuIAowMDAwMDAwMjAzIDAwMDAwIG4gCjAwMDAwMDAzMzEgMDAwMDAgbiAKMDAwMDAwMDQ1OSAwMDAwMCBuIAowMDAwMDAwNTgzIDAwMDAwIG4gCjAwMDAwMDA2NTMgMDAwMDAgbiAKdHJhaWxlciA8PCAvSW5mbyAyIDAgUiAvUm9vdCAxIDAgUiAvU2l6ZSA5IC9JRCBbPDZlMTY5ZTliZDlkNDg2ZThlNzkzNWQxYjQwZDY2OGE3Pjw2ZTE2OWU5YmQ5ZDQ4NmU4ZTc5MzVkMWI0MGQ2NjhhNz5dID4+CnN0YXJ0eHJlZgo3NzcKJSVFT0YK";

const ENCRYPTED_B64 =
  "JVBERi0xLjcKJb/3ov4KMSAwIG9iago8PCAvRXh0ZW5zaW9ucyA8PCAvQURCRSA8PCAvQmFzZVZlcnNpb24gLzEuNyAvRXh0ZW5zaW9uTGV2ZWwgOCA+PiA+PiAvUGFnZXMgMyAwIFIgL1R5cGUgL0NhdGFsb2cgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL0F1dGhvciA8NDVlOWM5MGU2MGEwZTBlODA0NDBiNzA2YTkzNGM0ZTliMjViN2IwNzAwNWFjMTYyYWY5YTRmNDhmOTA5NGU2Mz4gL1RpdGxlIDw2OWMyMWI2YjBhNTc4MmQyYWFmNmVlNjY2YzkyMzY4YzRjMTUxNmE4YWI3MzlmMTJhZTVkNTE0YWZlY2U1ZTU4ZDdkNTk1ZGUxNzhkMTQ3NzEzM2I1MDgzYTU3MzEyNWQ+ID4+CmVuZG9iagozIDAgb2JqCjw8IC9Db3VudCAyIC9LaWRzIFsgNCAwIFIgNSAwIFIgXSAvVHlwZSAvUGFnZXMgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0NvbnRlbnRzIDYgMCBSIC9NZWRpYUJveCBbIDAgMCA2MTIgNzkyIF0gL1BhcmVudCAzIDAgUiAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA3IDAgUiA+PiA+PiAvVHlwZSAvUGFnZSA+PgplbmRvYmoKNSAwIG9iago8PCAvQ29udGVudHMgOCAwIFIgL01lZGlhQm94IFsgMCAwIDYxMiA3OTIgXSAvUGFyZW50IDMgMCBSIC9SZXNvdXJjZXMgPDwgL0ZvbnQgPDwgL0YxIDcgMCBSID4+ID4+IC9UeXBlIC9QYWdlID4+CmVuZG9iago2IDAgb2JqCjw8IC9GaWx0ZXIgL0ZsYXRlRGVjb2RlIC9MZW5ndGggODAgPj4Kc3RyZWFtCltxRGzfJWBGhH2gG4S1n35KDGrPrVZcxmXFgezbWSzOxENvbAvQ+cpuB6qzqWGf8EFGSa55K4ZJ56tcAFRQOvTJ7QEKNx6S2HU9HyxN5X9aCmVuZHN0cmVhbQplbmRvYmoKNyAwIG9iago8PCAvQmFzZUZvbnQgL0hlbHZldGljYSAvU3VidHlwZSAvVHlwZTEgL1R5cGUgL0ZvbnQgPj4KZW5kb2JqCjggMCBvYmoKPDwgL0ZpbHRlciAvRmxhdGVEZWNvZGUgL0xlbmd0aCA4MCA+PgpzdHJlYW0KkzTOp+zTMLxSMS7XER9s7itpE7JMJXT2ITi7PQrfLxp+a91sTJa92zrOmPAOhH4TblH/5kqI47+G7sKISQZm2T9SxTJzeBsYP9Y6Q9hkUhgKZW5kc3RyZWFtCmVuZG9iago5IDAgb2JqCjw8IC9DRiA8PCAvU3RkQ0YgPDwgL0F1dGhFdmVudCAvRG9jT3BlbiAvQ0ZNIC9BRVNWMyAvTGVuZ3RoIDMyID4+ID4+IC9GaWx0ZXIgL1N0YW5kYXJkIC9MZW5ndGggMjU2IC9PIDxkMGVhY2JmOWRhMzVjOTk4Zjc5Y2Q2MDVhN2Y1YmI3ZDYwNTMxMDI0MzFiZjg0YjFlZDYwYWVjYTAzNmVlZmVhYTk5YzhkZGUzMmI4YTJmZDgwN2Q5NTQ4OWZiYWMxOTA+IC9PRSA8Mjc2NjY0NjlmNzk4ZGIwNDM1YjBmZDQ1MTk1NzkwYjcyNzg3YTViODYxYzJkNzcyNWE0N2YyODllMzBkMTk3Nj4gL1AgLTQgL1Blcm1zIDxjYWVhNDE4MDI0YjFlODNhOTNlYTBlNjRjOTk0ZmU2NT4gL1IgNiAvU3RtRiAvU3RkQ0YgL1N0ckYgL1N0ZENGIC9VIDw3YTVhM2M4YWI0ODM3NmU3OTk4MDJmMGE1YmMyZjFiYjU2MmVlM2QzOTY3N2EwOTlkMTY1MzYwYzY0ZGQxM2Y3ZjMwOTI0YmQ5NDY3NDcxMzVmMzI4NGFhMmMxN2EwYjY+IC9VRSA8Yjk0MjRkZTRjMTU0OTIxYmU1ODIyMDdhZGQwZDJlN2I4Yzg4OThmNDFlYTlhNWI5MGQyMTI2MTZlZGY3OTkyZj4gL1YgNSA+PgplbmRvYmoKeHJlZgowIDEwCjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAxNSAwMDAwMCBuIAowMDAwMDAwMTMwIDAwMDAwIG4gCjAwMDAwMDAzMzIgMDAwMDAgbiAKMDAwMDAwMDM5NyAwMDAwMCBuIAowMDAwMDAwNTI1IDAwMDAwIG4gCjAwMDAwMDA2NTMgMDAwMDAgbiAKMDAwMDAwMDgwNCAwMDAwMCBuIAowMDAwMDAwODc0IDAwMDAwIG4gCjAwMDAwMDEwMjUgMDAwMDAgbiAKdHJhaWxlciA8PCAvSW5mbyAyIDAgUiAvUm9vdCAxIDAgUiAvU2l6ZSAxMCAvSUQgWzw2ZTE2OWU5YmQ5ZDQ4NmU4ZTc5MzVkMWI0MGQ2NjhhNz48NmUxNjllOWJkOWQ0ODZlOGU3OTM1ZDFiNDBkNjY4YTc+XSAvRW5jcnlwdCA5IDAgUiA+PgpzdGFydHhyZWYKMTU3MgolJUVPRgo=";

const fromB64 = (b64: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

export function plainPdf(name = "plain.pdf", lastModified = 1_700_000_000_000): File {
  return new File([fromB64(PLAIN_B64)], name, { type: "application/pdf", lastModified });
}

export function encryptedPdf(name = "locked.pdf", lastModified = 1_700_000_000_000): File {
  return new File([fromB64(ENCRYPTED_B64)], name, { type: "application/pdf", lastModified });
}

/** Has a valid header but no usable structure (server reports it as corrupt). */
export function brokenPdf(name = "broken.pdf"): File {
  return new File(["%PDF-1.7\nnot really a pdf"], name, { type: "application/pdf" });
}

export function textFile(name = "notes.txt"): File {
  return new File(["just some text"], name, { type: "text/plain" });
}

/* ---------------------------------------------------------------- API snapshots */

type FileOverride = Partial<FileResult> & Pick<FileResult, "client_id" | "status">;

export function makeResult(o: FileOverride, index = 0): FileResult {
  const success = o.status === "success";
  return {
    id: `fid${index}`,
    original_name: `${o.client_id}.pdf`,
    input_size: 1000,
    progress: null,
    page_count: null,
    output_name: success ? `${o.client_id}_out.pdf` : null,
    output_size: success ? 900 : null,
    download_url: success ? `/api/jobs/job1/files/fid${index}/download` : null,
    error: null,
    warnings: [],
    ...o,
  };
}

export function makeSnapshot(files: FileOverride[], extra: Partial<JobSnapshot> = {}): JobSnapshot {
  const results = files.map(makeResult);
  const count = (s: FileResult["status"]) => results.filter((r) => r.status === s).length;
  const inFlight = count("queued") + count("processing");
  const success = count("success");
  return {
    id: "job1",
    operation: "decrypt",
    status: inFlight ? "processing" : "completed",
    created_at: 1_700_000_000,
    expires_at: Math.floor(Date.now() / 1000) + 900,
    counts: {
      total: results.length,
      queued: count("queued"),
      processing: count("processing"),
      success,
      failed: count("failed"),
      skipped: count("skipped"),
      cancelled: count("cancelled"),
    },
    overall_progress: results.length ? (results.length - inFlight) / results.length : 1,
    zip_url: success ? "/api/jobs/job1/download-zip" : null,
    files: results,
    ...extra,
  };
}

export const wrongPasswordError = {
  code: "invalid_password",
  message: "The password is incorrect.",
  hint: "Check the password for this file and retry.",
};
