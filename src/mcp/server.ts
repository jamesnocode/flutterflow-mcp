import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";
import { OrbitCommandPalette } from "./orbitTool.js";
import { registerOrbitResources } from "./resources.js";
import { PolicyEngine } from "../policy/engine.js";
import type { OrbitPolicy } from "../types.js";

function formatResult(result: unknown, explain = false): string {
  if (!explain) {
    return JSON.stringify(result, null, 2);
  }

  const line = JSON.stringify(result, null, 2);
  return `Orbit result:\n${line}`;
}

export function buildMcpServer(orbit: OrbitCommandPalette, policyEngine: PolicyEngine) {
  const server = new McpServer({
    name: "flutterflow-mcp",
    version: "0.1.0"
  });

  registerOrbitResources(server, orbit);

  server.registerTool(
    "orbit",
    {
      title: "Orbit Command Palette",
      description:
        "Primary command palette for FlutterFlow project discovery, querying, and safe ChangeSet editing. Start with cmd='help'.",
      inputSchema: {
        cmd: z.string().describe("Orbit command verb, run help first"),
        args: z.record(z.string(), z.unknown()).optional(),
        snapshot: z.string().optional(),
        format: z.enum(["json", "explain"]).optional()
      }
    },
    async (args) => {
      const result = await orbit.run({
        cmd: args.cmd,
        args: args.args as Record<string, unknown> | undefined,
        snapshot: args.snapshot,
        format: args.format
      });

      return {
        content: [
          {
            type: "text",
            text: formatResult(result, args.format === "explain")
          }
        ]
      };
    }
  );

  server.registerTool(
    "orbit_policy_get",
    {
      title: "Get Active Orbit Policy",
      description: "Returns merged Orbit policy (file + env overrides)",
      inputSchema: {}
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(policyEngine.getPolicy(), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "orbit_policy_set",
    {
      title: "Set Orbit Policy File",
      description: "Writes orbit.policy.json when ORBIT_ALLOW_POLICY_WRITE=1",
      inputSchema: {
        policy: z.record(z.string(), z.unknown())
      }
    },
    async ({ policy }) => {
      if (process.env.ORBIT_ALLOW_POLICY_WRITE !== "1") {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Policy writes disabled. Set ORBIT_ALLOW_POLICY_WRITE=1 to enable orbit_policy_set."
            }
          ]
        };
      }

      const next = policy as unknown as OrbitPolicy;
      await policyEngine.setPolicy(next);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ ok: true, policy: policyEngine.getPolicy() }, null, 2)
          }
        ]
      };
    }
  );

  server.registerTool(
    "orbit_export_changeset",
    {
      title: "Export Manual Apply Payload",
      description: "Exports a manual apply payload JSON for offline/app-manual pushes",
      inputSchema: {
        changesetId: z.string()
      }
    },
    async ({ changesetId }) => {
      const result = await orbit.run({
        cmd: "changeset.preview",
        args: { changesetId }
      });
      const payload = orbit.exportChangesetPayload(changesetId);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ preview: result, payload }, null, 2)
          }
        ]
      };
    }
  );

  return {
    server,
    async startStdio(): Promise<void> {
      const transport = new StdioServerTransport();
      await server.connect(transport);
    }
  };
}
