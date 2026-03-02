import { strFromU8, unzipSync } from "fflate";
import { fillPath, type FlutterFlowApiConfig } from "./config.js";
import { HttpClient } from "./httpClient.js";
import { FlutterFlowApiError } from "./errors.js";
import type { FileKeyEntry, FileUpdate, ProjectSummary, ProjectVersionInfo, PushResult } from "../types.js";

export interface FlutterFlowAdapter {
  listProjects(): Promise<ProjectSummary[]>;
  listFileKeys(projectId: string): Promise<FileKeyEntry[]>;
  fetchFile(projectId: string, fileKey: string): Promise<string>;
  pushFiles(projectId: string, updates: FileUpdate[]): Promise<PushResult>;
  remoteValidate(yaml: string, projectId?: string, fileKey?: string): Promise<{ ok: boolean; message?: string }>;
  listPartitionedFileNames(projectId: string): Promise<{ files: FileKeyEntry[]; versionInfo?: ProjectVersionInfo }>;
  fetchProjectYamls(
    projectId: string,
    fileName?: string,
    options?: { includeVersionInfo?: boolean }
  ): Promise<{ files: Record<string, string>; versionInfo?: ProjectVersionInfo }>;
  validateProjectYaml(projectId: string, fileKey: string, content: string): Promise<{ ok: boolean; message?: string }>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function unwrapEnvelope(raw: unknown): unknown {
  const root = asRecord(raw);
  if (typeof root.success === "boolean" && "value" in root) {
    return root.value;
  }
  return raw;
}

function readString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      return value;
    }
  }
  return undefined;
}

function looksLikeLikelyFileKey(fileKey: string): boolean {
  const normalized = fileKey.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  // Some API payloads include folder/container labels in file-name lists.
  if (["folders", "files", "pages", "components", "routes", "widgets", "actions"].includes(normalized)) {
    return false;
  }

  return true;
}

function stripYamlExtension(fileKey: string): string {
  return fileKey.replace(/\.ya?ml$/i, "");
}

function looksLikeYamlContent(value: string): boolean {
  const text = value.trim();
  if (!text) {
    return false;
  }
  if (text.startsWith("{") || text.startsWith("[")) {
    return false;
  }
  if (!text.includes(":")) {
    return false;
  }
  return text.includes("\n") || /^[a-zA-Z0-9_.-]+\s*:/.test(text);
}

function toProjectSummaries(raw: unknown): ProjectSummary[] {
  const unwrapped = unwrapEnvelope(raw);
  if (typeof unwrapped === "string" && unwrapped.trim().length === 0) {
    return [];
  }

  const root = asRecord(unwrapped);
  const listBody = asRecord(root.body);
  const candidates = Array.isArray(raw)
    ? raw
    : Array.isArray(unwrapped)
      ? unwrapped
    : Array.isArray(root.projects)
      ? root.projects
      : Array.isArray(root.data)
        ? root.data
        : Array.isArray(root.body)
          ? root.body
          : Array.isArray(listBody.projects)
            ? listBody.projects
            : Array.isArray(listBody.data)
              ? listBody.data
              : [];

  return candidates
    .map((entry) => {
      const row = asRecord(entry);
      const id = String(row.id ?? row.projectId ?? row.projectName ?? row.uuid ?? "").trim();
      const name = String(row.name ?? row.projectName ?? row.title ?? id).trim();
      if (!id) {
        return undefined;
      }
      return { id, name };
    })
    .filter((v): v is ProjectSummary => Boolean(v));
}

