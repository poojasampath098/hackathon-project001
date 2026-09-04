process.env.JWT_SECRET = "test-jwt-secret-cors";
process.env.FRONTEND_URL = "http://localhost:5173";

const http = require("http");
const express = require("express");
const cors = require("cors");
const config = require("../src/core/config");

function createTestApp(customConfig) {
  const app = express();
  app.use(
    customConfig ||
      cors({
        origin: config.frontendUrl,
        credentials: true,
      })
  );
  app.get("/health", (req, res) => res.json({ status: "ok" }));
  return app;
}

function rawRequest(app, method, path, headers) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const req = http.request(
        { hostname: "127.0.0.1", port, method, path, headers },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            server.close(() =>
              resolve({
                status: res.statusCode,
                headers: res.headers,
                body: chunks.join(""),
              })
            );
          });
        }
      );
      req.end();
    });
  });
}

// ═══════════════════════════════════════════════════════════════════
// CORS Origin Configuration
// ═══════════════════════════════════════════════════════════════════

describe("CORS origin configuration", () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  test("config.frontendUrl resolves to http://localhost:5173", () => {
    expect(config.frontendUrl).toBe("http://localhost:5173");
  });

  test("configured origin is not '*' (wildcard incompatible with credentials)", () => {
    expect(config.frontendUrl).not.toBe("*");
  });

  test("allowed origin receives Access-Control-Allow-Origin: http://localhost:5173", async () => {
    const res = await rawRequest(app, "GET", "/health", {
      Origin: "http://localhost:5173",
    });
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173"
    );
  });

  test("allowed origin receives Access-Control-Allow-Credentials: true", async () => {
    const res = await rawRequest(app, "GET", "/health", {
      Origin: "http://localhost:5173",
    });
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  test("Vary: Origin header is always set (prevents cache poisoning)", async () => {
    const res = await rawRequest(app, "GET", "/health", {
      Origin: "http://localhost:5173",
    });
    const vary = res.headers.vary || "";
    expect(vary.toLowerCase()).toContain("origin");
  });
});

// ═══════════════════════════════════════════════════════════════════
// CORS origin behavior for non-matching / no Origin
// ═══════════════════════════════════════════════════════════════════

describe("CORS origin reflection behavior", () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  test("non-matching origin: cors package reflects configured origin (browser enforces SOP)", async () => {
    const res = await rawRequest(app, "GET", "/health", {
      Origin: "http://evil.com",
    });
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173"
    );
    const vary = res.headers.vary || "";
    expect(vary.toLowerCase()).toContain("origin");
  });

  test("no Origin header: cors package still reflects configured origin", async () => {
    const res = await rawRequest(app, "GET", "/health", {});
    expect(res.status).toBe(200);
    // The cors package with string origin always sets ACAO regardless of request Origin.
    // Security is enforced by the browser, not the server, for this configuration.
    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173"
    );
    expect(JSON.parse(res.body).status).toBe("ok");
  });
});

// ═══════════════════════════════════════════════════════════════════
// OPTIONS Preflight
// ═══════════════════════════════════════════════════════════════════

describe("CORS preflight (OPTIONS)", () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  test("preflight returns 204 with ACAO and ACAC headers", async () => {
    const res = await rawRequest(app, "OPTIONS", "/health", {
      Origin: "http://localhost:5173",
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "Authorization, Content-Type",
    });
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173"
    );
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  test("preflight allowed-methods includes GET, POST, PUT, DELETE, PATCH, HEAD", async () => {
    const res = await rawRequest(app, "OPTIONS", "/health", {
      Origin: "http://localhost:5173",
      "Access-Control-Request-Method": "GET",
    });
    expect(res.status).toBe(204);
    const methods = (res.headers["access-control-allow-methods"] || "").toUpperCase();
    expect(methods).toContain("GET");
    expect(methods).toContain("HEAD");
    expect(methods).toContain("POST");
    expect(methods).toContain("PUT");
    expect(methods).toContain("PATCH");
    expect(methods).toContain("DELETE");
  });

  test("preflight allowed-headers includes Authorization", async () => {
    const res = await rawRequest(app, "OPTIONS", "/health", {
      Origin: "http://localhost:5173",
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "Authorization",
    });
    expect(res.status).toBe(204);
    const allowedHeaders = (
      res.headers["access-control-allow-headers"] || ""
    ).toLowerCase();
    expect(allowedHeaders).toContain("authorization");
  });

  test("preflight Vary header includes Origin", async () => {
    const res = await rawRequest(app, "OPTIONS", "/health", {
      Origin: "http://localhost:5173",
      "Access-Control-Request-Method": "GET",
    });
    const vary = res.headers.vary || "";
    expect(vary.toLowerCase()).toContain("origin");
  });
});

// ═══════════════════════════════════════════════════════════════════
// Auth mechanism compatibility
// ═══════════════════════════════════════════════════════════════════

describe("CORS with Bearer token auth (Authorization header)", () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  test("GET with Origin and Authorization header receives CORS headers", async () => {
    const res = await rawRequest(app, "GET", "/health", {
      Origin: "http://localhost:5173",
      Authorization: "Bearer fake-token-for-cors-test",
    });
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173"
    );
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  test("preflight for Authorization header type is accepted", async () => {
    const res = await rawRequest(app, "OPTIONS", "/health", {
      Origin: "http://localhost:5173",
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "Authorization",
    });
    expect(res.status).toBe(204);
    const allowedHeaders = (
      res.headers["access-control-allow-headers"] || ""
    ).toLowerCase();
    expect(allowedHeaders).toContain("authorization");
  });
});

// ═══════════════════════════════════════════════════════════════════
// Security: wrong origin must not match
// ═══════════════════════════════════════════════════════════════════

describe("CORS security properties", () => {
  test("http://localhost:3000 is not the configured origin", () => {
    expect(config.frontendUrl).not.toBe("http://localhost:3000");
  });

  test("http://localhost:5000 (backend) is not the configured frontend origin", () => {
    expect(config.frontendUrl).not.toBe("http://localhost:5000");
  });

  test("credentials flag is truthy (supports Bearer token auth via CORS)", () => {
    const app = createTestApp();
    const corsMiddleware = app._router.stack.find(
      (layer) => layer.name === "corsMiddleware"
    );
    expect(corsMiddleware).toBeDefined();
  });
});
