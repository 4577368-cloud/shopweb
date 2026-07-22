"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Primary CTA — always navigates to logistics (no blocking modal). */
export function SkuLogisticsEntryGate() {
  return (
    <Link href="/logistics">
      <Button size="sm">
        进入物流确认
        <ArrowRight className="h-3.5 w-3.5" />
      </Button>
    </Link>
  );
}
