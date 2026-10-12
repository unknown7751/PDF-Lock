import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { THEME_KEY, useTheme } from "./useTheme";

const root = document.documentElement;

describe("useTheme", () => {
  it("defaults to dark for first-time visitors", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.classList.contains("light")).toBe(false);
  });

  it("toggles to light and back, updating the document class", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggle());
    expect(result.current.theme).toBe("light");
    expect(root.classList.contains("light")).toBe(true);
    expect(root.classList.contains("dark")).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.theme).toBe("dark");
    expect(root.classList.contains("dark")).toBe(true);
  });

  it("persists the preference across sessions", () => {
    const first = renderHook(() => useTheme());
    act(() => first.result.current.toggle());
    expect(localStorage.getItem(THEME_KEY)).toBe("light");
    first.unmount();

    const second = renderHook(() => useTheme());
    expect(second.result.current.theme).toBe("light");
    expect(root.classList.contains("light")).toBe(true);
  });

  it("stores nothing but the theme name", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggle());
    expect(Object.keys(localStorage)).toEqual([THEME_KEY]);
    expect(Object.keys(sessionStorage)).toEqual([]);
  });

  it("falls back to dark when storage is unavailable", () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("blocked");
    };
    try {
      const { result } = renderHook(() => useTheme());
      expect(result.current.theme).toBe("dark");
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});
