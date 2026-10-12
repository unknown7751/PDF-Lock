import { Clock, EyeOff, Server, ShieldOff, TriangleAlert } from "lucide-react";
import { formatBytes, formatMinutes } from "../lib/format";
import type { Limits } from "../lib/schemas";
import { Reveal } from "./Reveal";

export function PrivacySection({ limits }: { limits: Limits }) {
  const cards = [
    {
      Icon: Server,
      title: "Processed on our server",
      body: "Your PDFs are uploaded to the PDFLock server, processed with the open-source qpdf engine, and sent back to you. They are not processed locally in your browser.",
    },
    {
      Icon: Clock,
      title: `Deleted after ${formatMinutes(limits.job_ttl_seconds)}`,
      body: "Every batch lives in an isolated temporary folder that is wiped automatically when it expires, when you clear it, or when you cancel. Closing the tab also requests deletion.",
    },
    {
      Icon: EyeOff,
      title: "Passwords stay in memory",
      body: "Passwords are sent in the request body only for the operation. They are never put in URLs, saved in browser storage, written to logs, or stored in a database.",
    },
    {
      Icon: ShieldOff,
      title: "No third parties",
      body: "Files are never sent to external conversion services, analytics or ad networks. Fonts and scripts are served by PDFLock itself.",
    },
  ];

  return (
    <section id="privacy" aria-labelledby="privacy-title" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <Reveal>
        <h2 id="privacy-title" className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Privacy, plainly
        </h2>
        <p className="mt-3 max-w-2xl text-muted">
          Here is exactly what happens to your documents and passwords — no vague promises.
        </p>
      </Reveal>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {cards.map(({ Icon, title, body }, i) => (
          <Reveal key={title} delay={i * 0.07}>
            <div className="card glow-hover h-full p-5">
              <div className="mb-3 flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <Icon className="size-5" aria-hidden />
                </div>
                <h3 className="font-semibold">{title}</h3>
              </div>
              <p className="text-sm leading-relaxed text-muted">{body}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal delay={0.1}>
        <div className="mt-4 flex gap-3 rounded-2xl border border-warn/40 bg-warn-soft p-5 text-sm leading-relaxed">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden />
          <div>
            <p className="font-semibold text-warn">Use HTTPS in production</p>
            <p className="mt-1 text-muted">
              The privacy guarantees above assume you reach PDFLock over HTTPS, which protects files and passwords in
              transit. Current limits: up to {limits.max_files} files per batch, {formatBytes(limits.max_file_size_bytes)} per file,{" "}
              {limits.max_pages.toLocaleString()} pages per document.
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
