import { motion } from "motion/react";
import { FilePlus2, UploadCloud } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { formatBytes, plural } from "../lib/format";

interface PDFDropzoneProps {
  onFiles: (files: File[]) => void;
  maxFileSize: number;
  maxFiles: number;
  fileCount: number;
  disabled?: boolean;
  /** lets other parts of the page (hero button) open the file picker */
  openRef?: { current: (() => void) | null };
}

/** Drag-and-drop + click-to-browse area for multiple PDFs. Fully keyboard operable. */
export function PDFDropzone({ onFiles, maxFileSize, maxFiles, fileCount, disabled, openRef }: PDFDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const compact = fileCount > 0;

  const openPicker = useCallback(() => {
    if (!disabled) inputRef.current?.click();
  }, [disabled]);

  useEffect(() => {
    if (!openRef) return;
    openRef.current = openPicker;
    return () => {
      openRef.current = null;
    };
  }, [openRef, openPicker]);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    depth.current = 0;
    setDragging(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onFiles(files);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPicker();
    }
  };

  const remaining = Math.max(0, maxFiles - fileCount);

  return (
    <motion.div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      aria-label={`Choose PDF files or drag and drop them here. Up to ${plural(remaining, "more file")}, ${formatBytes(maxFileSize)} each.`}
      onClick={openPicker}
      onKeyDown={onKeyDown}
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current += 1;
        if (!disabled) setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      }}
      onDrop={handleDrop}
      animate={{
        scale: dragging ? 1.015 : 1,
        borderColor: dragging ? "var(--accent)" : "var(--line)",
        backgroundColor: dragging ? "var(--accent-soft)" : "var(--surface)",
      }}
      whileHover={disabled ? undefined : { y: -1 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      className={`glow-hover group relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed px-6 text-center ${
        compact ? "py-6" : "py-12"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="application/pdf,.pdf"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-testid="file-input"
        disabled={disabled}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = ""; // allow picking the same file again later
          if (files.length) onFiles(files);
        }}
      />

      <motion.div
        animate={dragging ? { y: -6, scale: 1.12 } : { y: [0, -4, 0] }}
        transition={dragging ? { type: "spring", stiffness: 400, damping: 18 } : { duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent"
      >
        {compact ? <FilePlus2 className="size-7" aria-hidden /> : <UploadCloud className="size-7" aria-hidden />}
      </motion.div>

      <p className="text-base font-semibold">
        {dragging ? "Drop your PDFs to add them" : compact ? "Add more PDFs" : "Drag & drop PDFs here"}
      </p>
      <p className="mt-1 text-sm text-muted">
        or <span className="font-medium text-accent underline underline-offset-4">browse files</span> — select as many as you like
      </p>
      <p className="mt-3 text-xs text-muted">
        Up to {plural(maxFiles, "file")} · {formatBytes(maxFileSize)} each · PDF only
      </p>
    </motion.div>
  );
}
