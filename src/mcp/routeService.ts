import { keyFromNodeId } from "./bindingService.js";
import type { RouteValidationIssueCode } from "../types.js";

export function buildNavigateAction(args: {
  toPageId: string;
  allowBack?: boolean;
  navigateBack?: boolean;
  passedParameters?: Record<string, unknown>;
}): Record<string, unknown> {
  const navigate: Record<string, unknown> = {
    allowBack: args.allowBack ?? true,
    isNavigateBack: args.navigateBack ?? false,
    pageNodeKeyRef: {
      key: keyFromNodeId(args.toPageId)
    }
  };
  if (args.passedParameters && Object.keys(args.passedParameters).length > 0) {
    navigate.passedParameters = args.passedParameters;
  }
  return { navigate };
}

export interface RouteValidationIssue {
  code: RouteValidationIssueCode;
  severity: "error" | "warning";
  message: string;
  fileKey?: string;
}

export function makeRouteIssue(
  code: RouteValidationIssueCode,
  message: string,
  fileKey?: string,
  severity: "error" | "warning" = "error"
): RouteValidationIssue {
  return { code, severity, message, fileKey };
}

