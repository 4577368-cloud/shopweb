"use client";

import { useCallback, useEffect, useState, startTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { localePath } from "@/i18n/LocaleLink";
import type { Locale } from "@/i18n/config";
import {
  isLogisticsWorkflowStep,
  LOGISTICS_DEFAULT_WORKFLOW_STEP,
  type LogisticsWorkflowStep,
} from "@/lib/logistics/page-constants";

/** URL `?step=setup|estimate|confirm` ↔ workflow step state. */
export function useLogisticsWorkflowStep(locale: Locale) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlStep = searchParams.get("step");
  const parsedUrlStep: LogisticsWorkflowStep = isLogisticsWorkflowStep(urlStep)
    ? urlStep
    : LOGISTICS_DEFAULT_WORKFLOW_STEP;

  const [workflowStep, setWorkflowStepLocal] =
    useState<LogisticsWorkflowStep>(parsedUrlStep);

  useEffect(() => {
    setWorkflowStepLocal(parsedUrlStep);
  }, [parsedUrlStep]);

  const setWorkflowStep = useCallback(
    (next: LogisticsWorkflowStep) => {
      setWorkflowStepLocal(next);
      const current = searchParams.get("step");
      if (current === next) return;
      startTransition(() => {
        router.replace(localePath(locale, `/logistics?step=${next}`), {
          scroll: false,
        });
      });
    },
    [router, searchParams, locale]
  );

  return { workflowStep, setWorkflowStep };
}
