// Overriding BigInt serialization to string
// This is needed because `JSON.stringify` throws a TypeError for BigInts,
// and Prisma returns BigInts for monetary fields.

declare global {
  interface BigInt {
    toJSON(): string;
  }
}

BigInt.prototype.toJSON = function (): string {
  return this.toString();
};

export const safeJsonStringify = (data: unknown): string => {
  return JSON.stringify(data, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  );
};
