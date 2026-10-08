import { createServer } from "node:http";

const alertNames = new Set();

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200).end("ok");
    return;
  }

  if (request.method === "GET" && request.url === "/received") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ alertNames: [...alertNames] }));
    return;
  }

  if (request.method !== "POST" || request.url !== "/receive") {
    response.writeHead(404).end();
    return;
  }

  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    body += chunk;
    if (body.length > 1_000_000) request.destroy();
  });
  request.on("end", () => {
    try {
      const payload = JSON.parse(body);
      for (const alert of payload.alerts ?? []) {
        if (typeof alert.labels?.alertname === "string") {
          alertNames.add(alert.labels.alertname);
        }
      }
      response.writeHead(200).end("ok");
    } catch {
      response.writeHead(400).end("invalid JSON");
    }
  });
});

server.listen(9000, "0.0.0.0");
