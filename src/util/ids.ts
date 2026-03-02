import { randomUUID } from "node:crypto";

export function orbitId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}
