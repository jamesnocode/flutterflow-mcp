import { createTwoFilesPatch } from "diff";

export function buildUnifiedDiff(fileKey: string, before: string, after: string): string {
  return createTwoFilesPatch(fileKey, fileKey, before, after, "before", "after", { context: 3 });
}

export function countChangedLines(unifiedDiff: string): number {
  let count = 0;
  const lines = unifiedDiff.split("\n");
  for (const line of lines) {
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")) {
      continue;
    }
    if (line.startsWith("+") || line.startsWith("-")) {
      count += 1;
    }
  }
  return count;
}
