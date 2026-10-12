import { useCallback, useMemo, useState } from "react";
import type { FilePasswordEntry } from "../types";

export const EMPTY_ENTRY: FilePasswordEntry = Object.freeze({ password: "", confirm: "", override: false });

export interface SharedPassword {
  password: string;
  confirm: string;
}

export interface PasswordConfig {
  useShared: boolean;
  setUseShared: (on: boolean) => void;
  shared: SharedPassword;
  setShared: (patch: Partial<SharedPassword>) => void;
  entryFor: (id: string) => FilePasswordEntry;
  updateEntry: (id: string, patch: Partial<FilePasswordEntry>) => void;
  /** true when the shared password is what will be applied to this file */
  usesShared: (id: string) => boolean;
  /** The password (and confirmation) that will actually be used for a file. */
  effective: (id: string) => SharedPassword;
  /** Forget passwords for files that are no longer in the workspace. */
  prune: (keepIds: string[]) => void;
  reset: () => void;
}

/**
 * Password state for ONE operation. The workspace creates a separate instance for
 * decrypt and for encrypt, so a shared password can never leak across operations.
 * Everything lives in React state (memory) — never in storage, URLs or logs.
 *
 * Turning "same password for all" off keeps the per-file values intact, so
 * flipping the toggle never loses what the user typed.
 */
export function usePasswordConfig(): PasswordConfig {
  const [useShared, setUseShared] = useState(false);
  const [shared, setSharedState] = useState<SharedPassword>({ password: "", confirm: "" });
  const [entries, setEntries] = useState<Record<string, FilePasswordEntry>>({});

  const setShared = useCallback((patch: Partial<SharedPassword>) => setSharedState((s) => ({ ...s, ...patch })), []);

  const entryFor = useCallback((id: string) => entries[id] ?? EMPTY_ENTRY, [entries]);

  const updateEntry = useCallback((id: string, patch: Partial<FilePasswordEntry>) => {
    setEntries((prev) => ({ ...prev, [id]: { ...(prev[id] ?? EMPTY_ENTRY), ...patch } }));
  }, []);

  const usesShared = useCallback((id: string) => useShared && !(entries[id]?.override ?? false), [useShared, entries]);

  const effective = useCallback(
    (id: string): SharedPassword => {
      if (useShared && !(entries[id]?.override ?? false)) return shared;
      const e = entries[id] ?? EMPTY_ENTRY;
      return { password: e.password, confirm: e.confirm };
    },
    [useShared, entries, shared],
  );

  const prune = useCallback((keepIds: string[]) => {
    const keep = new Set(keepIds);
    setEntries((prev) => {
      const next: Record<string, FilePasswordEntry> = {};
      for (const [id, e] of Object.entries(prev)) if (keep.has(id)) next[id] = e;
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, []);

  const reset = useCallback(() => {
    setUseShared(false);
    setSharedState({ password: "", confirm: "" });
    setEntries({});
  }, []);

  return useMemo(
    () => ({ useShared, setUseShared, shared, setShared, entryFor, updateEntry, usesShared, effective, prune, reset }),
    [useShared, shared, setShared, entryFor, updateEntry, usesShared, effective, prune, reset],
  );
}