function toVersionInfo(raw: Record<string, unknown>): ProjectVersionInfo | undefined {
  const versionInfoRow = asRecord(raw.versionInfo ?? raw.version_info);
  const partitionerVersion =
    typeof raw.partitionerVersion === "string" || typeof raw.partitionerVersion === "number"
      ? String(raw.partitionerVersion)
      : typeof raw.partitioner_version === "string" || typeof raw.partitioner_version === "number"
        ? String(raw.partitioner_version)
        : typeof versionInfoRow.partitionerVersion === "string" || typeof versionInfoRow.partitionerVersion === "number"
          ? String(versionInfoRow.partitionerVersion)
          : typeof versionInfoRow.partitioner_version === "string" || typeof versionInfoRow.partitioner_version === "number"
            ? String(versionInfoRow.partitioner_version)
        : undefined;

  const projectSchemaFingerprint =
    typeof raw.projectSchemaFingerprint === "string"
      ? raw.projectSchemaFingerprint
      : typeof raw.project_schema_fingerprint === "string"
        ? raw.project_schema_fingerprint
      : typeof versionInfoRow.projectSchemaFingerprint === "string"
        ? versionInfoRow.projectSchemaFingerprint
        : typeof versionInfoRow.project_schema_fingerprint === "string"
          ? versionInfoRow.project_schema_fingerprint
        : undefined;

  if (!partitionerVersion && !projectSchemaFingerprint) {
    return undefined;
  }

  return {
    partitionerVersion,
    projectSchemaFingerprint
  };
}

function toFileKeyEntries(raw: unknown): { files: FileKeyEntry[]; versionInfo?: ProjectVersionInfo } {
  const unwrapped = unwrapEnvelope(raw);
  const root = asRecord(unwrapped);
  const listBody = asRecord(root.body);
  const candidates = Array.isArray(raw)
    ? raw
    : Array.isArray(unwrapped)
      ? unwrapped
    : Array.isArray(root.files)
      ? root.files
      : Array.isArray(root.fileNames)
        ? root.fileNames
        : Array.isArray(root.file_names)
          ? root.file_names
        : Array.isArray(root.items)
          ? root.items
          : Array.isArray(listBody.fileNames)
            ? listBody.fileNames
            : Array.isArray(listBody.file_names)
              ? listBody.file_names
            : Array.isArray(listBody.files)
              ? listBody.files
              : [];

  let files = candidates
    .map((entry) => {
      if (typeof entry === "string") {
        return { fileKey: entry };
      }

      const row = asRecord(entry);
      const fileKey = String(row.fileKey ?? row.key ?? row.path ?? row.fileName ?? "").trim();
      if (!fileKey) {
        return undefined;
      }

      const hashValue = row.hash ?? row.sha256 ?? row.etag ?? row.checksum;
      const hash = typeof hashValue === "string" ? hashValue : undefined;
      return { fileKey, hash };
    })
    .filter((v): v is FileKeyEntry => Boolean(v));

  if (files.length === 0) {
    const folders = [
      ...(Array.isArray(root.folders) ? root.folders : []),
      ...(Array.isArray(listBody.folders) ? listBody.folders : [])
    ];

    if (folders.length > 0) {
      const inferred: FileKeyEntry[] = [];
      for (const folderEntry of folders) {
        const folder = asRecord(folderEntry);
        const folderName = readString(folder, ["name", "folder", "path", "key", "id"]);
        const folderFiles =
          (Array.isArray(folder.files) ? folder.files : Array.isArray(folder.fileNames) ? folder.fileNames : []).map(
            (entry) => {
              if (typeof entry === "string") {
                return entry;
              }
              const row = asRecord(entry);
              return readString(row, ["fileKey", "fileName", "file_name", "path", "key"]) ?? "";
            }
          );

        for (const item of folderFiles) {
          const value = item.trim();
          if (!value) {
            continue;
          }

          const fileKey =
            folderName && !value.includes("/") && !value.startsWith(folderName)
              ? `${folderName.replace(/\/$/, "")}/${value}`
              : value;
          inferred.push({ fileKey });
        }
      }
      files = inferred;
    }
  }

  files = files.filter((entry) => looksLikeLikelyFileKey(entry.fileKey));

  return {
    files,
    versionInfo: toVersionInfo({ ...root, ...listBody })
  };
}

