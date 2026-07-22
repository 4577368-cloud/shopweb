"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Primary CTA — always navigates to logistics (no blocking modal). */
export function SkuLogisticsEntryGate() {
  return (
    <Link href="/logistics">
      <Button>
        进入物流确认
        <ArrowRight className="h-4 w-4" />
      </Button>
    </Link>
  );
}
