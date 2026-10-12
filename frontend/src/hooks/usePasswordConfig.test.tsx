import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePasswordConfig } from "./usePasswordConfig";

describe("usePasswordConfig", () => {
  it("uses each file's own password by default", () => {
    const { result } = renderHook(() => usePasswordConfig());
    act(() => {
      result.current.updateEntry("a", { password: "pw-a" });
      result.current.updateEntry("b", { password: "pw-b" });
    });
    expect(result.current.useShared).toBe(false);
    expect(result.current.effective("a").password).toBe("pw-a");
    expect(result.current.effective("b").password).toBe("pw-b");
    expect(result.current.usesShared("a")).toBe(false);
  });

  it("applies the shared password to every file when switched on", () => {
    const { result } = renderHook(() => usePasswordConfig());
    act(() => {
      result.current.updateEntry("a", { password: "pw-a" });
      result.current.setUseShared(true);
      result.current.setShared({ password: "shared-pw", confirm: "shared-pw" });
    });
    expect(result.current.effective("a")).toEqual({ password: "shared-pw", confirm: "shared-pw" });
    expect(result.current.effective("never-seen").password).toBe("shared-pw");
    expect(result.current.usesShared("a")).toBe(true);
  });

  it("lets a file explicitly override the shared password", () => {
    const { result } = renderHook(() => usePasswordConfig());
    act(() => {
      result.current.setUseShared(true);
      result.current.setShared({ password: "shared-pw", confirm: "shared-pw" });
      result.current.updateEntry("b", { password: "special", confirm: "special", override: true });
    });
    expect(result.current.effective("a").password).toBe("shared-pw");
    expect(result.current.effective("b").password).toBe("special");
    expect(result.current.usesShared("b")).toBe(false);

    act(() => result.current.updateEntry("b", { override: false }));
    expect(result.current.effective("b").password).toBe("shared-pw");
  });

  it("preserves individual passwords when switching shared mode on and off", () => {
    const { result } = renderHook(() => usePasswordConfig());
    act(() => {
      result.current.updateEntry("a", { password: "pw-a", confirm: "pw-a" });
      result.current.updateEntry("b", { password: "pw-b", confirm: "pw-b" });
    });
    act(() => result.current.setUseShared(true));
    act(() => result.current.setShared({ password: "shared" }));
    act(() => result.current.setUseShared(false));
    expect(result.current.effective("a")).toEqual({ password: "pw-a", confirm: "pw-a" });
    expect(result.current.effective("b")).toEqual({ password: "pw-b", confirm: "pw-b" });
    // …and the shared password is remembered for next time
    expect(result.current.shared.password).toBe("shared");
  });

  it("keeps decrypt and encrypt configurations completely separate", () => {
    const { result } = renderHook(() => ({ dec: usePasswordConfig(), enc: usePasswordConfig() }));
    act(() => {
      result.current.dec.setUseShared(true);
      result.current.dec.setShared({ password: "decrypt-shared" });
    });
    expect(result.current.enc.useShared).toBe(false);
    expect(result.current.enc.effective("a").password).toBe("");
  });

  it("forgets passwords for removed files and resets fully", () => {
    const { result } = renderHook(() => usePasswordConfig());
    act(() => {
      result.current.updateEntry("a", { password: "pw-a" });
      result.current.updateEntry("b", { password: "pw-b" });
    });
    act(() => result.current.prune(["a"]));
    expect(result.current.entryFor("a").password).toBe("pw-a");
    expect(result.current.entryFor("b").password).toBe("");

    act(() => {
      result.current.setUseShared(true);
      result.current.setShared({ password: "x" });
    });
    act(() => result.current.reset());
    expect(result.current.useShared).toBe(false);
    expect(result.current.shared.password).toBe("");
    expect(result.current.entryFor("a").password).toBe("");
  });

  it("never writes passwords to browser storage", () => {
    const { result } = renderHook(() => usePasswordConfig());
    act(() => {
      result.current.updateEntry("a", { password: "super-secret-1" });
      result.current.setShared({ password: "super-secret-2" });
    });
    const dump = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });
    expect(dump).not.toContain("super-secret");
  });
});
