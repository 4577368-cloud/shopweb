"use client";

import { useEffect } from "react";
import { useOnboarding } from "@/context/onboarding-context";

/** 轻量提示条，用于演示动作反馈 */
export function ToastHost() {
  const { toastMessage, clearToast } = useOnboarding();

  useEffect(() => {
    if (!toastMessage) return;
  }, [toastMessage]);

  if (!toastMessage) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
      <div className="pointer-events-auto rounded-md border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-800 shadow-md">
        <button type="button" onClick={clearToast} className="text-left">
          {toastMessage}
        </button>
      </div>
    </div>
  );
}
