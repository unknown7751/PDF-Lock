import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { brokenPdf, encryptedPdf, plainPdf, textFile } from "../test/fixtures";
import { useFileQueue } from "./useFileQueue";

const LIMITS = { max_file_size_bytes: 1024 * 1024, max_files: 3 };

function setup() {
  return renderHook(() => useFileQueue(LIMITS));
}

describe("useFileQueue", () => {
  it("accepts multiple PDFs at once and lets you add more later", async () => {
    const { result } = setup();
    let res!: Awaited<ReturnType<typeof result.current.addFiles>>;
    await act(async () => {
      res = await result.current.addFiles([plainPdf("a.pdf"), plainPdf("b.pdf", 2)]);
    });
    expect(res.added).toHaveLength(2);
    expect(result.current.files.map((f) => f.name)).toEqual(["a.pdf", "b.pdf"]);

    await act(async () => {
      await result.current.addFiles([encryptedPdf("c.pdf")]);
    });
    expect(result.current.files.map((f) => f.name)).toEqual(["a.pdf", "b.pdf", "c.pdf"]);
  });

  it("removes individual files and clears the whole queue", async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.addFiles([plainPdf("a.pdf"), plainPdf("b.pdf", 2), plainPdf("c.pdf", 3)]);
    });
    const [first, second] = result.current.files;
    act(() => result.current.removeFile((first as { id: string }).id));
    expect(result.current.files.map((f) => f.id)).not.toContain((first as { id: string }).id);
    expect(result.current.files).toHaveLength(2);
    expect(result.current.files[0]?.id).toBe((second as { id: string }).id);

    act(() => result.current.clear());
    expect(result.current.files).toEqual([]);
  });

  it("rejects non-PDF, empty and oversized files with reasons — without dropping the valid ones", async () => {
    const { result } = setup();
    const big = new File([new Uint8Array(LIMITS.max_file_size_bytes + 1)], "huge.pdf", { type: "application/pdf" });
    big.slice(0, 5); // size is what matters
    const fakePdf = new File(["MZ this is an exe"], "evil.pdf", { type: "application/pdf" });
    const empty = new File([], "empty.pdf", { type: "application/pdf" });
    let res!: Awaited<ReturnType<typeof result.current.addFiles>>;
    await act(async () => {
      res = await result.current.addFiles([textFile("notes.txt"), fakePdf, empty, big, plainPdf("ok.pdf")]);
    });
    expect(res.added.map((f) => f.name)).toEqual(["ok.pdf"]);
    expect(res.rejected).toEqual([
      { name: "notes.txt", reason: "not_pdf" },
      { name: "evil.pdf", reason: "not_pdf" },
      { name: "empty.pdf", reason: "empty" },
      { name: "huge.pdf", reason: "too_large" },
    ]);
    expect(result.current.files).toHaveLength(1);
  });

  it("enforces the file-count limit but keeps files that fit", async () => {
    const { result } = setup();
    let res!: Awaited<ReturnType<typeof result.current.addFiles>>;
    await act(async () => {
      res = await result.current.addFiles([1, 2, 3, 4, 5].map((n) => plainPdf(`f${n}.pdf`, n)));
    });
    expect(result.current.files).toHaveLength(3);
    expect(res.rejected.map((r) => r.reason)).toEqual(["limit", "limit"]);
  });

  it("warns about duplicate files but still lists them", async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.addFiles([plainPdf("same.pdf")]);
    });
    let res!: Awaited<ReturnType<typeof result.current.addFiles>>;
    await act(async () => {
      res = await result.current.addFiles([plainPdf("same.pdf")]); // identical name/size/date
    });
    expect(res.duplicates).toEqual(["same.pdf"]);
    expect(result.current.files).toHaveLength(2);
    expect(result.current.files[1]?.duplicateOf).toBe(result.current.files[0]?.id);
  });

  it("treats same-named files that differ as distinct (not duplicates)", async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.addFiles([plainPdf("report.pdf", 1), plainPdf("report.pdf", 2)]);
    });
    expect(result.current.files).toHaveLength(2);
    expect(result.current.files.every((f) => !f.duplicateOf)).toBe(true);
  });

  it("detects password-protected PDFs in the browser (advisory)", async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.addFiles([plainPdf("plain.pdf"), encryptedPdf("locked.pdf"), brokenPdf("broken.pdf")]);
    });
    await waitFor(() => expect(result.current.isInspecting).toBe(false));
    const byName = Object.fromEntries(result.current.files.map((f) => [f.name, f.inspection]));
    expect(byName["plain.pdf"]).toMatchObject({ state: "done", encrypted: false, pageCount: 2 });
    expect(byName["locked.pdf"]).toMatchObject({ state: "done", encrypted: true });
    expect(byName["broken.pdf"]).toMatchObject({ state: "done", encrypted: "unknown" }); // server decides
  });
});
