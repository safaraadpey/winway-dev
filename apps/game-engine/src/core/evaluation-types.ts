/** Shared win-evaluation result types (bitmask engine). */

export type WinType = "line" | "full";

export interface WinResult {
  ticketId: string;
  userId: string;
  winType: WinType;
}

export interface EvaluateOutput {
  /** New winner rows to insert into `results` for this draw. */
  newResults: WinResult[];
  /** True when a line was recorded this draw and the room had none before. */
  setFirstLineDrawNumber: boolean;
  /** True when at least one FULL winner exists for this draw → room settles. */
  fullWinnerThisDraw: boolean;
}