function decodeZipYamlBytes(value: string): Record<string, string> {
  const binary = Buffer.from(value, "base64");
  const unzipped = unzipSync(new Uint8Array(binary));
  const files: Record<string, string> = {};

  for (const [zipPath, data] of Object.entries(unzipped)) {
    const normalizedPath = zipPath.replace(/^\//, "");
    if (!normalizedPath || normalizedPath.endsWith("/")) {
      continue;
    }

    files[normalizedPath] = strFromU8(data);
  }

  return files;
}

function toProjectYamlMap(raw: unknown): { files: Record<string, string>; versionInfo?: ProjectVersionInfo } {
  const unwrapped = unwrapEnvelope(raw);
  if (typeof unwrapped === "string") {
    return { files: { "project.yaml": unwrapped } };
  }

  const root = asRecord(unwrapped);
  const body = asRecord(root.body);

  const projectYamlBytes = readString(root, ["projectYamlBytes", "project_yaml_bytes"]) ??
    readString(body, ["projectYamlBytes", "project_yaml_bytes"]);

  if (projectYamlBytes) {
    return {
      files: decodeZipYamlBytes(projectYamlBytes),
      versionInfo: toVersionInfo({ ...root, ...body })
    };
  }

  const fileKeyToContent = asRecord(root.fileKeyToContent ?? root.file_key_to_content);
  const bodyFileKeyToContent = asRecord(body.fileKeyToContent ?? body.file_key_to_content);
  const mergedFileKeyToContent = {
    ...fileKeyToContent,
    ...bodyFileKeyToContent
  };
  const mapEntries = Object.entries(mergedFileKeyToContent).filter(([, value]) => typeof value === "string");
  if (mapEntries.length > 0) {
    return {
      files: Object.fromEntries(mapEntries) as Record<string, string>,
      versionInfo: toVersionInfo({ ...root, ...body })
    };
  }

  const filesRow = asRecord(root.files);
  const bodyFilesRow = asRecord(body.files);
  const mergedFilesRow = { ...filesRow, ...bodyFilesRow };
  const filesRowEntries = Object.entries(mergedFilesRow).filter(([, value]) => typeof value === "string");
  if (filesRowEntries.length > 0) {
    return {
      files: Object.fromEntries(filesRowEntries) as Record<string, string>,
      versionInfo: toVersionInfo({ ...root, ...body })
    };
  }

  const listCandidates = [
    ...(Array.isArray(root.items) ? root.items : []),
    ...(Array.isArray(body.items) ? body.items : []),
    ...(Array.isArray(root.files) ? root.files : []),
    ...(Array.isArray(body.files) ? body.files : []),
    ...(Array.isArray(root.projectYamls) ? root.projectYamls : []),
    ...(Array.isArray(body.projectYamls) ? body.projectYamls : [])
  ];
  if (listCandidates.length > 0) {
    const mapped = new Map<string, string>();
    for (const entry of listCandidates) {
      const row = asRecord(entry);
      const key = readString(row, ["fileKey", "fileName", "file_name", "path", "key"]);
      const yaml = readString(row, ["yaml", "content", "yamlContent", "yaml_content", "value"]);
      if (key && yaml && looksLikeLikelyFileKey(key) && looksLikeYamlContent(yaml)) {
        mapped.set(key, yaml);
      }
    }

    if (mapped.size > 0) {
      return {
        files: Object.fromEntries(mapped.entries()),
        versionInfo: toVersionInfo({ ...root, ...body })
      };
    }
  }

  const directYaml = readString(root, ["yaml", "content", "yaml_content"]) ??
    readString(body, ["yaml", "content", "yaml_content"]);

  if (directYaml) {
    return {
      files: {
        [String(root.fileName ?? root.file_name ?? body.fileName ?? body.file_name ?? "project.yaml")]: directYaml
      },
      versionInfo: toVersionInfo({ ...root, ...body })
    };
  }

  const folders = [...(Array.isArray(root.folders) ? root.folders : []), ...(Array.isArray(body.folders) ? body.folders : [])];
  if (folders.length > 0) {
    const files = new Map<string, string>();
    for (const folderEntry of folders) {
      const folder = asRecord(folderEntry);
      const folderName = readString(folder, ["name", "folder", "path", "key", "id"]);
      const fileEntries = Array.isArray(folder.files) ? folder.files : Array.isArray(folder.items) ? folder.items : [];
      for (const fileEntry of fileEntries) {
        const row = asRecord(fileEntry);
        const fileName = readString(row, ["fileKey", "fileName", "file_name", "name", "path", "key"]);
        const yaml = readString(row, ["yaml", "content", "yamlContent", "yaml_content", "value"]);
        if (!fileName || !yaml || !looksLikeYamlContent(yaml)) {
          continue;
        }
        const fileKey =
          folderName && !fileName.includes("/") && !fileName.startsWith(folderName)
            ? `${folderName.replace(/\/$/, "")}/${fileName}`
            : fileName;
        if (looksLikeLikelyFileKey(fileKey)) {
          files.set(fileKey, yaml);
        }
      }
    }

    if (files.size > 0) {
      return {
        files: Object.fromEntries(files.entries()),
        versionInfo: toVersionInfo({ ...root, ...body })
      };
    }
  }

  throw new Error("Invalid projectYamls response: missing projectYamlBytes/project_yaml_bytes/yaml content");
}

export class HttpFlutterFlowAdapter implements FlutterFlowAdapter {
  private readonly http: HttpClient;

  constructor(private readonly config: FlutterFlowApiConfig) {
    this.http = new HttpClient({
      token: config.token,
      timeoutMs: config.timeoutMs,
      minIntervalMs: config.minIntervalMs
    });
  }

  private retryDelayMs(error: FlutterFlowApiError, baseBackoffMs: number, attempt: number): number {
    const retryAfterSeconds = Number.parseInt(error.request?.retryAfter ?? "", 10);
    const retryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : 0;
    const exponentialMs = Math.min(baseBackoffMs * 2 ** attempt, 60_000);
    return Math.max(retryAfterMs, exponentialMs);
  }

  private async requestJsonWith429Retry<T>(
    url: string,
    init: RequestInit,
    options?: { retries?: number; baseBackoffMs?: number }
  ): Promise<T> {
    const retries = Math.max(0, options?.retries ?? 2);
    const baseBackoffMs = Math.max(250, options?.baseBackoffMs ?? 1500);

    let attempt = 0;
    while (true) {
      try {
        return await this.http.requestJson<T>(url, init);
      } catch (error) {
        if (!(error instanceof FlutterFlowApiError) || error.status !== 429 || attempt >= retries) {
          throw error;
        }
        const waitMs = this.retryDelayMs(error, baseBackoffMs, attempt);
        attempt += 1;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
  }

  private url(path: string): string {
    return `${this.config.baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  }

  private async buildPushMap(projectId: string, updates: FileUpdate[]): Promise<Record<string, string>> {
    let remoteKeys: Set<string> | undefined;
    try {
      const listed = await this.listPartitionedFileNames(projectId);
      remoteKeys = new Set(listed.files.map((entry) => entry.fileKey));
    } catch {
      // Fall back to dual-key payload when file list endpoint is unavailable.
    }

    const fileKeyToContent: Record<string, string> = {};
    for (const update of updates) {
      const original = update.fileKey;
      const stripped = stripYamlExtension(original);

      if (remoteKeys) {
        const chosen = remoteKeys.has(original) ? original : remoteKeys.has(stripped) ? stripped : stripped || original;
        fileKeyToContent[chosen] = update.yaml;
        continue;
      }

      fileKeyToContent[stripped] = update.yaml;
      if (stripped !== original) {
        fileKeyToContent[original] = update.yaml;
      }
    }

    return fileKeyToContent;
  }

  private parsePushResult(raw: unknown): PushResult {
    const record = asRecord(raw);
    const body = asRecord(record.body);
    const unwrapped = asRecord(unwrapEnvelope(raw));
    const unwrappedBody = asRecord(unwrapped.body);

    const statusCandidate =
      typeof body.status === "string"
        ? body.status
        : typeof unwrapped.status === "string"
          ? unwrapped.status
          : typeof unwrappedBody.status === "string"
            ? unwrappedBody.status
            : "";
    const bodyStatus = statusCandidate.toLowerCase();

    const ok =
      typeof record.ok === "boolean"
        ? record.ok
        : typeof record.success === "boolean"
          ? record.success
          : typeof unwrapped.ok === "boolean"
            ? unwrapped.ok
            : typeof body.isValid === "boolean"
              ? body.isValid
              : typeof unwrappedBody.isValid === "boolean"
                ? unwrappedBody.isValid
                : bodyStatus === "ok" || bodyStatus === "success" || bodyStatus === "valid";

    return {
      ok,
      message:
        typeof record.message === "string"
          ? record.message
          : typeof record.reason === "string"
            ? record.reason
            : typeof body.message === "string"
              ? body.message
              : typeof body.error === "string"
                ? body.error
                : typeof unwrapped.message === "string"
                  ? unwrapped.message
                  : typeof unwrapped.reason === "string"
                    ? unwrapped.reason
                    : undefined,
      details: raw
    };
  }

  private parseValidationResult(raw: unknown): { ok: boolean; message?: string } {
    const record = asRecord(raw);
    const body = asRecord(record.body);
    const unwrapped = asRecord(unwrapEnvelope(raw));
    const unwrappedBody = asRecord(unwrapped.body);

    const statusCandidate =
      typeof body.status === "string"
        ? body.status
        : typeof unwrapped.status === "string"
          ? unwrapped.status
          : typeof unwrappedBody.status === "string"
            ? unwrappedBody.status
            : "";
    const status = statusCandidate.toLowerCase();

    const isValid =
      typeof body.isValid === "boolean"
        ? body.isValid
        : typeof unwrappedBody.isValid === "boolean"
          ? unwrappedBody.isValid
          : typeof record.ok === "boolean"
            ? record.ok
            : typeof record.success === "boolean"
              ? record.success
              : typeof unwrapped.ok === "boolean"
                ? unwrapped.ok
                : status === "ok" || status === "valid" || status === "success";

    return {
      ok: isValid,
      message:
        typeof body.error === "string"
          ? body.error
          : typeof unwrappedBody.error === "string"
            ? unwrappedBody.error
            : typeof body.message === "string"
              ? body.message
              : typeof unwrappedBody.message === "string"
                ? unwrappedBody.message
                : typeof record.message === "string"
                  ? record.message
                  : typeof record.reason === "string"
                    ? record.reason
                    : undefined
    };
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const candidatePaths = [...new Set([this.config.listProjectsPath, "/l/listProjects", "/listProjects"])];
    let lastError: unknown;

    for (const path of candidatePaths) {
      const requestUrl = this.url(path);

      // Support either POST or GET styles across API variants.
      try {
        const raw = await this.requestJsonWith429Retry<unknown>(requestUrl, {
          method: "POST",
          body: JSON.stringify({})
        });
        const projects = toProjectSummaries(raw);
        if (projects.length > 0) {
          return projects;
        }
      } catch (error) {
        lastError = error;
      }

      try {
        const raw = await this.requestJsonWith429Retry<unknown>(requestUrl, { method: "GET" });
        const projects = toProjectSummaries(raw);
        if (projects.length > 0) {
          return projects;
        }
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError instanceof Error) {
      throw lastError;
    }
    return [];
  }

  async listPartitionedFileNames(projectId: string): Promise<{ files: FileKeyEntry[]; versionInfo?: ProjectVersionInfo }> {
    const path = this.config.listPartitionedFileNamesPath;
    const url = `${this.url(path)}?projectId=${encodeURIComponent(projectId)}`;
    const raw = await this.requestJsonWith429Retry<unknown>(url, { method: "GET" });
    return toFileKeyEntries(raw);
  }

  async fetchProjectYamls(
    projectId: string,
    fileName?: string,
    options?: { includeVersionInfo?: boolean }
  ): Promise<{ files: Record<string, string>; versionInfo?: ProjectVersionInfo }> {
    const path = this.config.projectYamlsPath;
    const params = new URLSearchParams({ projectId });
    if (fileName) {
      params.set("fileName", fileName);
    }
    if (options?.includeVersionInfo) {
      params.set("includeVersionInfo", "true");
    }

    const url = `${this.url(path)}?${params.toString()}`;
    const raw = await this.requestJsonWith429Retry<unknown>(url, { method: "GET" });
    return toProjectYamlMap(raw);
  }

  async listFileKeys(projectId: string): Promise<FileKeyEntry[]> {
    const response = await this.listPartitionedFileNames(projectId);
    return response.files;
  }

  async fetchFile(projectId: string, fileKey: string): Promise<string> {
    const response = await this.fetchProjectYamls(projectId, fileKey, { includeVersionInfo: false });
    const exact = response.files[fileKey];
    if (typeof exact === "string") {
      return exact;
    }

    const entry = Object.entries(response.files).find(([key]) => key.endsWith(fileKey));
    if (entry) {
      return entry[1];
    }

    const values = Object.values(response.files);
    if (values.length === 1 && typeof values[0] === "string") {
      return values[0];
    }

    const availableKeys = Object.keys(response.files).slice(0, 8);
    throw new Error(
      `Unable to locate file '${fileKey}' in projectYamls response` +
        (availableKeys.length > 0 ? ` (sample keys: ${availableKeys.join(", ")})` : "")
    );
  }

  async pushFiles(projectId: string, updates: FileUpdate[]): Promise<PushResult> {
    const path = this.config.updateProjectByYamlPath;
    const url = this.url(path);
    const fileKeyToContent = await this.buildPushMap(projectId, updates);

    const raw = await this.requestJsonWith429Retry<unknown>(url, {
      method: "POST",
      body: JSON.stringify({ projectId, fileKeyToContent })
    }, { retries: 3, baseBackoffMs: 1500 });

    return this.parsePushResult(raw);
  }

  async validateProjectYaml(projectId: string, fileKey: string, content: string): Promise<{ ok: boolean; message?: string }> {
    const path = this.config.validateProjectYamlPath;
    const url = this.url(path);

    const candidates = [...new Set([fileKey, stripYamlExtension(fileKey)])];
    let lastResult: { ok: boolean; message?: string } | undefined;
    let lastError: unknown;

    for (const candidate of candidates) {
      try {
        const raw = await this.requestJsonWith429Retry<unknown>(url, {
          method: "POST",
          body: JSON.stringify({
            projectId,
            fileKey: candidate,
            fileName: candidate,
            fileContent: content,
            yamlContent: content
          })
        }, { retries: 2, baseBackoffMs: 1200 });

        const parsed = this.parseValidationResult(raw);
        if (parsed.ok) {
          return parsed;
        }
        lastResult = parsed;
      } catch (error) {
        lastError = error;
      }
    }

    if (lastResult) {
      return lastResult;
    }
    if (lastError instanceof Error) {
      return { ok: false, message: lastError.message };
    }
    return { ok: false, message: "Remote validation request failed" };
  }

  async remoteValidate(yaml: string, projectId?: string, fileKey?: string): Promise<{ ok: boolean; message?: string }> {
    if (!projectId || !fileKey) {
      return { ok: true, message: "Skipping remote validation: projectId/fileKey not provided" };
    }

    try {
      return await this.validateProjectYaml(projectId, fileKey, yaml);
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Remote validation request failed"
      };
    }
  }
}
