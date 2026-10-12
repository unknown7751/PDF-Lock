import { z } from "zod";

/* ------------------------------------------------------------------ API responses */

export const errorInfoSchema = z.object({
  code: z.string(),
  message: z.string(),
  hint: z.string().nullish(),
});

export const apiErrorSchema = z.object({ error: errorInfoSchema });

export const fileStatusSchema = z.enum(["queued", "processing", "success", "failed", "skipped", "cancelled"]);

export const fileResultSchema = z.object({
  id: z.string(),
  client_id: z.string(),
  original_name: z.string(),
  input_size: z.number(),
  status: fileStatusSchema,
  progress: z.number().nullish(),
  page_count: z.number().nullish(),
  output_name: z.string().nullish(),
  output_size: z.number().nullish(),
  download_url: z.string().nullish(),
  error: errorInfoSchema.nullish(),
  warnings: z.array(z.string()).default([]),
});

export const jobSnapshotSchema = z.object({
  id: z.string(),
  operation: z.enum(["encrypt", "decrypt"]),
  status: z.enum(["queued", "processing", "completed", "cancelled"]),
  created_at: z.number(),
  expires_at: z.number(),
  counts: z.object({
    total: z.number(),
    queued: z.number(),
    processing: z.number(),
    success: z.number(),
    failed: z.number(),
    skipped: z.number(),
    cancelled: z.number(),
  }),
  overall_progress: z.number(),
  zip_url: z.string().nullish(),
  files: z.array(fileResultSchema),
});

export const limitsSchema = z.object({
  max_file_size_bytes: z.number(),
  max_total_size_bytes: z.number(),
  max_files: z.number(),
  max_pages: z.number(),
  job_ttl_seconds: z.number(),
  processing_timeout_seconds: z.number(),
  algorithms: z.array(z.string()),
});

/* ------------------------------------------------------------------ form validation */

export const ALGORITHMS = ["aes-256", "aes-128"] as const;
export type Algorithm = (typeof ALGORITHMS)[number];

export const MIN_NEW_PASSWORD_LENGTH = 8;
const MAX_BYTES: Record<Algorithm, number> = { "aes-256": 127, "aes-128": 32 };

const byteLength = (s: string) => new TextEncoder().encode(s).length;

/** Existing password used to open a protected PDF. */
export const decryptPasswordSchema = z
  .string()
  .min(1, "Enter this file's current password.")
  .max(1024, "That password is too long.");

/** New password for encryption; rules depend on the chosen algorithm. */
export function encryptPasswordSchema(algorithm: Algorithm) {
  return z
    .string()
    .min(1, "Enter a new password.")
    .min(MIN_NEW_PASSWORD_LENGTH, `Use at least ${MIN_NEW_PASSWORD_LENGTH} characters.`)
    .refine((v) => byteLength(v) <= MAX_BYTES[algorithm], {
      message: `Passwords for ${algorithm.toUpperCase()} can be at most ${MAX_BYTES[algorithm]} bytes. Use a shorter one or AES-256.`,
    })
    .refine((v) => algorithm !== "aes-128" || /^[\x20-\x7e]*$/.test(v), {
      message: "AES-128 passwords must use plain ASCII characters. Remove accents or choose AES-256.",
    });
}

export const nameSuffixSchema = z
  .string()
  .max(32, "Use at most 32 characters.")
  .regex(/^[\w .()-]*$/, "Use letters, numbers, spaces, dots, dashes or brackets only.");

export const encryptAdvancedSchema = z.object({
  algorithm: z.enum(ALGORITHMS),
  ownerPassword: z.string().max(256),
  allowPrint: z.boolean(),
  allowCopy: z.boolean(),
  allowEdit: z.boolean(),
});

export type ApiErrorBody = z.infer<typeof apiErrorSchema>;
export type ErrorInfo = z.infer<typeof errorInfoSchema>;
export type FileStatus = z.infer<typeof fileStatusSchema>;
export type FileResult = z.infer<typeof fileResultSchema>;
export type JobSnapshot = z.infer<typeof jobSnapshotSchema>;
export type Limits = z.infer<typeof limitsSchema>;
export type EncryptAdvanced = z.infer<typeof encryptAdvancedSchema>;
