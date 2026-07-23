"use client";

import { OnboardingProvider } from "@/context/onboarding-context";
import { ToastHost } from "@/components/layout/toast-host";

/** @deprecated Layout wraps OnboardingProvider directly — kept for imports. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <OnboardingProvider>
      {children}
      <ToastHost />
    </OnboardingProvider>
  );
}
