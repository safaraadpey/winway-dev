/** Pick timing passed from pick coordinator into per-room job processing. */
export interface DrawJobPickContext {
  firstPickedAt: string;
  pickStartTime: string;
  pickEndTime: string;
  pickMsPerJob: number;
  drainStartedAt: string | null;
}
