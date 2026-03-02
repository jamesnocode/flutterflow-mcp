import type { OrbitPolicy } from "../types.js";

export const DEFAULT_POLICY: OrbitPolicy = {
  allowProjects: ["*"],
  allowFileKeyPrefixes: [],
  denyFileKeyPrefixes: ["lib/custom_code/", "lib/custom_functions/", "lib/main.dart"],
  maxFilesPerApply: 8,
  maxLinesChanged: 350,
  requireManualApproval: false,
  allowPlatformConfigEdits: false,
  safeMode: "guidedWrite"
};

export const PLATFORM_PREFIXES = ["android/", "ios/", "web/", "macos/", "linux/", "windows/"];

export function isPlatformFile(fileKey: string): boolean {
  return PLATFORM_PREFIXES.some((prefix) => fileKey.startsWith(prefix));
}
