export type CardPoolVersionMeta = {
  poolId: string;
  commitHash: string;
  prngVersion: string;
  cardCount: number;
};

export type CardPoolDefinition = {
  poolCardId: string;
  cardNo: number;
  card: (number | null)[][];
};

export type CardPoolDefinitionsResponse = {
  ok: true;
  version: CardPoolVersionMeta;
  versionKey: string;
  definitions: CardPoolDefinition[];
};

export function buildCardPoolVersionKey(meta: Pick<CardPoolVersionMeta, "commitHash" | "prngVersion">): string {
  return `${meta.commitHash}:${meta.prngVersion}`;
}
