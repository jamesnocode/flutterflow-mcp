export interface FlutterFlowApiConfig {
  token: string;
  baseUrl: string;
  listProjectsPath: string;
  listPartitionedFileNamesPath: string;
  projectYamlsPath: string;
  updateProjectByYamlPath: string;
  validateProjectYamlPath: string;
  timeoutMs: number;
  minIntervalMs: number;
}

const DEFAULTS = {
  baseUrl: "https://api.flutterflow.io/v2",
  listProjectsPath: "/l/listProjects",
  listPartitionedFileNamesPath: "/listPartitionedFileNames",
  projectYamlsPath: "/projectYamls",
  updateProjectByYamlPath: "/updateProjectByYaml",
  validateProjectYamlPath: "/validateProjectYaml",
  timeoutMs: 20_000,
  minIntervalMs: 1_000
} as const;

export function loadFlutterFlowApiConfig(): FlutterFlowApiConfig {
  const token = process.env.FLUTTERFLOW_API_TOKEN?.trim() || "";

  // Keep legacy env names for compatibility while preferring explicit v2 names.
  const baseUrl = process.env.FLUTTERFLOW_API_BASE_URL?.trim() || DEFAULTS.baseUrl;

  return {
    token,
    baseUrl,
    listProjectsPath:
      process.env.FLUTTERFLOW_API_LIST_PROJECTS_PATH?.trim() ||
      process.env.FLUTTERFLOW_API_LIST_PROJECTS_V2_PATH?.trim() ||
      DEFAULTS.listProjectsPath,
    listPartitionedFileNamesPath:
      process.env.FLUTTERFLOW_API_LIST_PARTITIONED_FILES_PATH?.trim() ||
      process.env.FLUTTERFLOW_API_LIST_FILES_PATH?.trim() ||
      DEFAULTS.listPartitionedFileNamesPath,
    projectYamlsPath:
      process.env.FLUTTERFLOW_API_PROJECT_YAMLS_PATH?.trim() ||
      process.env.FLUTTERFLOW_API_GET_FILE_PATH?.trim() ||
      DEFAULTS.projectYamlsPath,
    updateProjectByYamlPath:
      process.env.FLUTTERFLOW_API_UPDATE_PROJECT_YAML_PATH?.trim() ||
      process.env.FLUTTERFLOW_API_PUSH_FILES_PATH?.trim() ||
      DEFAULTS.updateProjectByYamlPath,
    validateProjectYamlPath:
      process.env.FLUTTERFLOW_API_VALIDATE_PROJECT_YAML_PATH?.trim() ||
      process.env.FLUTTERFLOW_API_VALIDATE_PATH?.trim() ||
      DEFAULTS.validateProjectYamlPath,
    timeoutMs: Number.parseInt(process.env.FLUTTERFLOW_API_TIMEOUT_MS ?? "", 10) || DEFAULTS.timeoutMs,
    minIntervalMs: Number.parseInt(process.env.FLUTTERFLOW_API_MIN_INTERVAL_MS ?? "", 10) || DEFAULTS.minIntervalMs
  };
}

export function fillPath(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = values[key];
    if (!value) {
      throw new Error(`Missing path variable: ${key}`);
    }
    return encodeURIComponent(value);
  });
}
