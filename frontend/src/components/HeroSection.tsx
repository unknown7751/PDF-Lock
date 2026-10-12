import { motion, type Variants } from "motion/react";
import { ArrowRight, Info, Upload } from "lucide-react";
import { formatMinutes } from "../lib/format";
import { LockVisual } from "./LockVisual";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};

interface HeroSectionProps {
  onUpload: () => void;
  ttlSeconds: number;
}

export function HeroSection({ onUpload, ttlSeconds }: HeroSectionProps) {
  return (
    <section aria-labelledby="hero-title" className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-12 sm:px-6 sm:pt-20 lg:grid-cols-[1.15fr_0.85fr] lg:gap-8 lg:pb-20">
      <motion.div variants={container} initial="hidden" animate="show">
        <motion.p variants={item} className="chip mb-5 border-accent/30 bg-accent-soft text-accent">
          <span className="size-1.5 rounded-full bg-accent" aria-hidden />
          AES-256 encryption · Batch processing
        </motion.p>
        <motion.h1 id="hero-title" variants={item} className="text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
          Your PDFs. Your Passwords.{" "}
          <span className="bg-gradient-to-r from-accent to-teal-400 bg-clip-text text-transparent dark:to-teal-300">Your Control.</span>
        </motion.h1>
        <motion.p variants={item} className="mt-5 max-w-xl text-lg leading-relaxed text-muted text-pretty">
          Encrypt, decrypt, and manage multiple PDF files securely — all in one place.
        </motion.p>
        <motion.div variants={item} className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button type="button" className="btn btn-primary min-h-12 px-6 text-base" onClick={onUpload}>
            <Upload className="size-4.5" aria-hidden />
            Upload PDFs
          </button>
          <a href="#how-it-works" className="btn btn-secondary min-h-12 px-6 text-base">
            Learn How It Works
            <ArrowRight className="size-4.5" aria-hidden />
          </a>
        </motion.div>
        <motion.p variants={item} className="mt-6 flex max-w-xl items-start gap-2 text-sm leading-relaxed text-muted">
          <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          <span>
            PDFs are sent to the PDFLock server for processing, never to third parties, and deleted automatically
            after {formatMinutes(ttlSeconds)} or as soon as you clear them.
          </span>
        </motion.p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.25, ease: "easeOut" }}
        className="px-4 pb-6"
      >
        <LockVisual />
      </motion.div>
    </section>
  );
}
