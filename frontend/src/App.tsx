import { MotionConfig } from "motion/react";
import { useRef } from "react";
import { AmbientBackground } from "./components/AmbientBackground";
import { FAQSection } from "./components/FAQSection";
import { Footer } from "./components/Footer";
import { HeroSection } from "./components/HeroSection";
import { HowItWorksSection } from "./components/HowItWorksSection";
import { Navbar } from "./components/Navbar";
import { PrivacySection } from "./components/PrivacySection";
import { ToastProvider } from "./components/ToastProvider";
import { Workspace } from "./features/batch-processing/Workspace";
import { useServerLimits } from "./hooks/useServerLimits";
import { useTheme } from "./hooks/useTheme";

export default function App() {
  const { theme, toggle } = useTheme();
  const { limits, status, reload } = useServerLimits();
  const openPicker = useRef<(() => void) | null>(null);

  const handleUpload = () => {
    document.getElementById("workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
    // Opening the picker directly from the click keeps the browser's user-gesture requirement satisfied.
    openPicker.current?.();
  };

  return (
    <MotionConfig reducedMotion="user">
      <a
        href="#workspace"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-fg"
      >
        Skip to workspace
      </a>
      <AmbientBackground />
      <div id="top" />
      <Navbar theme={theme} onToggleTheme={toggle} />
      <main>
        <HeroSection onUpload={handleUpload} ttlSeconds={limits.job_ttl_seconds} />
        <Workspace limits={limits} limitsStatus={status} onReloadLimits={() => void reload()} openPickerRef={openPicker} />
        <HowItWorksSection />
        <PrivacySection limits={limits} />
        <FAQSection />
      </main>
      <Footer />
      <ToastProvider theme={theme} />
    </MotionConfig>
  );
}
