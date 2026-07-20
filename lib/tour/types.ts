export type TourStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "skipped";

export type TourPlacement = "auto" | "top" | "right" | "bottom" | "left";

export type ConsumeQueuedTourResult =
  | "started"
  | "cleared_ineligible"
  | "no_queue";

export interface TourActionContext {
  tourId: string;
  stepId: string;
  stepIndex: number;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  close: () => Promise<void>;
  /** Mark the active tour completed and remove overlay. */
  complete: () => Promise<void>;
  /** Chain: start this tour on its route when eligible (`not_started` only). */
  queueTourAfterNavigation: (tourId: string) => void;
}

export interface TourStep {
  id: string;
  /** Value of the target element's data-tour-id attribute. */
  target: string;
  title: string;
  description: string;
  placement?: TourPlacement;
  /** When true, missing targets advance immediately without blocking the tour. */
  optional?: boolean;
  nextAction?: (context: TourActionContext) => void | Promise<void>;
  previousAction?: (context: TourActionContext) => void | Promise<void>;
  customAction?: {
    label: string;
    /** When true, replaces the default Next/Finish primary button. */
    asPrimary?: boolean;
    action: (context: TourActionContext) => void | Promise<void>;
  };
}

export interface TourConfig {
  id: string;
  version: number;
  title: string;
  /** Route containing this tour's targets. */
  route?: string;
  steps: TourStep[];
}

export interface TourProgress {
  tourId: string;
  version: number;
  status: TourStatus;
  currentStep: number;
  updatedAt: string;
}

export interface TourStorage {
  readonly source: string;
  get(userId: string, tour: TourConfig): Promise<TourProgress>;
  set(userId: string, progress: TourProgress): Promise<void>;
  reset(userId: string, tour: TourConfig): Promise<TourProgress>;
}
