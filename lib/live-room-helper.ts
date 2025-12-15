import {
  checkFullCardBingo,
  getAlmostCompleteCardNumber,
  getAlmostCompleteRowNumber,
  getCompleteRows,
} from "@/lib/bingo-logic";

export type BingoCardMatrix = (number | null)[][];

export type LatestHit =
  | {
      row: number;
      col: number;
      number: number;
    }
  | null;

export interface LiveCardAnalysis {
  markedNumbers: Set<number>;
  latestHit: LatestHit;
  isFullCard: boolean;
  almostCompleteCardNumber: number | null;
  almostCompleteRowNumbers: number[];
  completeRows: number[];
}

export function analyzeCardState(params: {
  card: BingoCardMatrix;
  calledNumbers: number[];
  previousCalledNumbers: number[];
}): LiveCardAnalysis {
  const { card, calledNumbers, previousCalledNumbers } = params;

  const markedNumbers = new Set<number>();
  card.forEach((row) => {
    row.forEach((value) => {
      if (value !== null && calledNumbers.includes(value)) {
        markedNumbers.add(value);
      }
    });
  });

  let latestHit: LatestHit = null;
  if (calledNumbers.length > 0) {
    const newNumbers = calledNumbers.filter(
      (num) => !previousCalledNumbers.includes(num)
    );
    if (newNumbers.length > 0) {
      const latestNumber = newNumbers[newNumbers.length - 1];
      outer: for (let row = 0; row < card.length; row++) {
        for (let col = 0; col < card[row].length; col++) {
          if (card[row][col] === latestNumber) {
            latestHit = { row, col, number: latestNumber };
            break outer;
          }
        }
      }
    }
  }

  const isFullCard = checkFullCardBingo(card, calledNumbers);
  const almostCompleteCardNumber = getAlmostCompleteCardNumber(
    card,
    calledNumbers
  );
  const almostCompleteRowNumbers = getAlmostCompleteRowNumber(
    card,
    calledNumbers
  );
  const completeRows = getCompleteRows(card, calledNumbers);

  return {
    markedNumbers,
    latestHit,
    isFullCard,
    almostCompleteCardNumber,
    almostCompleteRowNumbers,
    completeRows,
  };
}

export function flattenCardNumbers(card: BingoCardMatrix): number[] {
  const result: number[] = [];
  for (const row of card) {
    for (const value of row) {
      if (value !== null) {
        result.push(value);
      }
    }
  }
  return result;
}

