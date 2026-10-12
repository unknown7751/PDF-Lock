import { describe, expect, it } from "vitest";
import { formatBytes, formatCountdown, plural } from "./format";
import { defaultNaming, previewName, resolveSuffix, validateNaming } from "./naming";
import { estimateStrength, generatePassword } from "./passwords";
import { decryptPasswordSchema, encryptPasswordSchema, nameSuffixSchema } from "./schemas";

describe("password strength", () => {
  it("rates short, weak, and strong passwords differently", () => {
    expect(estimateStrength("").label).toBe("Too short");
    expect(estimateStrength("abc12").label).toBe("Too short");
    expect(estimateStrength("password123").score).toBeLessThanOrEqual(1);
    expect(estimateStrength("Tr0ub4dor&3-horse-battery").score).toBeGreaterThanOrEqual(3);
    expect(estimateStrength("kV9#mQ2$xL7!pR4@wZ8^").label).toBe("Strong");
  });

  it("penalises repetition and keyboard runs", () => {
    expect(estimateStrength("aaaaaaaaaaaa").score).toBeLessThan(estimateStrength("a1B2c3D4e5F6").score);
    expect(estimateStrength("qwerty123456").score).toBeLessThan(3);
  });
});

describe("password generator", () => {
  it("creates random passwords containing every character class", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const pw = generatePassword(20);
      seen.add(pw);
      expect(pw).toHaveLength(20);
      expect(pw).toMatch(/[a-z]/);
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/\d/);
      expect(pw).toMatch(/[^A-Za-z0-9]/);
      expect(pw).not.toMatch(/[lIO01]/); // no look-alike characters
    }
    expect(seen.size).toBe(40);
  });

  it("generates passwords that satisfy the AES-128 ASCII/length rules", () => {
    const pw = generatePassword(20);
    expect(encryptPasswordSchema("aes-128").safeParse(pw).success).toBe(true);
  });
});

describe("password validation", () => {
  it("rejects an empty decryption password", () => {
    const r = decryptPasswordSchema.safeParse("");
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/enter/i);
    expect(decryptPasswordSchema.safeParse("x").success).toBe(true);
  });

  it("requires a sensible new password for encryption", () => {
    const schema = encryptPasswordSchema("aes-256");
    expect(schema.safeParse("").success).toBe(false);
    expect(schema.safeParse("short").success).toBe(false);
    expect(schema.safeParse("long-enough-1").success).toBe(true);
    expect(schema.safeParse("x".repeat(128)).success).toBe(false); // > 127 bytes
  });

  it("applies the stricter AES-128 limits", () => {
    const schema = encryptPasswordSchema("aes-128");
    expect(schema.safeParse("x".repeat(32)).success).toBe(true);
    expect(schema.safeParse("x".repeat(33)).success).toBe(false);
    expect(schema.safeParse("pässwörd-12").success).toBe(false); // non-ASCII
    expect(encryptPasswordSchema("aes-256").safeParse("pässwörd-12").success).toBe(true);
  });
});

describe("output naming", () => {
  it("resolves presets and previews names", () => {
    expect(resolveSuffix("decrypt", defaultNaming("decrypt"))).toBe("_decrypted");
    expect(resolveSuffix("encrypt", defaultNaming("encrypt"))).toBe("_protected");
    expect(resolveSuffix("decrypt", { presetId: "original", custom: "" })).toBe("");
    expect(previewName("invoice.pdf", "_decrypted")).toBe("invoice_decrypted.pdf");
    expect(previewName("Report.PDF", "_protected")).toBe("Report_protected.pdf");
  });

  it("validates custom suffixes", () => {
    const custom = (c: string) => ({ presetId: "custom", custom: c });
    expect(validateNaming("encrypt", custom(""))).toMatch(/enter a suffix/i);
    expect(validateNaming("encrypt", custom("_final"))).toBeNull();
    expect(validateNaming("encrypt", custom("../evil"))).not.toBeNull();
    expect(nameSuffixSchema.safeParse("x".repeat(40)).success).toBe(false);
    expect(validateNaming("encrypt", defaultNaming("encrypt"))).toBeNull();
  });
});

describe("formatting", () => {
  it("formats sizes, plurals and countdowns", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(50 * 1024 * 1024)).toBe("50.0 MB");
    expect(plural(1, "file")).toBe("1 file");
    expect(plural(3, "file")).toBe("3 files");
    expect(formatCountdown(125_000)).toBe("2:05");
  });
});
