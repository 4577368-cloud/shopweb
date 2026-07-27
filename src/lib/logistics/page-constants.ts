export type LogisticsWorkflowStep = "setup" | "estimate" | "confirm";

/** Default landing step — template config lives on the rail/card, not as step 1. */
export const LOGISTICS_DEFAULT_WORKFLOW_STEP: LogisticsWorkflowStep = "estimate";

export function isLogisticsWorkflowStep(
  value: string | null
): value is LogisticsWorkflowStep {
  return value === "setup" || value === "estimate" || value === "confirm";
}

/** Map legacy `?step=setup` bookmarks onto estimate. */
export function normalizeLogisticsWorkflowStep(
  step: LogisticsWorkflowStep
): Exclude<LogisticsWorkflowStep, "setup"> {
  return step === "setup" ? "estimate" : step;
}
