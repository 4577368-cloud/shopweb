export interface SkillNextStep {
  label: string;
  kind?: string;
  filterMode?: string;
  productId?: string;
  status?: string;
  shopFilter?: string;
  tab?: string;
  intent?: string;
}

export interface SkillExecutionFeedback {
  summary: string;
  detailLines: string[];
  progress?: number | null;
  nextSteps: SkillNextStep[];
}
