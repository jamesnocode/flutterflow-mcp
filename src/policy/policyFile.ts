import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { OrbitPolicy } from "../types.js";
import { DEFAULT_POLICY } from "./defaults.js";

function policyPath(): string {
  return process.env.ORBIT_POLICY_FILE?.trim() || path.resolve(process.cwd(), "orbit.policy.json");
}

export async function readPolicyFile(): Promise<Partial<OrbitPolicy>> {
  const file = policyPath();
  try {
    const body = await readFile(file, "utf8");
    const parsed = JSON.parse(body) as Partial<OrbitPolicy>;
    return parsed;
  } catch {
    return {};
  }
}

export async function writePolicyFile(partial: OrbitPolicy): Promise<void> {
  const file = policyPath();
  const body = `${JSON.stringify(partial, null, 2)}\n`;
  await writeFile(file, body, "utf8");
}

export function defaultPolicyPath(): string {
  return policyPath();
}

export function mergePolicy(filePolicy: Partial<OrbitPolicy>, envPolicy: Partial<OrbitPolicy>): OrbitPolicy {
  return {
    ...DEFAULT_POLICY,
    ...filePolicy,
    ...envPolicy,
    allowProjects: envPolicy.allowProjects ?? filePolicy.allowProjects ?? DEFAULT_POLICY.allowProjects,
    allowFileKeyPrefixes:
      envPolicy.allowFileKeyPrefixes ?? filePolicy.allowFileKeyPrefixes ?? DEFAULT_POLICY.allowFileKeyPrefixes,
    denyFileKeyPrefixes:
      envPolicy.denyFileKeyPrefixes ?? filePolicy.denyFileKeyPrefixes ?? DEFAULT_POLICY.denyFileKeyPrefixes
  };
}
