import { themeAssetPath } from "@/lib/theme/assetPaths";
import type { ThemeId } from "@/lib/theme/types";

export type ResultsDialogAssetKey =
  | "dialogBg"
  | "winnersSectionBg"
  | "primaryButtonBg";

export const RESULTS_DIALOG_ASSET_FILES: Record<ResultsDialogAssetKey, string> = {
  dialogBg: "login_BG.png",
  winnersSectionBg: "BG002.png",
  primaryButtonBg: "BuyCardBotton.png",
};

export function getResultsDialogAssetPath(
  themeId: ThemeId,
  key: ResultsDialogAssetKey
): string {
  return themeAssetPath(themeId, "assets", RESULTS_DIALOG_ASSET_FILES[key]);
}
