import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePasswordConfig } from "../hooks/usePasswordConfig";
import type { QueuedFile } from "../types";
import { decryptEligibility, validateDecrypt } from "./decryption/validation";
import {
  DEFAULT_ADVANCED,
  encryptEligibility,
  validateAdvanced,
  validateEncrypt,
  validateSharedEncrypt,
} from "./encryption/validation";
import { buildJobArgs, buildRetryItems } from "./batch-processing/buildJob";
import { makeResult } from "../test/fixtures";

const file = (id: string, encrypted: boolean | "unknown" = "unknown"): QueuedFile => ({
  id,
  name: `${id}.pdf`,
  size: 100,
  file: new File(["%PDF-1.7"], `${id}.pdf`),
  inspection: { state: "done", encrypted },
});

describe("decrypt validation", () => {
  it("requires a password for every protected file", () => {
    const { result } = renderHook(() => usePasswordConfig());
    const files = [file("a", true), file("b", true)];
    act(() => result.current.updateEntry("a", { password: "pw" }));
    const errors = validateDecrypt(files, result.current);
    expect(errors.a).toBeUndefined();
    expect(errors.b?.password).toMatch(/password/i);
  });

  it("is satisfied for all files by one shared password", () => {
    const { result } = renderHook(() => usePasswordConfig());
    const files = [file("a", true), file("b", true)];
    act(() => {
      result.current.setUseShared(true);
      result.current.setShared({ password: "pw" });
    });
    expect(validateDecrypt(files, result.current)).toEqual({});
  });

  it("points at the shared field when it is empty, and accepts an override", () => {
    const { result } = renderHook(() => usePasswordConfig());
    const files = [file("a", true), file("b", true)];
    act(() => {
      result.current.setUseShared(true);
      result.current.updateEntry("b", { override: true, password: "own" });
    });
    const errors = validateDecrypt(files, result.current);
    expect(errors.a?.password).toMatch(/shared password/i);
    expect(errors.b).toBeUndefined();
  });

  it("excludes files known to be unprotected", () => {
    expect(decryptEligibility(file("p", false)).eligible).toBe(false);
    expect(decryptEligibility(file("p", true)).eligible).toBe(true);
    expect(decryptEligibility(file("p", "unknown")).eligible).toBe(true);
    const { result } = renderHook(() => usePasswordConfig());
    expect(validateDecrypt([file("p", false)], result.current)).toEqual({}); // no password needed
  });
});

describe("encrypt validation", () => {
  it("needs a strong-enough new password and a matching confirmation", () => {
    const { result } = renderHook(() => usePasswordConfig());
    const files = [file("a", false), file("b", false), file("c", false)];
    act(() => {
      result.current.updateEntry("a", { password: "good-password-1", confirm: "good-password-1" });
      result.current.updateEntry("b", { password: "short", confirm: "short" });
      result.current.updateEntry("c", { password: "good-password-1", confirm: "different-pw-22" });
    });
    const errors = validateEncrypt(files, result.current, DEFAULT_ADVANCED);
    expect(errors.a).toBeUndefined();
    expect(errors.b?.password).toMatch(/at least 8/);
    expect(errors.c?.confirm).toMatch(/match/i);
  });

  it("validates a shared password once and applies it to all files", () => {
    const { result } = renderHook(() => usePasswordConfig());
    const files = [file("a", false), file("b", false)];
    act(() => {
      result.current.setUseShared(true);
      result.current.setShared({ password: "shared-pass-99", confirm: "shared-pass-99" });
    });
    expect(validateEncrypt(files, result.current, DEFAULT_ADVANCED)).toEqual({});
    expect(validateSharedEncrypt({ password: "abc", confirm: "abd" }, "aes-256")).toMatchObject({
      password: expect.any(String),
      confirm: expect.stringMatching(/match/i),
    });
  });

  it("flags files that are already encrypted", () => {
    expect(encryptEligibility(file("x", true)).eligible).toBe(false);
    expect(encryptEligibility(file("x", false)).eligible).toBe(true);
  });

  it("requires an owner password (different from the open password) for restrictions", () => {
    expect(validateAdvanced(DEFAULT_ADVANCED, "pw")).toBeUndefined();
    const restricted = { ...DEFAULT_ADVANCED, allowPrint: false };
    expect(validateAdvanced(restricted, "open-pw-123")).toMatch(/owner password/i);
    expect(validateAdvanced({ ...restricted, ownerPassword: "open-pw-123" }, "open-pw-123")).toMatch(/differ/i);
    expect(validateAdvanced({ ...restricted, ownerPassword: "owner-pw-456" }, "open-pw-123")).toBeUndefined();
  });

  it("applies per-file algorithm overrides to password rules", () => {
    const { result } = renderHook(() => usePasswordConfig());
    const long = "x".repeat(40);
    act(() =>
      result.current.updateEntry("a", {
        password: long,
        confirm: long,
        advanced: { ...DEFAULT_ADVANCED, algorithm: "aes-128" },
      }),
    );
    const errors = validateEncrypt([file("a", false)], result.current, DEFAULT_ADVANCED);
    expect(errors.a?.password).toMatch(/AES-128/);
  });
});

describe("job building", () => {
  it("sends each file with its own effective password and options", () => {
    const { result } = renderHook(() => usePasswordConfig());
    const files = [file("a"), file("b")];
    act(() => {
      result.current.setUseShared(true);
      result.current.setShared({ password: "shared", confirm: "shared" });
      result.current.updateEntry("b", { override: true, password: "own-b", confirm: "own-b" });
    });
    const args = buildJobArgs({
      operation: "decrypt",
      files,
      config: result.current,
      batchAdvanced: DEFAULT_ADVANCED,
      nameSuffix: "_decrypted",
    });
    expect(args.files.map((f) => [f.wire.client_id, f.wire.password])).toEqual([
      ["a", "shared"],
      ["b", "own-b"],
    ]);
    expect(args.files[0]?.wire.encrypt).toBeUndefined();
  });

  it("includes encryption options only for the encrypt operation", () => {
    const { result } = renderHook(() => usePasswordConfig());
    act(() => result.current.updateEntry("a", { password: "pw-a-12345", confirm: "pw-a-12345" }));
    const args = buildJobArgs({
      operation: "encrypt",
      files: [file("a")],
      config: result.current,
      batchAdvanced: { ...DEFAULT_ADVANCED, allowCopy: false, ownerPassword: "owner-pw-1" },
      nameSuffix: "_protected",
    });
    expect(args.files[0]?.wire.encrypt).toEqual({
      algorithm: "aes-256",
      owner_password: "owner-pw-1",
      allow_print: true,
      allow_copy: false,
      allow_edit: true,
    });
  });

  it("retries with a freshly typed password when provided, otherwise the previous one", () => {
    const { result } = renderHook(() => usePasswordConfig());
    act(() => {
      result.current.setUseShared(true);
      result.current.setShared({ password: "wrong-shared" });
      result.current.updateEntry("b", { override: true, password: "fixed-b" });
    });
    const failed = [
      makeResult({ client_id: "a", status: "failed" }, 0),
      makeResult({ client_id: "b", status: "failed" }, 1),
    ];
    const items = buildRetryItems("decrypt", failed, result.current, DEFAULT_ADVANCED);
    expect(items).toEqual([
      { file_id: "fid0", password: "wrong-shared" },
      { file_id: "fid1", password: "fixed-b" },
    ]);
  });
});
