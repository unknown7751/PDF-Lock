import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { Reveal } from "./Reveal";

const FAQS = [
  {
    q: "Are my PDFs uploaded?",
    a: "Yes. PDFLock processes files on its server — they are not handled locally in your browser. They are never shared with third parties and are deleted automatically a short time after processing, or immediately when you clear the batch.",
  },
  {
    q: "I forgot a PDF's password. Can you recover it?",
    a: "No. PDFLock only removes protection when you supply the correct password. It does not guess, crack or bypass passwords, and a lost password on a strongly encrypted PDF generally cannot be recovered.",
  },
  {
    q: "What's the difference between the open password and the owner password?",
    a: "The open (user) password is needed to open the document. The owner password controls permissions such as printing, copying and editing. Restrictions require a separate owner password; readers vary in how strictly they honour them.",
  },
  {
    q: "AES-256 or AES-128?",
    a: "AES-256 is the default and the strongest option. Choose AES-128 only if the recipient uses an older PDF reader that can't open AES-256 files. AES-128 passwords are limited to 32 plain-ASCII characters by the PDF standard.",
  },
  {
    q: "Why was my file rejected or marked as failed?",
    a: "Common reasons: the password was wrong, the file isn't a valid PDF, it's already unencrypted (when decrypting) or already encrypted (when encrypting), or it exceeds the size/page limits. Each file explains what happened and how to fix it, and one failure never stops the others.",
  },
  {
    q: "Will decrypting change my document?",
    a: "Pages, text, images, annotations and metadata are preserved. The file is re-saved without encryption. Digital signatures may stop validating because the file bytes change, so keep your original if you need the signature.",
  },
  {
    q: "Can I use one password for many files?",
    a: "Yes — switch on “Use the same password for all PDFs”. You can still override it for any individual file. Decrypt and Encrypt keep separate password settings, so a shared password never carries over to the other operation.",
  },
];

function Item({ q, a, index }: { q: string; a: string; index: number }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="card overflow-hidden">
      <h3>
        <button
          type="button"
          id={`${id}-btn`}
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-14 w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold sm:text-base"
          data-testid={`faq-${index}`}
        >
          {q}
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} className="shrink-0 text-muted">
            <ChevronDown className="size-4" aria-hidden />
          </motion.span>
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={`${id}-panel`}
            role="region"
            aria-labelledby={`${id}-btn`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <p className="px-5 pb-5 text-sm leading-relaxed text-muted">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FAQSection() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <Reveal>
        <h2 id="faq-title" className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Frequently asked questions
        </h2>
      </Reveal>
      <div className="mt-8 space-y-3">
        {FAQS.map((f, i) => (
          <Reveal key={f.q} delay={i * 0.04}>
            <Item {...f} index={i} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}
