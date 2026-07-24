"use client";

import { TangbuyWaveLoader } from "@/components/brand/tangbuy-wave-loader";

export default function LocaleLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-app-shell">
      <TangbuyWaveLoader />
    </div>
  );
}
