import { createServer, type Server } from "node:http";

export interface HttpStatusPayload {
  version: string;
  snapshots: number;
  recentRefreshes: Array<{ snapshotId: string; refreshedAt: string }>;
}

export interface HttpServerDeps {
  port: number;
  getStatus: () => HttpStatusPayload;
  getPolicySummary: () => Record<string, unknown>;
}

export function startHttpServer(deps: HttpServerDeps): Promise<Server> {
  const server = createServer((req, res) => {
    const url = req.url ?? "/";

    if (req.method === "GET" && url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === "GET" && url === "/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(deps.getStatus()));
      return;
    }

    if (req.method === "GET" && url === "/policy") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(deps.getPolicySummary()));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(deps.port, () => {
      server.off("error", reject);
      resolve(server);
    });
  });
}
