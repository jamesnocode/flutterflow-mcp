import { afterEach, describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";
import { HttpFlutterFlowAdapter } from "../src/ff/adapter.js";

function mockJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function mockErrorResponse(status: number, body: string, headers?: Record<string, string>): Response {
  return new Response(body, {
    status,
    headers: headers ?? { "content-type": "text/plain" }
  });
}

describe("HttpFlutterFlowAdapter v2", () => {
  const fetchMock = vi.fn<typeof fetch>();

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("parses listPartitionedFileNames with versionInfo", async () => {
    vi.stubGlobal("fetch", fetchMock);

    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        body: {
          fileNames: ["lib/pages/home.yaml", "lib/components/card.yaml"],
          versionInfo: {
            partitionerVersion: "2.1",
            projectSchemaFingerprint: "abc123"
          }
        }
      })
    );

    const adapter = new HttpFlutterFlowAdapter({
      token: "token",
      baseUrl: "https://api.flutterflow.io/v2",
      listProjectsPath: "/l/listProjects",
      listPartitionedFileNamesPath: "/listPartitionedFileNames",
      projectYamlsPath: "/projectYamls",
      updateProjectByYamlPath: "/updateProjectByYaml",
      validateProjectYamlPath: "/validateProjectYaml",
      timeoutMs: 5000,
      minIntervalMs: 0
    });

    const result = await adapter.listPartitionedFileNames("proj_1");

    expect(result.files).toEqual([
      { fileKey: "lib/pages/home.yaml" },
      { fileKey: "lib/components/card.yaml" }
    ]);
    expect(result.versionInfo).toEqual({
      partitionerVersion: "2.1",
      projectSchemaFingerprint: "abc123"
    });
  });

  it("returns a clear error when token is missing", async () => {
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new HttpFlutterFlowAdapter({
      token: "",
      baseUrl: "https://api.flutterflow.io/v2",
      listProjectsPath: "/l/listProjects",
      listPartitionedFileNamesPath: "/listPartitionedFileNames",
      projectYamlsPath: "/projectYamls",
      updateProjectByYamlPath: "/updateProjectByYaml",
      validateProjectYamlPath: "/validateProjectYaml",
      timeoutMs: 5000,
      minIntervalMs: 0
    });

    await expect(adapter.listProjects()).rejects.toThrow("Missing FLUTTERFLOW_API_TOKEN");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parses listPartitionedFileNames success/value envelope with snake_case fields", async () => {
    vi.stubGlobal("fetch", fetchMock);

    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        success: true,
        reason: null,
        value: {
          version_info: {
            partitioner_version: 7,
            project_schema_fingerprint: "fp-123"
          },
          file_names: ["page/id-foo", "component/id-bar"]
        }
      })
    );

    const adapter = new HttpFlutterFlowAdapter({
      token: "token",
      baseUrl: "https://api.flutterflow.io/v2",
      listProjectsPath: "/l/listProjects",
      listPartitionedFileNamesPath: "/listPartitionedFileNames",
      projectYamlsPath: "/projectYamls",
      updateProjectByYamlPath: "/updateProjectByYaml",
      validateProjectYamlPath: "/validateProjectYaml",
      timeoutMs: 5000,
      minIntervalMs: 0
    });

    const result = await adapter.listPartitionedFileNames("proj_1");
    expect(result.files.map((f) => f.fileKey)).toEqual(["page/id-foo", "component/id-bar"]);
    expect(result.versionInfo).toEqual({
      partitionerVersion: "7",
      projectSchemaFingerprint: "fp-123"
    });
  });

  it("decodes projectYamlBytes zip payload", async () => {
    vi.stubGlobal("fetch", fetchMock);

    const zipped = zipSync({
      "lib/pages/home.yaml": strToU8("page:\n  name: Home\n"),
      "lib/components/card.yaml": strToU8("component:\n  name: Card\n")
    });

    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        body: {
          projectYamlBytes: Buffer.from(zipped).toString("base64"),
          versionInfo: {
            partitionerVersion: "2.2",
            projectSchemaFingerprint: "fffp"
          }
        }
      })
    );

    const adapter = new HttpFlutterFlowAdapter({
      token: "token",
      baseUrl: "https://api.flutterflow.io/v2",
      listProjectsPath: "/l/listProjects",
      listPartitionedFileNamesPath: "/listPartitionedFileNames",
      projectYamlsPath: "/projectYamls",
      updateProjectByYamlPath: "/updateProjectByYaml",
      validateProjectYamlPath: "/validateProjectYaml",
      timeoutMs: 5000,
      minIntervalMs: 0
    });

    const result = await adapter.fetchProjectYamls("proj_1");

    expect(result.files["lib/pages/home.yaml"]).toContain("name: Home");
    expect(result.files["lib/components/card.yaml"]).toContain("name: Card");
    expect(result.versionInfo?.projectSchemaFingerprint).toBe("fffp");
  });

  it("decodes success/value envelope with project_yaml_bytes", async () => {
    vi.stubGlobal("fetch", fetchMock);

    const zipped = zipSync({
      "page/id-foo": strToU8("page:\n  name: Foo\n"),
      "component/id-bar": strToU8("component:\n  name: Bar\n")
    });

    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        success: true,
        reason: null,
        value: {
          project_yaml_bytes: Buffer.from(zipped).toString("base64"),
          version_info: {
            partitioner_version: 7,
            project_schema_fingerprint: "fp-789"
          }
        }
      })
    );

    const adapter = new HttpFlutterFlowAdapter({
      token: "token",
      baseUrl: "https://api.flutterflow.io/v2",
      listProjectsPath: "/l/listProjects",
      listPartitionedFileNamesPath: "/listPartitionedFileNames",
      projectYamlsPath: "/projectYamls",
      updateProjectByYamlPath: "/updateProjectByYaml",
      validateProjectYamlPath: "/validateProjectYaml",
      timeoutMs: 5000,
      minIntervalMs: 0
    });

    const result = await adapter.fetchProjectYamls("proj_1");
    expect(result.files["page/id-foo"]).toContain("name: Foo");
    expect(result.files["component/id-bar"]).toContain("name: Bar");
    expect(result.versionInfo).toEqual({
      partitionerVersion: "7",
      projectSchemaFingerprint: "fp-789"
    });
  });

  it("parses folder-based listPartitionedFileNames payload", async () => {
    vi.stubGlobal("fetch", fetchMock);

    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        body: {
          folders: [
            { name: "page", files: ["id-home", "id-settings"] },
            { name: "component", files: ["id-button"] }
          ]
        }
      })
    );

    const adapter = new HttpFlutterFlowAdapter({
      token: "token",
      baseUrl: "https://api.flutterflow.io/v2",
      listProjectsPath: "/l/listProjects",
      listPartitionedFileNamesPath: "/listPartitionedFileNames",
      projectYamlsPath: "/projectYamls",
      updateProjectByYamlPath: "/updateProjectByYaml",
      validateProjectYamlPath: "/validateProjectYaml",
      timeoutMs: 5000,
      minIntervalMs: 0
    });

    const result = await adapter.listPartitionedFileNames("proj_1");
    expect(result.files.map((f) => f.fileKey)).toEqual(["page/id-home", "page/id-settings", "component/id-button"]);
  });

  it("parses folder-based projectYamls payload and resolves exact file", async () => {
    vi.stubGlobal("fetch", fetchMock);

    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        body: {
          folders: [
            {
              name: "page",
              files: [{ name: "id-home", content: "page:\n  name: Home\n" }]
            }
          ]
        }
      })
    );

    const adapter = new HttpFlutterFlowAdapter({
      token: "token",
      baseUrl: "https://api.flutterflow.io/v2",
      listProjectsPath: "/l/listProjects",
      listPartitionedFileNamesPath: "/listPartitionedFileNames",
      projectYamlsPath: "/projectYamls",
      updateProjectByYamlPath: "/updateProjectByYaml",
      validateProjectYamlPath: "/validateProjectYaml",
      timeoutMs: 5000,
      minIntervalMs: 0
    });

    const content = await adapter.fetchFile("proj_1", "page/id-home");
    expect(content).toContain("name: Home");
  });

  it("pushFiles prefers canonical extensionless keys from partitioned listing", async () => {
    vi.stubGlobal("fetch", fetchMock);

    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        success: true,
        reason: null,
        value: {
          file_names: ["page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Text_wsxpaf81"]
        }
      })
    );
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        success: true,
        reason: null,
        value: ""
      })
    );

    const adapter = new HttpFlutterFlowAdapter({
      token: "token",
      baseUrl: "https://api.flutterflow.io/v2",
      listProjectsPath: "/l/listProjects",
      listPartitionedFileNamesPath: "/listPartitionedFileNames",
      projectYamlsPath: "/projectYamls",
      updateProjectByYamlPath: "/updateProjectByYaml",
      validateProjectYamlPath: "/validateProjectYaml",
      timeoutMs: 5000,
      minIntervalMs: 0
    });

    const push = await adapter.pushFiles("proj_1", [
      {
        fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Text_wsxpaf81.yaml",
        yaml: "type: Text\n"
      }
    ]);

    expect(push.ok).toBe(true);
    const secondCall = fetchMock.mock.calls[1];
    const init = secondCall?.[1] as RequestInit;
    const body = JSON.parse(String(init.body)) as { fileKeyToContent: Record<string, string> };
    expect(body.fileKeyToContent["page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Text_wsxpaf81"]).toContain(
      "type: Text"
    );
    expect(body.fileKeyToContent["page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Text_wsxpaf81.yaml"]).toBe(
      undefined
    );
  });

  it("validateProjectYaml sends doc and legacy payload key aliases", async () => {
    vi.stubGlobal("fetch", fetchMock);

    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        body: {
          status: "ok",
          isValid: true
        }
      })
    );

    const adapter = new HttpFlutterFlowAdapter({
      token: "token",
      baseUrl: "https://api.flutterflow.io/v2",
      listProjectsPath: "/l/listProjects",
      listPartitionedFileNamesPath: "/listPartitionedFileNames",
      projectYamlsPath: "/projectYamls",
      updateProjectByYamlPath: "/updateProjectByYaml",
      validateProjectYamlPath: "/validateProjectYaml",
      timeoutMs: 5000,
      minIntervalMs: 0
    });

    const result = await adapter.validateProjectYaml("proj_1", "page/id-home.yaml", "page:\n  name: Home\n");
    expect(result.ok).toBe(true);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body)) as Record<string, string>;
    expect(body.fileKey).toBe("page/id-home.yaml");
    expect(body.fileName).toBe("page/id-home.yaml");
    expect(body.fileContent).toContain("name: Home");
    expect(body.yamlContent).toContain("name: Home");
  });

  it("retries pushFiles once on 429 and succeeds", async () => {
    vi.stubGlobal("fetch", fetchMock);

    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        body: {
          fileNames: ["page/id-home"]
        }
      })
    );
    fetchMock.mockResolvedValueOnce(
      mockErrorResponse(429, "Too Many Requests", {
        "content-type": "text/plain",
        "retry-after": "0"
      })
    );
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        success: true,
        value: ""
      })
    );

    const adapter = new HttpFlutterFlowAdapter({
      token: "token",
      baseUrl: "https://api.flutterflow.io/v2",
      listProjectsPath: "/l/listProjects",
      listPartitionedFileNamesPath: "/listPartitionedFileNames",
      projectYamlsPath: "/projectYamls",
      updateProjectByYamlPath: "/updateProjectByYaml",
      validateProjectYamlPath: "/validateProjectYaml",
      timeoutMs: 5000,
      minIntervalMs: 0
    });

    const result = await adapter.pushFiles("proj_1", [{ fileKey: "page/id-home.yaml", yaml: "page:\n  name: Home\n" }]);
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
