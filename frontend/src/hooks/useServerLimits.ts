import { useCallback, useEffect, useState } from "react";
import { fetchLimits } from "../lib/api";
import type { Limits } from "../lib/schemas";

/** Used until /api/config answers (and shown as conservative defaults if it never does). */
export const DEFAULT_LIMITS: Limits = {
  max_file_size_bytes: 50 * 1024 * 1024,
  max_total_size_bytes: 200 * 1024 * 1024,
  max_files: 20,
  max_pages: 2000,
  job_ttl_seconds: 900,
  processing_timeout_seconds: 120,
  algorithms: ["aes-256", "aes-128"],
};

export type LimitsStatus = "loading" | "ready" | "unreachable";

export function useServerLimits() {
  const [limits, setLimits] = useState<Limits>(DEFAULT_LIMITS);
  const [status, setStatus] = useState<LimitsStatus>("loading");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setLimits(await fetchLimits());
      setStatus("ready");
    } catch {
      setStatus("unreachable");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { limits, status, reload: load };
}
