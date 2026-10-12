import type { ZodType } from "zod";
import {
  apiErrorSchema,
  jobSnapshotSchema,
  limitsSchema,
  type EncryptAdvanced,
  type JobSnapshot,
  type Limits,
} from "./schemas";
import type { Operation } from "../types";

export const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  readonly code: string;
  readonly hint: string | null;
  readonly status: number;

  constructor(code: string, message: string, status = 0, hint: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.hint = hint;
    this.status = status;
  }
}

export const networkError = () =>
  new ApiError(
    "network_error",
    "Can't reach the PDFLock server.",
    0,
    "Check your internet connection and that the backend is running, then try again.",
  );

/** Absolute URL for a server-provided relative path (downloads, events). */
export const apiUrl = (path: string) => `${API_BASE}${path}`;

function toApiError(status: number, body: unknown): ApiError {
  const parsed = apiErrorSchema.safeParse(body);
  if (parsed.success) {
    const { code, message, hint } = parsed.data.error;
    return new ApiError(code, message, status, hint ?? null);
  }
  return new ApiError("unexpected_response", "The server sent an unexpected response.", status, "Please try again.");
}

async function request<T>(path: string, schema: ZodType<T> | null, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), init);
  } catch {
    throw networkError();
  }
  if (res.status === 204) return undefined as T;
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) throw toApiError(res.status, body);
  if (!schema) return body as T;
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError("unexpected_response", "The server sent an unexpected response.", res.status);
  return parsed.data;
}

export const fetchLimits = (): Promise<Limits> => request("/api/config", limitsSchema);
export const getJob = (id: string): Promise<JobSnapshot> => request(`/api/jobs/${id}`, jobSnapshotSchema);
export const cancelJob = (id: string): Promise<JobSnapshot> =>
  request(`/api/jobs/${id}/cancel`, jobSnapshotSchema, { method: "POST" });
export const deleteJob = (id: string, keepalive = false): Promise<void> =>
  request(`/api/jobs/${id}`, null, { method: "DELETE", keepalive });

/* ------------------------------------------------------------------ wire formats */

export interface EncryptWire {
  algorithm: EncryptAdvanced["algorithm"];
  owner_password: string | null;
  allow_print: boolean;
  allow_copy: boolean;
  allow_edit: boolean;
}

export const toEncryptWire = (a: EncryptAdvanced): EncryptWire => ({
  algorithm: a.algorithm,
  owner_password: a.ownerPassword || null,
  allow_print: a.allowPrint,
  allow_copy: a.allowCopy,
  allow_edit: a.allowEdit,
});

export interface WireFile {
  client_id: string;
  password: string;
  encrypt?: EncryptWire;
}

export interface RetryWireItem {
  file_id: string;
  password: string;
  encrypt?: EncryptWire;
}

export const retryJob = (id: string, files: RetryWireItem[]): Promise<JobSnapshot> =>
  request(`/api/jobs/${id}/retry`, jobSnapshotSchema, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files }),
  });

/* ------------------------------------------------------------------ upload (XHR for real progress) */

export interface CreateJobArgs {
  operation: Operation;
  nameSuffix: string;
  files: { file: File; wire: WireFile }[];
  onUploadProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/** Multipart upload. Passwords travel in the request body only — never in a URL. */
export function createJob({ operation, nameSuffix, files, onUploadProgress, signal }: CreateJobArgs): Promise<JobSnapshot> {
  return new Promise<JobSnapshot>((resolve, reject) => {
    const form = new FormData();
    form.append(
      "manifest",
      JSON.stringify({ operation, name_suffix: nameSuffix, files: files.map((f) => f.wire) }),
    );
    for (const { file } of files) form.append("files", file, file.name);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", apiUrl("/api/jobs"));
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onUploadProgress?.(e.loaded / e.total);
    };
    xhr.onerror = () => reject(networkError());
    xhr.ontimeout = () => reject(networkError());
    xhr.onabort = () => reject(new ApiError("aborted", "Upload cancelled."));
    xhr.onload = () => {
      const body: unknown = xhr.response;
      if (xhr.status >= 200 && xhr.status < 300) {
        const parsed = jobSnapshotSchema.safeParse(body);
        if (parsed.success) resolve(parsed.data);
        else reject(new ApiError("unexpected_response", "The server sent an unexpected response.", xhr.status));
      } else {
        reject(toApiError(xhr.status, body));
      }
    };
    if (signal) {
      if (signal.aborted) return reject(new ApiError("aborted", "Upload cancelled."));
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(form);
  });
}
