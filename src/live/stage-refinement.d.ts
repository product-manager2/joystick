export interface StageDraft {
  name: string;
  goal: string;
  target: number;
  gateTarget?: number;
  unit: string;
}
export function stage(value: Partial<StageDraft> | string): Required<StageDraft>;
export function refinedStages(previous: StageDraft[], proposed: StageDraft[]): Required<StageDraft>[];
