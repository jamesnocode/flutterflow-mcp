const NESTED_QUANTIFIER = /(\([^)]*[+*][^)]*\)[+*])|(\.\*\.\*)|(\+\+)|(\*\*)/;

export function isUnsafeRegex(pattern: string): { unsafe: boolean; reason?: string } {
  if (pattern.length > 240) {
    return { unsafe: true, reason: "Pattern too long (>240 chars)" };
  }

  if (NESTED_QUANTIFIER.test(pattern)) {
    return { unsafe: true, reason: "Pattern may cause catastrophic backtracking" };
  }

  return { unsafe: false };
}

export function compileSafeRegex(pattern: string): RegExp {
  const safety = isUnsafeRegex(pattern);
  if (safety.unsafe) {
    throw new Error(`Unsafe regex: ${safety.reason}`);
  }

  try {
    return new RegExp(pattern, "i");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid regex";
    throw new Error(`Invalid regex: ${message}`);
  }
}
