import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/ToastProvider";
import { DEFAULT_LIMITS } from "../../hooks/useServerLimits";
import * as api from "../../lib/api";
import { encryptedPdf, makeSnapshot, plainPdf, TEST_PASSWORD, wrongPasswordError } from "../../test/fixtures";
import { Workspace } from "./Workspace";

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api")>();
  return {
    ...actual,
    createJob: vi.fn(),
    getJob: vi.fn(),
    cancelJob: vi.fn(),
    retryJob: vi.fn(),
    deleteJob: vi.fn(),
  };
});

const mocked = vi.mocked(api);

function renderWorkspace() {
  const user = userEvent.setup({ applyAccept: false });
  render(
    <>
      <Workspace limits={DEFAULT_LIMITS} limitsStatus="ready" onReloadLimits={() => {}} openPickerRef={{ current: null }} />
      <ToastProvider theme="dark" />
    </>,
  );
  return user;
}

const upload = async (user: ReturnType<typeof userEvent.setup>, files: File[]) => {
  await user.upload(screen.getByTestId("file-input"), files);
  await waitFor(() => expect(screen.getAllByTestId("file-card")).toHaveLength(files.length));
  // the advisory pdf-lib inspection finishes shortly afterwards
  await waitFor(() => expect(screen.queryByText("Checking")).not.toBeInTheDocument());
};

const cards = () => screen.getAllByTestId("file-card");
const card = (name: string) => cards().find((c) => within(c).queryByText(name, { selector: "p" })) as HTMLElement;

/** Job ids → client ids come from createJob's args; build a snapshot in the order they were sent. */
function clientIdsOf(call: number): string[] {
  const args = mocked.createJob.mock.calls[call]?.[0] as Parameters<typeof api.createJob>[0];
  return args.files.map((f) => f.wire.client_id);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.deleteJob.mockResolvedValue(undefined);
});

describe("Workspace — files and tabs", () => {
  it("adds several PDFs, removes one, and keeps the rest when switching operation tabs", async () => {
    const user = renderWorkspace();
    await upload(user, [encryptedPdf("a.pdf", 1), encryptedPdf("b.pdf", 2), plainPdf("c.pdf")]);
    expect(screen.getByText(/3 PDFs/)).toBeInTheDocument();

    await user.click(within(card("a.pdf")).getByRole("button", { name: /remove a\.pdf/i }));
    await waitFor(() => expect(cards()).toHaveLength(2));
    expect(screen.queryByText("a.pdf", { selector: "p" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /encrypt pdf/i }));
    expect(cards()).toHaveLength(2); // nothing silently discarded
    // encrypt tab: the encrypted file can't be encrypted again, the plain one can
    expect(within(card("b.pdf")).getByText(/already password-protected/i)).toBeInTheDocument();
    expect(within(card("c.pdf")).getByLabelText(/^new password for c\.pdf$/i)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /decrypt pdf/i }));
    expect(cards()).toHaveLength(2);
    expect(within(card("c.pdf")).getByText(/nothing to decrypt/i)).toBeInTheDocument();
  });

  it("keeps each operation's passwords separate and remembers them across tab switches", async () => {
    const user = renderWorkspace();
    await upload(user, [encryptedPdf("a.pdf", 1), plainPdf("p.pdf")]);
    await user.type(screen.getByLabelText(/^current password for a\.pdf$/i), "decrypt-pw-1");

    await user.click(screen.getByRole("tab", { name: /encrypt pdf/i }));
    await user.type(screen.getByLabelText(/^new password for p\.pdf$/i), "encrypt-pw-12");
    expect(screen.queryByDisplayValue("decrypt-pw-1")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /decrypt pdf/i }));
    expect(screen.getByLabelText(/^current password for a\.pdf$/i)).toHaveValue("decrypt-pw-1");
  });

  it("switching to shared mode hides individual inputs; switching back restores what was typed", async () => {
    const user = renderWorkspace();
    await upload(user, [encryptedPdf("a.pdf", 1), encryptedPdf("b.pdf", 2)]);
    await user.type(screen.getByLabelText(/^current password for a\.pdf$/i), "own-a");

    await user.click(screen.getByRole("switch", { name: /same password for all pdfs/i }));
    await waitFor(() => expect(screen.queryByLabelText(/^current password for a\.pdf$/i)).not.toBeInTheDocument());
    expect(screen.getAllByText(/shared password applies/i)).toHaveLength(2);
    expect(screen.getByTestId("shared-indicator")).toHaveTextContent(/open 2 PDFs/i);

    await user.click(screen.getByRole("switch", { name: /same password for all pdfs/i }));
    expect(await screen.findByLabelText(/^current password for a\.pdf$/i)).toHaveValue("own-a");
  });

  it("blocks starting until every file has a password and explains why", async () => {
    const user = renderWorkspace();
    await upload(user, [encryptedPdf("a.pdf", 1), encryptedPdf("b.pdf", 2)]);
    await user.type(screen.getByLabelText(/^current password for a\.pdf$/i), "pw");
    expect(screen.getByText(/1 file still needs a password/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /decrypt 1 pdf/i }));
    expect(mocked.createJob).not.toHaveBeenCalled();
    expect(await screen.findByText(/enter this file's current password/i)).toBeInTheDocument();
  });
});

