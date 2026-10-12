import { Download, KeyRound, ShieldCheck, Upload } from "lucide-react";
import { Reveal } from "./Reveal";

const STEPS = [
  {
    Icon: Upload,
    title: "1 · Add your PDFs",
    body: "Drag in as many files as you like, or browse. Each one gets its own card, so every file can have its own password and settings.",
  },
  {
    Icon: KeyRound,
    title: "2 · Set the passwords",
    body: "Give each PDF its own password — or switch on “Use the same password for all PDFs”. Decrypting needs the current password; encrypting asks for a new one, with strength feedback and a generator.",
  },
  {
    Icon: ShieldCheck,
    title: "3 · Process the batch",
    body: "Files are processed independently, so one wrong password or damaged file never stops the rest. Watch live progress, cancel any time, and retry only what failed.",
  },
  {
    Icon: Download,
    title: "4 · Download",
    body: "Download each result on its own, or everything that succeeded as a single ZIP. Then clear the batch to delete the files from the server.",
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <Reveal>
        <h2 id="how-title" className="text-3xl font-semibold tracking-tight sm:text-4xl">
          How it works
        </h2>
        <p className="mt-3 max-w-2xl text-muted">Four steps from a stack of PDFs to protected (or unlocked) documents.</p>
      </Reveal>

      <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(({ Icon, title, body }, i) => (
          <li key={title}>
            <Reveal delay={i * 0.08} className="h-full">
              <div className="card glow-hover h-full p-5">
                <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <Icon className="size-5" aria-hidden />
                </div>
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
              </div>
            </Reveal>
          </li>
        ))}
      </ol>

      <Reveal delay={0.1}>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-line bg-surface-2/50 p-5 text-sm leading-relaxed">
            <h3 className="font-semibold">What about permissions?</h3>
            <p className="mt-2 text-muted">
              When encrypting you can restrict printing, copying and editing. Support varies between PDF readers, and
              permission flags are not a substitute for a strong password — anyone who knows the open password can
              read the file.
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-surface-2/50 p-5 text-sm leading-relaxed">
            <h3 className="font-semibold">What about digital signatures?</h3>
            <p className="mt-2 text-muted">
              Encrypting or decrypting rewrites the file, which can invalidate a digital signature. PDFLock warns you
              when it detects one. Keep your original if the signature matters.
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
