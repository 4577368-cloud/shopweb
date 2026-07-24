export type LogisticsWorkflowStep = "setup" | "estimate" | "confirm";

export const LOGISTICS_DEFAULT_WORKFLOW_STEP: LogisticsWorkflowStep = "setup";

export function isLogisticsWorkflowStep(
  value: string | null
): value is LogisticsWorkflowStep {
  return value === "setup" || value === "estimate" || value === "confirm";
}
