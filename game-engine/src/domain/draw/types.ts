/** Row shape returned by rpc_pick_draw_jobs (public.draw_jobs). */
export interface DrawJob {
  id: number;
  room_id: string;
  draw_number: number;
  status: string;
  attempts: number;
  created_at: string;
  updated_at: string;
}

export interface DrawBatchResult {
  /** Jobs picked from the queue in this batch. */
  picked: number;
  /** Jobs fully processed (marks + evaluate) and marked done. */
  done: number;
  /** Jobs that failed and were returned to the queue for retry. */
  requeued: number;
  /** Jobs that exceeded maxAttempts and were parked as 'failed'. */
  deadLettered: number;
}

export const EMPTY_BATCH: DrawBatchResult = {
  picked: 0,
  done: 0,
  requeued: 0,
  deadLettered: 0,
};
