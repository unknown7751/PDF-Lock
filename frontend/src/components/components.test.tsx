import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import App from "../App";
import { ConfirmDialog } from "./ConfirmDialog";
import { FileStatusBadge } from "./FileStatusBadge";
import { PasswordInput } from "./PasswordInput";
import { PasswordStrengthIndicator } from "./PasswordStrengthIndicator";
import { PDFDropzone } from "./PDFDropzone";
import { ProcessingSummary, summaryText } from "./ProcessingSummary";
import { makeSnapshot, plainPdf } from "../test/fixtures";

vi.mock("../lib/api", async (orig) => ({
  ...(await orig<typeof import("../lib/api")>()),
  fetchLimits: vi.fn().mockRejectedValue(new Error("offline")),
}));

describe("ConfirmDialog", () => {
  function Harness({ onConfirm }: { onConfirm: () => void }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Open</button>
        <ConfirmDialog open={open} title="Sure?" description="Really?" confirmLabel="Do it" onConfirm={() => { onConfirm(); setOpen(false); }} onCancel={() => setOpen(false)} />
      </>
    );
  }

  it("is a labelled modal, focuses its primary action, closes on Escape and restores focus", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    const trigger = screen.getByRole("button", { name: "Open" });
    await user.click(trigger);

    const dialog = await screen.findByRole("alertdialog", { name: "Sure?" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByRole("button", { name: "Do it" })).toHaveFocus();

    await user.tab();
    await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement); // focus stays trapped

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(onConfirm).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  it("confirms via the primary button", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.click(await screen.findByRole("button", { name: "Do it" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe("PasswordInput", () => {
  it("is labelled, toggles visibility independently, and shows errors only after interaction", async () => {
    const user = userEvent.setup();
    function Field() {
      const [v, setV] = useState("");
      return <PasswordInput id="pw" label="Current password" value={v} onChange={setV} error="Enter it." />;
    }
    render(<Field />);
    const input = screen.getByLabelText("Current password");
    expect(input).toHaveAttribute("type", "password");
    expect(screen.queryByText("Enter it.")).not.toBeInTheDocument();

    await user.click(input);
    await user.tab(); // blur -> touched
    expect(await screen.findByText("Enter it.")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");

    await user.click(screen.getByRole("button", { name: /show current password/i }));
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: /hide current password/i })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("PasswordStrengthIndicator", () => {
  it("announces strength as text, not just colour", () => {
    const { rerender } = render(<PasswordStrengthIndicator password="abc" />);
    expect(screen.getByRole("status")).toHaveTextContent(/too short/i);
    rerender(<PasswordStrengthIndicator password="kV9#mQ2$xL7!pR4@wZ8^" />);
    expect(screen.getByRole("status")).toHaveTextContent(/strong/i);
  });
});

describe("FileStatusBadge", () => {
  it.each([
    ["queued", "Queued"],
    ["processing", "Processing"],
    ["success", "Done"],
    ["failed", "Failed"],
    ["skipped", "Not encrypted"],
  ] as const)("shows a text label for %s", (kind, label) => {
    render(<FileStatusBadge kind={kind} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe("PDFDropzone", () => {
  it("opens the picker from the keyboard and accepts dropped files", async () => {
    const user = userEvent.setup();
    const onFiles = vi.fn();
    render(<PDFDropzone onFiles={onFiles} maxFileSize={1024} maxFiles={5} fileCount={0} />);
    const zone = screen.getByRole("button", { name: /choose pdf files or drag/i });
    const input = screen.getByTestId("file-input") as HTMLInputElement;
    const click = vi.spyOn(input, "click");

    zone.focus();
    await user.keyboard("{Enter}");
    expect(click).toHaveBeenCalledTimes(1);

    const file = plainPdf("dropped.pdf");
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(onFiles).toHaveBeenCalledWith([file]);
  });

  it("ignores interaction when disabled", async () => {
    const user = userEvent.setup();
    const onFiles = vi.fn();
    render(<PDFDropzone onFiles={onFiles} maxFileSize={1024} maxFiles={5} fileCount={0} disabled />);
    const zone = screen.getByRole("button", { name: /choose pdf files/i });
    expect(zone).toHaveAttribute("aria-disabled", "true");
    await user.click(zone);
    expect(onFiles).not.toHaveBeenCalled();
  });
});

describe("ProcessingSummary", () => {
  it("states the outcome in the required format", () => {
    const snap = makeSnapshot([
      ...Array.from({ length: 10 }, (_, i) => ({ client_id: `ok${i}`, status: "success" as const })),
      { client_id: "bad1", status: "failed" as const },
      { client_id: "bad2", status: "skipped" as const },
    ]);
    expect(summaryText(snap)).toBe("12 files processed — 10 successful, 2 need attention.");
    render(<ProcessingSummary snapshot={snap} />);
    expect(screen.getByRole("status")).toHaveTextContent("12 files processed — 10 successful, 2 need attention.");
  });

  it("warns about digital signatures when one was detected", () => {
    const snap = makeSnapshot([{ client_id: "a", status: "success", warnings: ["signature"] }]);
    render(<ProcessingSummary snapshot={snap} />);
    expect(screen.getByText(/digital signatures/i)).toBeInTheDocument();
  });
});

describe("App", () => {
  it("renders the hero, navigation and workspace, and toggles the theme", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Your PDFs. Your Passwords. Your Control.");
    expect(screen.getByText(/encrypt, decrypt, and manage multiple pdf files securely/i)).toBeInTheDocument();
    for (const name of ["Home", "How It Works", "Privacy"]) {
      expect(within(screen.getByRole("navigation", { name: "Primary" })).getByRole("link", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: /learn how it works/i })).toHaveAttribute("href", "#how-it-works");
    expect(screen.getByRole("tab", { name: /decrypt pdf/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("link", { name: /github/i })).not.toBeInTheDocument(); // no URL supplied

    expect(document.documentElement).toHaveClass("dark"); // default for first-time visitors
    await user.click(screen.getByRole("button", { name: /switch to light theme/i }));
    expect(document.documentElement).toHaveClass("light");
    expect(document.documentElement).not.toHaveClass("dark");
    expect(localStorage.getItem("pdflock-theme")).toBe("light");
    expect(screen.getByRole("button", { name: /switch to dark theme/i })).toBeInTheDocument();
  });

  it("warns when the backend can't be reached, with a retry action", async () => {
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/can't reach the pdflock server/i);
    expect(screen.getByRole("button", { name: /retry connection/i })).toBeInTheDocument();
  });

  it("discloses that PDFs are processed on the server", () => {
    render(<App />);
    expect(screen.getAllByText(/sent to the pdflock server|processed on our server|uploaded to the pdflock server/i).length).toBeGreaterThan(0);
  });

  it("expands FAQ answers with the keyboard-accessible accordion", async () => {
    const user = userEvent.setup();
    render(<App />);
    const q = screen.getByTestId("faq-1");
    expect(q).toHaveAttribute("aria-expanded", "false");
    await user.click(q);
    expect(q).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText(/does not guess, crack or bypass passwords/i)).toBeInTheDocument();
  });
});
