import { ResourceTemplate, type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { OrbitCommandPalette } from "./orbitTool.js";

export function registerOrbitResources(server: McpServer, orbit: OrbitCommandPalette): void {
  server.registerResource(
    "orbit-schema-index",
    "orbit://schema/index",
    {
      title: "Orbit Schema Index",
      description: "Catalog of Orbit schema docs and snippets",
      mimeType: "application/json"
    },
    async () => {
      return {
        contents: [
          {
            uri: "orbit://schema/index",
            mimeType: "application/json",
            text: JSON.stringify(orbit.getSchemaIndex(), null, 2)
          }
        ]
      };
    }
  );

  server.registerResource(
    "orbit-schema-doc",
    new ResourceTemplate("orbit://schema/doc/{id}", {
      list: async () => ({
        resources: orbit.getSchemaIndex().docs.map((doc) => ({
          uri: `orbit://schema/doc/${encodeURIComponent(doc.id)}`,
          name: doc.title,
          mimeType: "application/json",
          description: doc.tags.join(", ")
        }))
      })
    }),
    {
      title: "Orbit Schema Doc",
      description: "One schema document from the Orbit pack",
      mimeType: "application/json"
    },
    async (_uri, variables) => {
      const id = decodeURIComponent(String(variables.id ?? ""));
      const doc = orbit.getSchemaDoc(id);
      if (!doc) {
        throw new Error(`Schema doc not found: ${id}`);
      }

      return {
        contents: [
          {
            uri: `orbit://schema/doc/${encodeURIComponent(id)}`,
            mimeType: "application/json",
            text: JSON.stringify(doc, null, 2)
          }
        ]
      };
    }
  );

  server.registerResource(
    "orbit-schema-snippet",
    new ResourceTemplate("orbit://schema/snippet/{id}", {
      list: async () => ({
        resources: orbit.getSchemaIndex().snippets.map((snippet) => ({
          uri: `orbit://schema/snippet/${encodeURIComponent(snippet.id)}`,
          name: snippet.title,
          mimeType: "application/json",
          description: snippet.tags.join(", ")
        }))
      })
    }),
    {
      title: "Orbit Schema Snippet",
      description: "One snippet from the Orbit pack",
      mimeType: "application/json"
    },
    async (_uri, variables) => {
      const id = decodeURIComponent(String(variables.id ?? ""));
      const snippet = orbit.getSchemaSnippet(id);
      if (!snippet) {
        throw new Error(`Schema snippet not found: ${id}`);
      }

      return {
        contents: [
          {
            uri: `orbit://schema/snippet/${encodeURIComponent(id)}`,
            mimeType: "application/json",
            text: JSON.stringify(snippet, null, 2)
          }
        ]
      };
    }
  );
}
