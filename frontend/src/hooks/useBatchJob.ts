import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  cancelJob,
  createJob,
  deleteJob,
  retryJob,
  type CreateJobArgs,
  type RetryWireItem,
} from "../lib/api";
import type { JobSnapshot } from "../lib/schemas";
import type { Operation } from "../types";
import { useJobStream } from "./useJobStream";

export type BatchPhase = "idle" | "uploading" | "processing" | "finished";

const toApiError = (err: unknown): ApiError =>
  err instanceof ApiError ? err : new ApiError("unexpected_error", "Something unexpected happened.", 0, "Please try again.");

/**
 * Owns one server-side batch job: upload (with real progress), live updates,
 * cancel, retry-failed and discard. A busy flag prevents duplicate submissions.
 */
export function useBatchJob() {
  const [snapshot, setSnapshot] = useState<JobSnapshot | null>(null);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<ApiError | null>(null);
  const [expired, setExpired] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [resumeKey, setResumeKey] = useState(0);

  const busy = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const jobIdRef = useRef<string | null>(null);
  jobIdRef.current = snapshot?.id ?? null;

  const connection = useJobStream({
    jobId: snapshot?.id ?? null,
    resumeKey,
    onSnapshot: (s) => {
      setSnapshot(s);
      if (s.status !== "processing" && s.status !== "queued") setCancelling(false);
    },
    onGone: () => {
      setSnapshot(null);
      setOperation(null);
      setCancelling(false);
      setExpired(true);
    },
  });

  const phase: BatchPhase = uploading
    ? "uploading"
    : !snapshot
      ? "idle"
      : snapshot.status === "queued" || snapshot.status === "processing"
        ? "processing"
        : "finished";

  const start = useCallback(async (args: Omit<CreateJobArgs, "signal" | "onUploadProgress">): Promise<boolean> => {
    if (busy.current || jobIdRef.current) return false; // no duplicate submissions
    busy.current = true;
    const controller = new AbortController();
    abort.current = controller;
    setError(null);
    setExpired(false);
    setUploadProgress(0);
    setUploading(true);
    try {
      const snap = await createJob({ ...args, signal: controller.signal, onUploadProgress: setUploadProgress });
      setOperation(args.operation);
      setSnapshot(snap);
      return true;
    } catch (err) {
      const apiErr = toApiError(err);
      if (apiErr.code !== "aborted") setError(apiErr);
      return false;
    } finally {
      busy.current = false;
      abort.current = null;
      setUploading(false);
    }
  }, []);

  const cancel = useCallback(async () => {
    if (abort.current) {
      abort.current.abort();
      return;
    }
    const id = jobIdRef.current;
    if (!id) return;
    setCancelling(true);
    try {
      setSnapshot(await cancelJob(id));
    } catch (err) {
      setCancelling(false);
      setError(toApiError(err));
    }
  }, []);

  const retry = useCallback(async (items: RetryWireItem[]): Promise<boolean> => {
    const id = jobIdRef.current;
    if (!id || busy.current || items.length === 0) return false;
    busy.current = true;
    setError(null);
    try {
      setSnapshot(await retryJob(id, items));
      setResumeKey((k) => k + 1); // reopen the event stream for the re-queued files
      return true;
    } catch (err) {
      setError(toApiError(err));
      return false;
    } finally {
      busy.current = false;
    }
  }, []);

  /** Delete the job and its files from the server and reset to the idle state. */
  const discard = useCallback(async () => {
    const id = jobIdRef.current;
    setSnapshot(null);
    setOperation(null);
    setCancelling(false);
    setExpired(false);
    setError(null);
    if (id) {
      try {
        await deleteJob(id);
      } catch {
        /* already gone (expired) or offline — the server expires it anyway */
      }
    }
  }, []);

  // Best effort: remove the files from the server when the user leaves the page.
  useEffect(() => {
    const onHide = () => {
      if (jobIdRef.current) void deleteJob(jobIdRef.current, true).catch(() => undefined);
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { phase, snapshot, operation, uploadProgress, error, expired, cancelling, connection, start, cancel, retry, discard, clearError };
}
