import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiUrl, cancelJob, createJob, deleteJob, fetchLimits, getJob, retryJob, toEncryptWire } from "./api";
import { makeSnapshot } from "../test/fixtures";

afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("api client", () => {
  it("parses a valid job snapshot and rejects an unexpected shape", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(makeSnapshot([{ client_id: "a", status: "success" }]))));
    expect((await getJob("job1")).counts.success).toBe(1);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ nonsense: true })));
    await expect(getJob("job1")).rejects.toMatchObject({ code: "unexpected_response" });
  });

  it("turns the server's error envelope into an ApiError with code, message and hint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(json({ error: { code: "job_expired", message: "Expired.", hint: "Upload again." } }, 410)),
    );
    const err = await getJob("job1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: "job_expired", status: 410, hint: "Upload again.", message: "Expired." });
  });

  it("maps a dropped connection to a friendly network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")));
    await expect(fetchLimits()).rejects.toMatchObject({ code: "network_error", status: 0 });
  });

  it("uses POST for cancel/retry and DELETE (keepalive on unload) without passwords in the URL", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(makeSnapshot([])))
      .mockResolvedValueOnce(json(makeSnapshot([])))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await cancelJob("job1");
    await retryJob("job1", [{ file_id: "f1", password: "s3cret-value" }]);
    await deleteJob("job1", true);

    const call = (i: number): [string, RequestInit] => {
      const c = (fetchMock.mock.calls as [string, RequestInit][])[i];
      if (!c) throw new Error(`fetch call ${i} missing`);
      return c;
    };
    const [cancel, retry, del] = [call(0), call(1), call(2)];
    expect(cancel[0]).toBe("/api/jobs/job1/cancel");
    expect(cancel[1].method).toBe("POST");
    expect(retry[0]).toBe("/api/jobs/job1/retry");
    expect(retry[0]).not.toContain("s3cret");
    expect(JSON.parse(retry[1].body as string)).toEqual({ files: [{ file_id: "f1", password: "s3cret-value" }] });
    expect(del[1]).toMatchObject({ method: "DELETE", keepalive: true });
  });

  it("builds absolute URLs from server paths", () => {
    expect(apiUrl("/api/jobs/x/download-zip")).toBe("/api/jobs/x/download-zip");
  });

  it("maps encryption options to the wire format", () => {
    expect(
      toEncryptWire({ algorithm: "aes-128", ownerPassword: "", allowPrint: false, allowCopy: true, allowEdit: true }),
    ).toEqual({ algorithm: "aes-128", owner_password: null, allow_print: false, allow_copy: true, allow_edit: true });
  });
});

describe("createJob (multipart upload)", () => {
  class FakeXHR {
    static last: FakeXHR;
    upload: { onprogress?: (e: ProgressEvent) => void } = {};
    status = 202;
    response: unknown = makeSnapshot([{ client_id: "a", status: "queued" }]);
    responseType = "";
    method = "";
    url = "";
    body: FormData | null = null;
    onload?: () => void;
    onerror?: () => void;
    onabort?: () => void;
    ontimeout?: () => void;
    constructor() {
      FakeXHR.last = this;
    }
    open(m: string, u: string) {
      this.method = m;
      this.url = u;
    }
    send(b: FormData) {
      this.body = b;
    }
    abort() {
      this.onabort?.();
    }
  }

  const args = () => ({
    operation: "decrypt" as const,
    nameSuffix: "_decrypted",
    files: [
      { file: new File(["%PDF-1.7 a"], "a.pdf"), wire: { client_id: "c1", password: "pw-one" } },
      { file: new File(["%PDF-1.7 b"], "b.pdf"), wire: { client_id: "c2", password: "pw-two" } },
    ],
  });

  it("sends files and a JSON manifest in the body — passwords never in the URL", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXHR);
    const progress = vi.fn();
    const promise = createJob({ ...args(), onUploadProgress: progress });
    const xhr = FakeXHR.last;
    expect(xhr.method).toBe("POST");
    expect(xhr.url).toBe("/api/jobs");
    expect(xhr.url).not.toMatch(/pw-/);

    const form = xhr.body as FormData;
    expect((form.getAll("files") as File[]).map((f) => f.name)).toEqual(["a.pdf", "b.pdf"]);
    expect(JSON.parse(form.get("manifest") as string)).toEqual({
      operation: "decrypt",
      name_suffix: "_decrypted",
      files: [
        { client_id: "c1", password: "pw-one" },
        { client_id: "c2", password: "pw-two" },
      ],
    });

    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 } as ProgressEvent);
    expect(progress).toHaveBeenCalledWith(0.5);
    xhr.onload?.();
    expect((await promise).id).toBe("job1");
  });

  it("surfaces server validation errors", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXHR);
    const promise = createJob(args());
    Object.assign(FakeXHR.last, { status: 413, response: { error: { code: "too_many_files", message: "Too many.", hint: "Split." } } });
    FakeXHR.last.onload?.();
    await expect(promise).rejects.toMatchObject({ code: "too_many_files", status: 413 });
  });

  it("reports network failures and cancellation distinctly", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXHR);
    const p1 = createJob(args());
    FakeXHR.last.onerror?.();
    await expect(p1).rejects.toMatchObject({ code: "network_error" });

    const controller = new AbortController();
    const p2 = createJob({ ...args(), signal: controller.signal });
    controller.abort();
    await expect(p2).rejects.toMatchObject({ code: "aborted" });
  });
});
