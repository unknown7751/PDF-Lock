import { useEffect, useRef, useState } from "react";
import { apiUrl, ApiError, getJob } from "../lib/api";
import { jobSnapshotSchema, type JobSnapshot } from "../lib/schemas";

/**
 * - live:         receiving Server-Sent Events
 * - reconnecting: the stream dropped; polling keeps the UI current
 * - offline:      neither works right now (network down); retrying with backoff
 */
export type Connection = "idle" | "live" | "reconnecting" | "offline";

interface Options {
  jobId: string | null;
  /** bump to reopen the stream for the same job (e.g. after a retry) */
  resumeKey?: number;
  onSnapshot: (snapshot: JobSnapshot) => void;
  /** the job no longer exists on the server (expired or deleted) */
  onGone: () => void;
}

const isFinal = (s: JobSnapshot) => s.status === "completed" || s.status === "cancelled";

/** Streams job updates over SSE and falls back to polling if the stream is unavailable. */
export function useJobStream({ jobId, resumeKey = 0, onSnapshot, onGone }: Options): Connection {
  const [connection, setConnection] = useState<Connection>("idle");
  const handlers = useRef({ onSnapshot, onGone });
  handlers.current = { onSnapshot, onGone };

  useEffect(() => {
    if (!jobId) {
      setConnection("idle");
      return;
    }
    let stopped = false;
    let source: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polling = false;
    let failures = 0;

    const stop = () => {
      stopped = true;
      source?.close();
      source = null;
      clearTimeout(timer);
    };

    const deliver = (snap: JobSnapshot) => {
      handlers.current.onSnapshot(snap);
      if (isFinal(snap)) {
        stop();
        setConnection("idle");
      }
    };

    const poll = async () => {
      if (stopped || !polling) return;
      try {
        const snap = await getJob(jobId);
        if (stopped) return;
        failures = 0;
        setConnection("reconnecting");
        deliver(snap);
      } catch (err) {
        if (stopped) return;
        if (err instanceof ApiError && (err.status === 404 || err.status === 410)) {
          stop();
          setConnection("idle");
          handlers.current.onGone();
          return;
        }
        failures += 1;
        setConnection("offline");
      }
      if (!stopped && polling) timer = setTimeout(poll, Math.min(1500 * 1.6 ** failures, 8000));
    };

    const startPolling = () => {
      if (polling || stopped) return;
      polling = true;
      timer = setTimeout(poll, 0);
    };

    if (typeof EventSource === "undefined") {
      startPolling();
    } else {
      source = new EventSource(apiUrl(`/api/jobs/${jobId}/events`));
      source.addEventListener("open", () => {
        polling = false;
        clearTimeout(timer);
        failures = 0;
        setConnection("live");
      });
      source.addEventListener("snapshot", (e) => {
        try {
          const parsed = jobSnapshotSchema.safeParse(JSON.parse((e as MessageEvent<string>).data));
          if (parsed.success) deliver(parsed.data);
        } catch {
          /* ignore a malformed frame; the next one replaces it */
        }
      });
      source.addEventListener("done", () => {
        stop();
        setConnection("idle");
      });
      source.addEventListener("gone", () => {
        stop();
        setConnection("idle");
        handlers.current.onGone();
      });
      source.addEventListener("error", () => {
        if (stopped) return;
        setConnection("reconnecting");
        startPolling();
      });
    }

    return stop;
  }, [jobId, resumeKey]);

  return connection;
}
