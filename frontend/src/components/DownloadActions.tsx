import { motion } from "motion/react";
import { Download, FolderArchive, RefreshCw, Trash2 } from "lucide-react";
import { apiUrl } from "../lib/api";
import { formatBytes, plural } from "../lib/format";
import type { FileResult } from "../lib/schemas";

/** Download link for one processed PDF (streams straight from the server). */
export function DownloadButton({ result, compact = false }: { result: FileResult; compact?: boolean }) {
  if (!result.download_url) return null;
  return (
    <a
      href={apiUrl(result.download_url)}
      download={result.output_name ?? undefined}
      className={`btn btn-secondary ${compact ? "min-h-11" : ""}`}
      aria-label={`Download ${result.output_name ?? "result"}${result.output_size ? ` (${formatBytes(result.output_size)})` : ""}`}
    >
      <Download className="size-4" aria-hidden />
      Download
    </a>
  );
}

interface DownloadActionsProps {
  zipUrl?: string | null;
  successCount: number;
  retryableCount: number;
  canRetry: boolean;
  onRetryFailed: () => void;
  onNewBatch: () => void;
}

/** Batch-level actions shown when processing has finished. */
export function DownloadActions({ zipUrl, successCount, retryableCount, canRetry, onRetryFailed, onNewBatch }: DownloadActionsProps) {
  return (
    <div className="flex flex-col gap-2.5">
      {zipUrl && successCount > 0 && (
        <motion.a
          href={apiUrl(zipUrl)}
          download
          whileTap={{ scale: 0.98 }}
          className="btn btn-primary min-h-12 w-full"
        >
          <FolderArchive className="size-4" aria-hidden />
          Download all as ZIP ({plural(successCount, "file")})
        </motion.a>
      )}
      {retryableCount > 0 && (
        <button type="button" className="btn btn-secondary w-full" disabled={!canRetry} onClick={onRetryFailed}>
          <RefreshCw className="size-4" aria-hidden />
          Retry {retryableCount} failed {retryableCount === 1 ? "file" : "files"}
        </button>
      )}
      <button type="button" className="btn btn-ghost w-full border border-line" onClick={onNewBatch}>
        <Trash2 className="size-4" aria-hidden />
        Clear results &amp; start a new batch
      </button>
    </div>
  );
}