describe("Workspace — decrypt batch", () => {
  it("processes a mixed batch independently, then retries the failed file", async () => {
    const user = renderWorkspace();
    await upload(user, [encryptedPdf("good.pdf", 1), encryptedPdf("wrong.pdf", 2), encryptedPdf("other.pdf", 3)]);

    await user.click(screen.getByRole("switch", { name: /same password for all pdfs/i }));
    await user.type(await screen.findByLabelText(/^shared current password$/i), "shared-pw-1");
    // override one file with its own password
    await user.click(within(card("other.pdf")).getByRole("button", { name: /use a different password/i }));
    await user.type(await screen.findByLabelText(/^current password for other\.pdf$/i), TEST_PASSWORD);

    mocked.createJob.mockImplementationOnce(async () =>
      makeSnapshot([
        { client_id: "x", status: "queued" },
      ]),
    );
    mocked.getJob.mockImplementation(async () => {
      const ids = clientIdsOf(0);
      return makeSnapshot([
        { client_id: ids[0] as string, status: "success", output_name: "good_decrypted.pdf", download_url: "/api/jobs/job1/files/fid0/download" },
        { client_id: ids[1] as string, status: "failed", error: wrongPasswordError },
        { client_id: ids[2] as string, status: "success", output_name: "other_decrypted.pdf", download_url: "/api/jobs/job1/files/fid2/download" },
      ]);
    });

    await user.click(screen.getByRole("button", { name: /decrypt 3 pdfs/i }));

    // each file was sent with its own effective password (shared, shared, override)
    await waitFor(() => expect(mocked.createJob).toHaveBeenCalledTimes(1));
    const args = mocked.createJob.mock.calls[0]?.[0] as Parameters<typeof api.createJob>[0];
    expect(args.operation).toBe("decrypt");
    expect(args.nameSuffix).toBe("_decrypted");
    expect(args.files.map((f) => f.wire.password)).toEqual(["shared-pw-1", "shared-pw-1", TEST_PASSWORD]);
    expect(args.files.map((f) => f.file.name)).toEqual(["good.pdf", "wrong.pdf", "other.pdf"]);

    // summary + independent results
    const summary = await screen.findByTestId("processing-summary");
    expect(summary).toHaveTextContent("3 files processed — 2 successful, 1 needs attention.");
    expect(within(card("wrong.pdf")).getByTestId("file-error")).toHaveTextContent(/password is incorrect/i);
    expect(within(card("good.pdf")).getByTestId("file-success")).toHaveTextContent("good_decrypted.pdf");
    expect(screen.getByRole("link", { name: /download all as zip/i })).toHaveAttribute("href", "/api/jobs/job1/download-zip");
    expect(within(card("good.pdf")).getByRole("link", { name: /download good_decrypted\.pdf/i })).toHaveAttribute(
      "href",
      "/api/jobs/job1/files/fid0/download",
    );
    expect(screen.getByRole("tab", { name: /encrypt pdf/i })).toHaveAttribute("aria-disabled", "true"); // locked

    // retry the wrong one with the right password
    mocked.retryJob.mockResolvedValueOnce(makeSnapshot([{ client_id: "x", status: "queued" }]));
    mocked.getJob.mockImplementation(async () => {
      const ids = clientIdsOf(0);
      return makeSnapshot(ids.map((id, i) => ({ client_id: id, status: "success" as const, output_name: `f${i}.pdf` })));
    });
    await user.type(within(card("wrong.pdf")).getByLabelText(/^try another password for wrong\.pdf$/i), TEST_PASSWORD);
    await user.click(screen.getByRole("button", { name: /retry 1 failed file/i }));

    await waitFor(() => expect(mocked.retryJob).toHaveBeenCalledTimes(1));
    expect(mocked.retryJob).toHaveBeenCalledWith("job1", [{ file_id: "fid1", password: TEST_PASSWORD }]);
    await waitFor(() => expect(screen.getByTestId("processing-summary")).toHaveTextContent("3 files processed — 3 successful."));
  });

  it("does not put passwords in storage, URLs or the DOM text", async () => {
    const user = renderWorkspace();
    await upload(user, [encryptedPdf("a.pdf", 1)]);
    await user.type(screen.getByLabelText(/^current password for a\.pdf$/i), "Plain-Text-Secret-9");
    const input = screen.getByLabelText(/^current password for a\.pdf$/i);
    expect(input).toHaveAttribute("type", "password");
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain("Plain-Text-Secret-9");
    expect(window.location.href).not.toContain("Plain-Text-Secret-9");
    expect(document.body.textContent).not.toContain("Plain-Text-Secret-9");
  });

  it("offers an independent show/hide toggle per file", async () => {
    const user = renderWorkspace();
    await upload(user, [encryptedPdf("a.pdf", 1), encryptedPdf("b.pdf", 2)]);
    const a = screen.getByLabelText(/^current password for a\.pdf$/i);
    const b = screen.getByLabelText(/^current password for b\.pdf$/i);
    await user.click(screen.getByRole("button", { name: /show current password for a\.pdf/i }));
    expect(a).toHaveAttribute("type", "text");
    expect(b).toHaveAttribute("type", "password");
  });

  it("cancels a running batch and shows what was stopped", async () => {
    const user = renderWorkspace();
    await upload(user, [encryptedPdf("a.pdf", 1), encryptedPdf("b.pdf", 2)]);
    await user.type(screen.getByLabelText(/^current password for a\.pdf$/i), "pw-a");
    await user.type(screen.getByLabelText(/^current password for b\.pdf$/i), "pw-b");

    const running = (ids: string[]) =>
      makeSnapshot(ids.map((id) => ({ client_id: id, status: "processing" as const })));
    mocked.createJob.mockImplementationOnce(async (a) => running(a.files.map((f) => f.wire.client_id)));
    mocked.getJob.mockImplementation(async () => running(clientIdsOf(0))); // never finishes on its own
    mocked.cancelJob.mockImplementation(async () =>
      makeSnapshot(
        clientIdsOf(0).map((id) => ({ client_id: id, status: "cancelled" as const, error: { code: "cancelled", message: "Processing was cancelled." } })),
      ),
    );

    await user.click(screen.getByRole("button", { name: /decrypt 2 pdfs/i }));
    const cancel = await screen.findByRole("button", { name: /cancel operation/i });
    expect(screen.getByRole("progressbar", { name: /overall progress/i })).toBeInTheDocument();
    await user.click(cancel);

    await waitFor(() => expect(mocked.cancelJob).toHaveBeenCalledWith("job1"));
    expect(await screen.findByTestId("processing-summary")).toHaveTextContent("2 files processed — 0 successful, 2 cancelled.");
    // cancelled files stay retryable
    expect(screen.getByRole("button", { name: /retry 2 failed files/i })).toBeInTheDocument();
  });

  it("clears results after confirmation: server job deleted, queue emptied, passwords forgotten", async () => {
    const user = renderWorkspace();
    await upload(user, [encryptedPdf("a.pdf", 1)]);
    await user.type(screen.getByLabelText(/^current password for a\.pdf$/i), "pw-a");
    mocked.createJob.mockImplementationOnce(async (a) => makeSnapshot(a.files.map((f) => ({ client_id: f.wire.client_id, status: "queued" as const }))));
    mocked.getJob.mockImplementation(async () =>
      makeSnapshot(clientIdsOf(0).map((id) => ({ client_id: id, status: "success" as const }))),
    );
    await user.click(screen.getByRole("button", { name: /decrypt 1 pdf/i }));
    await screen.findByTestId("processing-summary");

    await user.click(screen.getByRole("button", { name: /clear results/i }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/deleted from the server/i);
    await user.click(within(dialog).getByRole("button", { name: /clear everything/i }));

    await waitFor(() => expect(mocked.deleteJob).toHaveBeenCalledWith("job1"));
    await waitFor(() => expect(screen.queryAllByTestId("file-card")).toHaveLength(0));
    await waitFor(() => expect(screen.queryByTestId("processing-summary")).not.toBeInTheDocument()); // exit animation
    expect(screen.getByRole("tab", { name: /encrypt pdf/i })).not.toHaveAttribute("aria-disabled");
    expect(screen.getByTestId("file-input")).toBeInTheDocument(); // dropzone is back for a new batch
  });

  it("shows a helpful error and keeps the files when the upload fails (network down)", async () => {
    const user = renderWorkspace();
    await upload(user, [encryptedPdf("a.pdf", 1)]);
    await user.type(screen.getByLabelText(/^current password for a\.pdf$/i), "pw-a");
    mocked.createJob.mockRejectedValueOnce(api.networkError());

    await user.click(screen.getByRole("button", { name: /decrypt 1 pdf/i }));
    expect(await screen.findByText(/can't reach the pdflock server/i)).toBeInTheDocument();
    expect(cards()).toHaveLength(1); // nothing lost
    expect(screen.getByRole("button", { name: /decrypt 1 pdf/i })).toBeEnabled(); // can try again
  });

  it("prevents duplicate submissions while the upload is in flight", async () => {
    const user = renderWorkspace();
    await upload(user, [encryptedPdf("a.pdf", 1)]);
    await user.type(screen.getByLabelText(/^current password for a\.pdf$/i), "pw-a");
    let resolve!: (v: ReturnType<typeof makeSnapshot>) => void;
    mocked.createJob.mockImplementation(() => new Promise((r) => (resolve = r)));

    const start = screen.getByRole("button", { name: /decrypt 1 pdf/i });
    await user.click(start);
    await user.click(start).catch(() => undefined);
    expect(mocked.createJob).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("progressbar", { name: /upload progress/i })).toBeInTheDocument();
    resolve(makeSnapshot([{ client_id: "x", status: "processing" }]));
  });
});

describe("Workspace — encrypt", () => {
  it("requires matching confirmation, asks for confirmation, then sends the new password and options", async () => {
    const user = renderWorkspace();
    await user.click(screen.getByRole("tab", { name: /encrypt pdf/i }));
    await upload(user, [plainPdf("a.pdf", 1), plainPdf("b.pdf", 2)]);

    await user.click(screen.getByRole("switch", { name: /same password for all pdfs/i }));
    await user.type(await screen.findByLabelText(/^new password for all pdfs$/i), "Sup3r-secret-pw");
    await user.type(screen.getByLabelText(/^confirm new password for all pdfs$/i), "mismatching-pw");

    await user.click(screen.getByRole("button", { name: /encrypt 0 pdfs|encrypt pdfs/i }));
    expect(mocked.createJob).not.toHaveBeenCalled();
    expect((await screen.findAllByText(/passwords don't match/i)).length).toBeGreaterThan(0);

    const confirm = screen.getByLabelText(/^confirm new password for all pdfs$/i);
    await user.clear(confirm);
    await user.type(confirm, "Sup3r-secret-pw");

    mocked.createJob.mockImplementationOnce(async (a) =>
      makeSnapshot(a.files.map((f) => ({ client_id: f.wire.client_id, status: "queued" as const })), { operation: "encrypt" }),
    );
    mocked.getJob.mockImplementation(async () =>
      makeSnapshot(clientIdsOf(0).map((id) => ({ client_id: id, status: "success" as const })), { operation: "encrypt" }),
    );

    await user.click(screen.getByRole("button", { name: /encrypt 2 pdfs/i }));
    const dialog = await screen.findByRole("alertdialog");
    expect(mocked.createJob).not.toHaveBeenCalled(); // waits for confirmation
    await user.click(within(dialog).getByRole("button", { name: /encrypt now/i }));

    await waitFor(() => expect(mocked.createJob).toHaveBeenCalledTimes(1));
    const args = mocked.createJob.mock.calls[0]?.[0] as Parameters<typeof api.createJob>[0];
    expect(args.operation).toBe("encrypt");
    expect(args.nameSuffix).toBe("_protected");
    expect(args.files.map((f) => f.wire.password)).toEqual(["Sup3r-secret-pw", "Sup3r-secret-pw"]);
    expect(args.files[0]?.wire.encrypt).toMatchObject({ algorithm: "aes-256", allow_print: true, owner_password: null });
    expect(await screen.findByTestId("processing-summary")).toHaveTextContent("2 files processed — 2 successful.");
  });

  it("can skip the confirmation dialog when the user opts out", async () => {
    const user = renderWorkspace();
    await user.click(screen.getByRole("tab", { name: /encrypt pdf/i }));
    await upload(user, [plainPdf("a.pdf", 1)]);
    await user.click(screen.getByRole("checkbox", { name: /ask me to confirm before encrypting/i }));
    await user.type(screen.getByLabelText(/^new password for a\.pdf$/i), "Another-pw-123");
    await user.type(screen.getByLabelText(/^confirm new password for a\.pdf$/i), "Another-pw-123");
    mocked.createJob.mockResolvedValueOnce(makeSnapshot([{ client_id: "x", status: "processing" }], { operation: "encrypt" }));
    mocked.getJob.mockResolvedValue(makeSnapshot([{ client_id: "x", status: "processing" }], { operation: "encrypt" }));

    await user.click(screen.getByRole("button", { name: /encrypt 1 pdf/i }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await waitFor(() => expect(mocked.createJob).toHaveBeenCalledTimes(1));
  });

  it("requires an owner password when permissions are restricted", async () => {
    const user = renderWorkspace();
    await user.click(screen.getByRole("tab", { name: /encrypt pdf/i }));
    await upload(user, [plainPdf("a.pdf", 1)]);
    await user.type(screen.getByLabelText(/^new password for a\.pdf$/i), "Another-pw-123");
    await user.type(screen.getByLabelText(/^confirm new password for a\.pdf$/i), "Another-pw-123");

    await user.click(screen.getByRole("button", { name: /advanced options \(all files\)/i }));
    await user.click(screen.getByRole("checkbox", { name: /allow printing/i }));
    await user.click(screen.getByRole("button", { name: /^encrypt (1 pdf|pdfs)$/i }));
    expect(mocked.createJob).not.toHaveBeenCalled();
    expect((await screen.findAllByText(/need an owner password/i)).length).toBeGreaterThan(0);
  });
});
