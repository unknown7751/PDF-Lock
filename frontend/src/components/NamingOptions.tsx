import { FileOutput } from "lucide-react";
import { useId } from "react";
import { NAMING_PRESETS, previewName, resolveSuffix, validateNaming, type NamingState } from "../lib/naming";
import type { Operation } from "../types";

interface NamingOptionsProps {
  operation: Operation;
  value: NamingState;
  onChange: (next: NamingState) => void;
  /** a file name used to preview the result */
  sampleName?: string;
  disabled?: boolean;
  forceShowError?: boolean;
}

/** Output file naming convention (preset suffixes, keep original, or custom). */
export function NamingOptions({ operation, value, onChange, sampleName = "invoice.pdf", disabled, forceShowError }: NamingOptionsProps) {
  const selectId = useId();
  const customId = useId();
  const error = validateNaming(operation, value);
  const suffix = resolveSuffix(operation, value);
  const isCustom = value.presetId === "custom";

  return (
    <div>
      <label htmlFor={selectId} className="mb-1.5 flex items-center gap-2 text-sm font-medium">
        <FileOutput className="size-4 text-accent" aria-hidden />
        Output file names
      </label>
      <select
        id={selectId}
        className="field"
        disabled={disabled}
        value={value.presetId}
        onChange={(e) => onChange({ ...value, presetId: e.target.value })}
      >
        {NAMING_PRESETS[operation].map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      {isCustom && (
        <div className="mt-2">
          <label htmlFor={customId} className="sr-only">
            Custom file name suffix
          </label>
          <input
            id={customId}
            className="field"
            disabled={disabled}
            value={value.custom}
            maxLength={32}
            placeholder="e.g. _final"
            aria-invalid={Boolean(error) && forceShowError}
            onChange={(e) => onChange({ ...value, custom: e.target.value })}
          />
        </div>
      )}
      {error && (isCustom ? forceShowError || value.custom.length > 0 : false) && (
        <p className="mt-1.5 text-xs font-medium text-danger">{error}</p>
      )}
      <p className="mt-1.5 text-xs text-muted">
        Example: <span className="font-mono text-fg">{sampleName}</span> →{" "}
        <span className="font-mono text-fg">{previewName(sampleName, error ? "" : suffix)}</span>
      </p>
    </div>
  );
}
