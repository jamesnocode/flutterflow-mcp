import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PolicyEngine } from "../src/policy/engine.js";
import type { OrbitPolicy } from "../src/types.js";

function basePolicy(overrides: Partial<OrbitPolicy> = {}): OrbitPolicy {
  return {
    allowProjects: ["*"],
    allowFileKeyPrefixes: [],
    denyFileKeyPrefixes: ["lib/custom_code/", "lib/main.dart"],
    maxFilesPerApply: 8,
    maxLinesChanged: 200,
    requireManualApproval: false,
    allowPlatformConfigEdits: false,
    safeMode: "fullWrite",
    ...overrides
  };
}

describe("PolicyEngine", () => {
  let engine: PolicyEngine;
  let policyDir: string;

  beforeEach(() => {
    policyDir = mkdtempSync(path.join(tmpdir(), "orbit-policy-test-"));
    process.env.ORBIT_POLICY_FILE = path.join(policyDir, "orbit.policy.json");
    engine = new PolicyEngine();
  });

  afterEach(() => {
    delete process.env.ORBIT_POLICY_FILE;
    rmSync(policyDir, { recursive: true, force: true });
  });

  it("denies forbidden prefixes", async () => {
    await engine.setPolicy(basePolicy());
    const decision = engine.evaluate({
      projectId: "proj_1",
      changedFiles: [{ fileKey: "lib/custom_code/actions/index.dart", linesChanged: 4 }],
      totalLinesChanged: 4,
      riskScore: 10,
      snapshotFileKeys: ["lib/custom_code/actions/index.dart"]
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasons.join(" ")).toContain("deny prefix");
  });

  it("denies readOnly mode and max line limits", async () => {
    await engine.setPolicy(basePolicy({ safeMode: "readOnly", maxLinesChanged: 20 }));
    const decision = engine.evaluate({
      projectId: "proj_1",
      changedFiles: [{ fileKey: "lib/pages/home.yaml", linesChanged: 40 }],
      totalLinesChanged: 40,
      riskScore: 20,
      snapshotFileKeys: ["lib/pages/home.yaml"]
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasons.join(" ")).toContain("readOnly");
    expect(decision.reasons.join(" ")).toContain("maxLinesChanged");
  });

  it("enforces platform config bundling rule", async () => {
    await engine.setPolicy(basePolicy({ allowPlatformConfigEdits: true }));
    const decision = engine.evaluate({
      projectId: "proj_1",
      changedFiles: [{ fileKey: "android/app/build.gradle", linesChanged: 3 }],
      totalLinesChanged: 3,
      riskScore: 5,
      snapshotFileKeys: ["android/app/build.gradle", "ios/Runner/Info.plist"]
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasons.join(" ")).toContain("bundled");
  });
});
