import { baseName } from "./format";
import { nameSuffixSchema } from "./schemas";
import type { Operation } from "../types";

export interface NamingPreset {
  id: string;
  label: string;
  /** suffix appended to the file name; null = user-defined */
  suffix: string | null;
}

export const NAMING_PRESETS: Record<Operation, NamingPreset[]> = {
  decrypt: [
    { id: "decrypted", label: "name_decrypted.pdf", suffix: "_decrypted" },
    { id: "unlocked", label: "name_unlocked.pdf", suffix: "_unlocked" },
    { id: "original", label: "Keep the original name", suffix: "" },
    { id: "custom", label: "Custom suffix…", suffix: null },
  ],
  encrypt: [
    { id: "protected", label: "name_protected.pdf", suffix: "_protected" },
    { id: "encrypted", label: "name_encrypted.pdf", suffix: "_encrypted" },
    { id: "original", label: "Keep the original name", suffix: "" },
    { id: "custom", label: "Custom suffix…", suffix: null },
  ],
};

export interface NamingState {
  presetId: string;
  custom: string;
}

export const defaultNaming = (op: Operation): NamingState => ({
  presetId: (NAMING_PRESETS[op][0] as NamingPreset).id,
  custom: "",
});

export function resolveSuffix(op: Operation, state: NamingState): string {
  const preset = NAMING_PRESETS[op].find((p) => p.id === state.presetId) ?? NAMING_PRESETS[op][0];
  return preset?.suffix ?? state.custom;
}

/** Returns an error message for an invalid custom suffix, otherwise null. */
export function validateNaming(op: Operation, state: NamingState): string | null {
  const preset = NAMING_PRESETS[op].find((p) => p.id === state.presetId);
  if (!preset || preset.suffix !== null) return null;
  if (!state.custom.trim()) return "Enter a suffix, or pick one of the presets.";
  const parsed = nameSuffixSchema.safeParse(state.custom);
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? "Invalid suffix.");
}

export const previewName = (fileName: string, suffix: string) => `${baseName(fileName)}${suffix}.pdf`;
