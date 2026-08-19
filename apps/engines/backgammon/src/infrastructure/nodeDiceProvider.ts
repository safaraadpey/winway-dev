import { randomInt } from "node:crypto";
import type { DicePair } from "../domain/types";
import type { DiceProvider } from "../ports/DiceProvider";

export class NodeDiceProvider implements DiceProvider {
  roll(): DicePair {
    return [randomInt(1, 7), randomInt(1, 7)];
  }
}

export const defaultDiceProvider = new NodeDiceProvider();
