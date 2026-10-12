import { ExternalLink } from "lucide-react";
import { LogoMark } from "./LogoMark";

const GITHUB_URL = import.meta.env.VITE_GITHUB_URL;

export function Footer() {
  return (
    <footer className="mt-10 border-t border-line/70">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm">
          <div className="flex items-center gap-2.5">
            <LogoMark className="size-8" />
            <span className="font-semibold tracking-tight">PDFLock</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Encrypt and decrypt PDFs in bulk. Files are processed on the PDFLock server and deleted automatically.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <a className="text-muted hover:text-fg" href="#top">
            Home
          </a>
          <a className="text-muted hover:text-fg" href="#how-it-works">
            How It Works
          </a>
          <a className="text-muted hover:text-fg" href="#privacy">
            Privacy
          </a>
          <a className="text-muted hover:text-fg" href="#faq">
            FAQ
          </a>
          {GITHUB_URL && (
            <a className="inline-flex items-center gap-1 text-muted hover:text-fg" href={GITHUB_URL} target="_blank" rel="noreferrer noopener">
              GitHub <ExternalLink className="size-3.5" aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          )}
        </nav>
      </div>
      <p className="border-t border-line/70 px-4 py-5 text-center text-xs text-muted">
        © {new Date().getFullYear()} PDFLock · PDF permission flags are not a substitute for strong passwords.
      </p>
    </footer>
  );
}
