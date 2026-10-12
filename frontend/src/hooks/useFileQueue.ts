import { useCallback, useEffect, useRef, useState } from "react";
import { inspectPdf, isPdfFile } from "../lib/pdf";
import type { AddFilesResult, Limits, QueuedFile, Rejection } from "../types";

export type QueueLimits = Pick<Limits, "max_file_size_bytes" | "max_files">;

let counter = 0;
/** crypto.randomUUID is unavailable on plain-http LAN origins, so keep a fallback. */
export function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  counter += 1;
  return `f${Date.now().toString(36)}${counter}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The list of selected PDFs: add (with validation, limits and duplicate
 * detection), remove, clear. Files are only held by reference — contents are
 * not read into state. A background pass runs an advisory pdf-lib inspection.
 */
export function useFileQueue(limits: QueueLimits) {
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const ref = useRef<QueuedFile[]>([]);
  const inspecting = useRef<string | null>(null);

  const commit = useCallback((next: QueuedFile[]) => {
    ref.current = next;
    setFiles(next);
  }, []);

  const addFiles = useCallback(
    async (incoming: File[]): Promise<AddFilesResult> => {
      const added: QueuedFile[] = [];
      const rejected: Rejection[] = [];
      const duplicates: string[] = [];

      for (const file of incoming) {
        if (file.size === 0) {
          rejected.push({ name: file.name, reason: "empty" });
          continue;
        }
        if (file.size > limits.max_file_size_bytes) {
          rejected.push({ name: file.name, reason: "too_large" });
          continue;
        }
        if (ref.current.length + added.length >= limits.max_files) {
          rejected.push({ name: file.name, reason: "limit" });
          continue;
        }
        if (!(await isPdfFile(file))) {
          rejected.push({ name: file.name, reason: "not_pdf" });
          continue;
        }
        const twin = [...ref.current, ...added].find(
          (f) => f.name === file.name && f.size === file.size && f.file.lastModified === file.lastModified,
        );
        const item: QueuedFile = {
          id: makeId(),
          file,
          name: file.name,
          size: file.size,
          inspection: { state: "pending" },
          duplicateOf: twin?.id,
        };
        if (twin) duplicates.push(file.name);
        added.push(item);
      }

      if (added.length) commit([...ref.current, ...added]);
      return { added, rejected, duplicates };
    },
    [commit, limits.max_file_size_bytes, limits.max_files],
  );

  const removeFile = useCallback((id: string) => commit(ref.current.filter((f) => f.id !== id)), [commit]);
  const clear = useCallback(() => commit([]), [commit]);

  // Inspect one pending file at a time so large batches never block the UI thread for long.
  useEffect(() => {
    const next = files.find((f) => f.inspection.state === "pending");
    if (!next || inspecting.current === next.id) return;
    inspecting.current = next.id;
    void inspectPdf(next.file).then((inspection) => {
      inspecting.current = null;
      commit(ref.current.map((f) => (f.id === next.id ? { ...f, inspection } : f)));
    });
  }, [files, commit]);

  const isInspecting = files.some((f) => f.inspection.state === "pending");

  return { files, addFiles, removeFile, clear, isInspecting };
}
