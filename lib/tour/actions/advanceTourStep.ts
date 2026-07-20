import type { TourActionContext } from "@/lib/tour/types";

export async function advanceTourStep(
  context: TourActionContext
): Promise<void> {
  await context.next();
}
