import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../lib/api";
import { makeSnapshot } from "../test/fixtures";
import { useJobStream } from "./useJobStream";

vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), getJob: vi.fn() }));
const mockedGetJob = vi.mocked(api.getJob);

/** Minimal controllable EventSource. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners = new Map<string, ((e: Event) => void)[]>();
  readyState = 0;
  closed = false;
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: (e: Event) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data?: unknown) {
    const ev = Object.assign(new Event(type), data === undefined ? {} : { data: JSON.stringify(data) });
    this.listeners.get(type)?.forEach((fn) => fn(ev));
  }
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});
afterEach(() => vi.unstubAllGlobals());

const running = makeSnapshot([{ client_id: "a", status: "processing" }]);
const done = makeSnapshot([{ client_id: "a", status: "success" }]);

describe("useJobStream", () => {
  it("delivers streamed snapshots and closes the stream when the job finishes", async () => {
    const onSnapshot = vi.fn();
    const { result } = renderHook(() => useJobStream({ jobId: "job1", onSnapshot, onGone: vi.fn() }));
    const es = FakeEventSource.instances[0] as FakeEventSource;
    expect(es.url).toBe("/api/jobs/job1/events"); // the job id is a path segment, never a password

    act(() => es.emit("open"));
    await waitFor(() => expect(result.current).toBe("live"));
    act(() => es.emit("snapshot", running));
    expect(onSnapshot).toHaveBeenLastCalledWith(expect.objectContaining({ status: "processing" }));
    act(() => es.emit("snapshot", done));
    expect(onSnapshot).toHaveBeenLastCalledWith(expect.objectContaining({ status: "completed" }));
    expect(es.closed).toBe(true);
  });

  it("falls back to polling when the stream drops, and recovers", async () => {
    mockedGetJob.mockResolvedValue(running);
    const onSnapshot = vi.fn();
    const { result } = renderHook(() => useJobStream({ jobId: "job1", onSnapshot, onGone: vi.fn() }));
    const es = FakeEventSource.instances[0] as FakeEventSource;
    act(() => es.emit("error"));
    await waitFor(() => expect(mockedGetJob).toHaveBeenCalledWith("job1"));
    await waitFor(() => expect(onSnapshot).toHaveBeenCalled());
    expect(result.current).toBe("reconnecting");

    act(() => es.emit("open")); // browser reconnected
    await waitFor(() => expect(result.current).toBe("live"));
  });

  it("reports offline when both the stream and polling fail", async () => {
    mockedGetJob.mockRejectedValue(api.networkError());
    const { result } = renderHook(() => useJobStream({ jobId: "job1", onSnapshot: vi.fn(), onGone: vi.fn() }));
    act(() => (FakeEventSource.instances[0] as FakeEventSource).emit("error"));
    await waitFor(() => expect(result.current).toBe("offline"));
  });

  it("signals when the job has expired on the server", async () => {
    mockedGetJob.mockRejectedValue(new api.ApiError("job_expired", "expired", 410));
    const onGone = vi.fn();
    renderHook(() => useJobStream({ jobId: "job1", onSnapshot: vi.fn(), onGone }));
    act(() => (FakeEventSource.instances[0] as FakeEventSource).emit("error"));
    await waitFor(() => expect(onGone).toHaveBeenCalledTimes(1));
  });

  it("polls when EventSource isn't available, and stops once the job completes", async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("EventSource", undefined);
    mockedGetJob.mockResolvedValue(done);
    const onSnapshot = vi.fn();
    renderHook(() => useJobStream({ jobId: "job1", onSnapshot, onGone: vi.fn() }));
    await waitFor(() => expect(onSnapshot).toHaveBeenCalledWith(expect.objectContaining({ status: "completed" })));
    const calls = mockedGetJob.mock.calls.length;
    await new Promise((r) => setTimeout(r, 120));
    expect(mockedGetJob.mock.calls.length).toBe(calls); // no more polling after completion
  });

  it("does nothing without a job and cleans up on unmount", () => {
    const { unmount } = renderHook(() => useJobStream({ jobId: null, onSnapshot: vi.fn(), onGone: vi.fn() }));
    expect(FakeEventSource.instances).toHaveLength(0);
    unmount();
    const hook = renderHook(() => useJobStream({ jobId: "job1", onSnapshot: vi.fn(), onGone: vi.fn() }));
    const es = FakeEventSource.instances[0] as FakeEventSource;
    hook.unmount();
    expect(es.closed).toBe(true);
  });
});
