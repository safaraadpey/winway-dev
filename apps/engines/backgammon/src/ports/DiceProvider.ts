import type { DicePair } from "../domain/types";

export interface DiceProvider {
  roll(): DicePair;
}
