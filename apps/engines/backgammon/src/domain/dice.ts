import type { DicePair, DiceState } from "./types";

export function expandDice(values: DicePair): number[] {
  const [a, b] = values;
  if (a === b) {
    return [a, a, a, a];
  }
  return [a, b];
}

export function createDiceState(): DiceState {
  return {
    values: null,
    remaining: [],
    rolled: false,
  };
}

export function setRolledDice(dice: DiceState, values: DicePair): DiceState {
  return {
    values,
    remaining: expandDice(values),
    rolled: true,
  };
}

export function clearDice(): DiceState {
  return createDiceState();
}

export function consumeDie(dice: DiceState, die: number): DiceState {
  const idx = dice.remaining.indexOf(die);
  if (idx === -1) {
    throw new Error(`die ${die} not available`);
  }
  const remaining = [...dice.remaining];
  remaining.splice(idx, 1);
  return {
    ...dice,
    remaining,
  };
}

export function hasRemainingDice(dice: DiceState): boolean {
  return dice.remaining.length > 0;
}

export function diceFullyConsumed(dice: DiceState): boolean {
  return dice.rolled && dice.remaining.length === 0;
}
