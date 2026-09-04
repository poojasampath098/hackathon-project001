process.env.JWT_SECRET = "test-jwt-secret-sse-events";

const http = require("http");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const express = require("express");
const request = require("supertest");
const bcrypt = require("bcrypt");
const errorHandler = require("../src/middleware/error.middleware");

const User = require("../src/db/models/user.model");
const Task = require("../src/db/models/task.model");
const eventBus = require("../src/core/eventBus");
const activityService = require("../src/services/activity.service");

const eventRoutes = require("../src/routes/event.routes");
const taskRoutes = require("../src/routes/task.routes");
const authRoutes = require("../src/routes/auth.routes");
const { generateAccessToken } = require("../src/core/security");

let mongoServer;
let app;
let server;
let port;
let userId;
let token;
let otherUserId;
let otherToken;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);

  app = express();
  app.use(express.json());
  app.use("/api/auth", authRoutes);
  app.use("/api/tasks", taskRoutes);
  app.use("/api/events", eventRoutes);
  app.use((req, res) => {
    res.status(404).json({ success: false, message: "Not found" });
  });
  app.use(errorHandler);

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      port = server.address().port;
      resolve();
    });
  });

  const passwordHash = await bcrypt.hash("TestPass1!", 10);
  const user = await User.create({
    email: "sse-test@example.com",
    passwordHash,
    emailVerified: true,
    firstName: "SSE",
    lastName: "Tester",
  });
  userId = user.id;
  token = generateAccessToken({ userId });

  const otherUser = await User.create({
    email: "sse-other@example.com",
    passwordHash,
    emailVerified: true,
  });
  otherUserId = otherUser.id;
  otherToken = generateAccessToken({ userId: otherUserId });
});

afterAll(async () => {
  if (server) {
    await new Promise((r) => {
      const timeout = setTimeout(() => r(), 2000);
      server.close(() => { clearTimeout(timeout); r(); });
    });
  }
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    if (!["users"].includes(key)) {
      await collections[key].deleteMany({});
    }
  }
});

function sseRequest(taskId, queryToken) {
  return new Promise((resolve, reject) => {
    const qs = queryToken ? `?token=${encodeURIComponent(queryToken)}` : "";
    const url = `http://127.0.0.1:${port}/api/events/task/${taskId}${qs}`;
    const req = http.get(url, (res) => resolve({ res, req }));
    req.on("error", reject);
  });
}

function collectSSE(res, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const chunks = [];
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(chunks.join(""));
    };
    const timer = setTimeout(finish, timeoutMs);
    res.on("data", (chunk) => chunks.push(chunk.toString()));
    res.on("end", finish);
    res.on("close", finish);
  });
}

// ═══════════════════════════════════════════════════════════════════
// Authentication / Authorization (returns JSON, not SSE)
// ═══════════════════════════════════════════════════════════════════

describe("GET /api/events/task/:taskId — authentication", () => {
  test("returns 401 when no token is provided", async () => {
    const fakeId = new mongoose.Types.ObjectId().toHexString();
    const res = await request(app).get(`/api/events/task/${fakeId}`);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test("returns 401 when invalid token is provided", async () => {
    const fakeId = new mongoose.Types.ObjectId().toHexString();
    const res = await request(app)
      .get(`/api/events/task/${fakeId}`)
      .query({ token: "invalid-token" });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test("returns 400 when taskId is invalid", async () => {
    const res = await request(app)
      .get("/api/events/task/not-a-valid-id")
      .query({ token });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/invalid/i);
  });

  test("returns 404 when task does not exist", async () => {
    const fakeId = new mongoose.Types.ObjectId().toHexString();
    const res = await request(app)
      .get(`/api/events/task/${fakeId}`)
      .query({ token });
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/not found/i);
  });

  test("returns 404 when user does not own the task", async () => {
    const task = await Task.create({
      title: "Other User Task",
      description: " belongs to main user",
      status: "pending",
      userId,
    });
    const res = await request(app)
      .get(`/api/events/task/${task.id}`)
      .query({ token: otherToken });
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test("authenticates via Authorization header as fallback", async () => {
    const task = await Task.create({
      title: "Header Auth Task",
      status: "pending",
      userId,
    });

    await new Promise((resolve, reject) => {
      const req = http.request(
        `http://127.0.0.1:${port}/api/events/task/${task.id}`,
        { headers: { Authorization: `Bearer ${token}` } },
        (r) => {
          expect(r.statusCode).toBe(200);
          expect(r.headers["content-type"]).toMatch(/text\/event-stream/);
          r.resume();
          r.on("close", resolve);
        }
      );
      req.on("error", reject);
      req.end();
      setTimeout(() => { req.destroy(); resolve(); }, 500);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// SSE Connection & Headers
// ═══════════════════════════════════════════════════════════════════

describe("GET /api/events/task/:taskId — SSE connection", () => {
  let taskId;

  beforeEach(async () => {
    const task = await Task.create({
      title: "SSE Test Task",
      description: "Task for SSE testing",
      status: "pending",
      userId,
    });
    taskId = task.id;
  });

  test("returns 200 with text/event-stream content type", async () => {
    await new Promise((resolve, reject) => {
      const req = http.request(
        `http://127.0.0.1:${port}/api/events/task/${taskId}?token=${encodeURIComponent(token)}`,
        (res) => {
          expect(res.statusCode).toBe(200);
          expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
          expect(res.headers["cache-control"]).toContain("no-cache");
          res.resume();
          res.on("close", resolve);
        }
      );
      req.on("error", reject);
      req.end();
      setTimeout(() => req.destroy(), 500);
    });
  });

  test("sends initial comment line as connection acknowledgment", async () => {
    await new Promise((resolve, reject) => {
      const req = http.request(
        `http://127.0.0.1:${port}/api/events/task/${taskId}?token=${encodeURIComponent(token)}`,
        (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk.toString();
            if (data.includes("\n\n")) {
              expect(data).toContain(":\n\n");
              res.resume();
              res.on("close", resolve);
            }
          });
        }
      );
      req.on("error", reject);
      req.end();
      setTimeout(() => { req.destroy(); resolve(); }, 2000);
    });
  });

  test("delivers activity event via eventBus for matching taskId", async () => {
    const received = await new Promise((resolve, reject) => {
      const chunks = [];
      const req = http.request(
        `http://127.0.0.1:${port}/api/events/task/${taskId}?token=${encodeURIComponent(token)}`,
        (res) => {
          let gotLiveEvent = false;
          res.on("data", (chunk) => {
            const str = chunk.toString();
            chunks.push(str);
            const joined = chunks.join("");
            if (joined.includes("task_updated") && !gotLiveEvent) {
              gotLiveEvent = true;
              res.resume();
              res.on("close", () => resolve(joined));
            }
          });
        }
      );
      req.on("error", reject);
      req.end();

      setTimeout(() => {
        activityService.logActivity(
          userId,
          "task_updated",
          taskId,
          "Task was updated",
          { title: "SSE Test Task" }
        ).catch(() => {});
      }, 200);

      setTimeout(() => { req.destroy(); resolve(chunks.join("")); }, 3000);
    });

    expect(received).toContain("data:");
    expect(received).toContain("task_updated");
    expect(received).toContain("Task was updated");

    const lines = received.split("\n");
    let livePayload = null;
    for (const line of lines) {
      if (line.startsWith("data: ") && line.includes("task_updated")) {
        livePayload = JSON.parse(line.slice(6));
        break;
      }
    }
    expect(livePayload).toBeTruthy();
    expect(livePayload.type).toBe("task_updated");
    expect(livePayload.taskId).toBe(taskId);
    expect(livePayload.message).toBe("Task was updated");
  });

  test("does not deliver events for other taskIds", async () => {
    const otherTask = await Task.create({
      title: "Other Task",
      status: "pending",
      userId,
    });

    const received = await new Promise((resolve, reject) => {
      const chunks = [];
      const req = http.request(
        `http://127.0.0.1:${port}/api/events/task/${taskId}?token=${encodeURIComponent(token)}`,
        (res) => {
          res.on("data", (chunk) => chunks.push(chunk.toString()));
        }
      );
      req.on("error", reject);
      req.end();

      setTimeout(() => {
        activityService.logActivity(
          userId,
          "task_updated",
          otherTask.id,
          "Other task event",
          {}
        ).catch(() => {});
      }, 200);

      setTimeout(() => {
        req.destroy();
        resolve(chunks.join(""));
      }, 1500);
    });

    expect(received).not.toContain("Other task event");
    expect(received).not.toContain(otherTask.id);
  });

  test("sends initial task state event with event: task type", async () => {
    const raw = await new Promise((resolve, reject) => {
      const chunks = [];
      const req = http.request(
        `http://127.0.0.1:${port}/api/events/task/${taskId}?token=${encodeURIComponent(token)}`,
        (res) => {
          let done = false;
          res.on("data", (chunk) => {
            if (done) return;
            chunks.push(chunk.toString());
            const joined = chunks.join("");
            if (joined.includes("task_initial")) {
              done = true;
              res.resume();
              resolve(joined);
            }
          });
        }
      );
      req.on("error", reject);
      req.end();
      setTimeout(() => { req.destroy(); resolve(""); }, 2000);
    });

    expect(raw).toContain("event: task\n");
    expect(raw).toContain("task_initial");

    const lines = raw.split("\n");
    const dataLine = lines.find((l) => l.startsWith("data: ") && l.includes("task_initial"));
    expect(dataLine).toBeTruthy();
    const payload = JSON.parse(dataLine.slice(6));
    expect(payload.type).toBe("task_initial");
    expect(payload.task).toBeDefined();
    expect(payload.task.id).toBe(taskId);
    expect(payload.task.name).toBe("SSE Test Task");
    expect(payload.task.title).toBe("SSE Test Task");
    expect(payload.task.status).toBe("pending");
    expect(payload.task).toHaveProperty("badge");
    expect(payload.task).toHaveProperty("badgeVariant");
  });

  test("live events use proper event type framing", async () => {
    const raw = await new Promise((resolve, reject) => {
      const chunks = [];
      const req = http.request(
        `http://127.0.0.1:${port}/api/events/task/${taskId}?token=${encodeURIComponent(token)}`,
        (res) => {
          let done = false;
          res.on("data", (chunk) => {
            if (done) return;
            chunks.push(chunk.toString());
            const joined = chunks.join("");
            if (joined.includes("execution_started")) {
              done = true;
              res.resume();
              resolve(joined);
            }
          });
        }
      );
      req.on("error", reject);
      req.end();

      setTimeout(() => {
        activityService.logActivity(
          userId,
          "execution_started",
          taskId,
          "Execution started",
          {},
          new mongoose.Types.ObjectId().toHexString()
        ).catch(() => {});
      }, 200);

      setTimeout(() => { req.destroy(); resolve(""); }, 3000);
    });

    expect(raw).toContain("event: execution\n");
    expect(raw).toContain("execution_started");

    const lines = raw.split("\n");
    let eventLine = null;
    let dataLine = null;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === "event: execution") {
        eventLine = lines[i];
        if (i + 1 < lines.length && lines[i + 1].startsWith("data: ")) {
          dataLine = lines[i + 1];
        }
        break;
      }
    }
    expect(eventLine).toBeTruthy();
    expect(dataLine).toBeTruthy();
    const payload = JSON.parse(dataLine.slice(6));
    expect(payload.type).toBe("execution_started");
    expect(payload.taskId).toBe(taskId);
  });

  test("task activity events use event: task type framing", async () => {
    const raw = await new Promise((resolve, reject) => {
      const chunks = [];
      const req = http.request(
        `http://127.0.0.1:${port}/api/events/task/${taskId}?token=${encodeURIComponent(token)}`,
        (res) => {
          let done = false;
          res.on("data", (chunk) => {
            if (done) return;
            chunks.push(chunk.toString());
            const joined = chunks.join("");
            if (joined.includes("task_completed")) {
              done = true;
              res.resume();
              resolve(joined);
            }
          });
        }
      );
      req.on("error", reject);
      req.end();

      setTimeout(() => {
        activityService.logActivity(
          userId,
          "task_completed",
          taskId,
          "Task completed",
          {}
        ).catch(() => {});
      }, 200);

      setTimeout(() => { req.destroy(); resolve(""); }, 3000);
    });

    const lines = raw.split("\n");
    let eventLine = null;
    let dataLine = null;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === "event: task" && i > 0) {
        if (i + 1 < lines.length && lines[i + 1].startsWith("data: ") && lines[i + 1].includes("task_completed")) {
          eventLine = lines[i];
          dataLine = lines[i + 1];
          break;
        }
      }
    }
    expect(eventLine).toBeTruthy();
    expect(dataLine).toBeTruthy();
    const payload = JSON.parse(dataLine.slice(6));
    expect(payload.type).toBe("task_completed");
  });

  test("non-task/non-execution events use event: activity type framing", async () => {
    const raw = await new Promise((resolve, reject) => {
      const chunks = [];
      const req = http.request(
        `http://127.0.0.1:${port}/api/events/task/${taskId}?token=${encodeURIComponent(token)}`,
        (res) => {
          let done = false;
          res.on("data", (chunk) => {
            if (done) return;
            chunks.push(chunk.toString());
            const joined = chunks.join("");
            if (joined.includes("ai_request")) {
              done = true;
              res.resume();
              resolve(joined);
            }
          });
        }
      );
      req.on("error", reject);
      req.end();

      setTimeout(() => {
        activityService.logActivity(
          userId,
          "ai_request",
          taskId,
          "AI request made",
          {}
        ).catch(() => {});
      }, 200);

      setTimeout(() => { req.destroy(); resolve(""); }, 3000);
    });

    const lines = raw.split("\n");
    let eventLine = null;
    let dataLine = null;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === "event: activity") {
        if (i + 1 < lines.length && lines[i + 1].startsWith("data: ") && lines[i + 1].includes("ai_request")) {
          eventLine = lines[i];
          dataLine = lines[i + 1];
          break;
        }
      }
    }
    expect(eventLine).toBeTruthy();
    expect(dataLine).toBeTruthy();
    const payload = JSON.parse(dataLine.slice(6));
    expect(payload.type).toBe("ai_request");
  });

  test("heartbeat is a valid SSE comment format", async () => {
    await new Promise((resolve, reject) => {
      const req = http.request(
        `http://127.0.0.1:${port}/api/events/task/${taskId}?token=${encodeURIComponent(token)}`,
        (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk.toString();
            const parts = data.split("\n\n");
            const comments = parts.filter((p) => p.startsWith(":") && p.trim().length > 0);
            if (comments.length >= 1) {
              expect(comments[0]).toMatch(/^:/);
              res.resume();
              res.on("close", resolve);
            }
          });
        }
      );
      req.on("error", reject);
      req.end();
      setTimeout(() => { req.destroy(); resolve(); }, 2000);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// Event payload format
// ═══════════════════════════════════════════════════════════════════

describe("GET /api/events/task/:taskId — event payload format", () => {
  let taskId;

  beforeEach(async () => {
    const task = await Task.create({
      title: "Payload Test Task",
      status: "pending",
      userId,
    });
    taskId = task.id;
  });

  test("event payload contains all expected fields", async () => {
    const payload = await new Promise((resolve, reject) => {
      let buffer = "";
      let resolved = false;
      let req;
      req = http.request(
        `http://127.0.0.1:${port}/api/events/task/${taskId}?token=${encodeURIComponent(token)}`,
        (res) => {
          res.on("data", (chunk) => {
            if (resolved) return;
            buffer += chunk.toString();
            const lines = buffer.split("\n");
            for (const line of lines) {
              if (line.startsWith("data: ") && line.includes("execution_started")) {
                resolved = true;
                res.destroy();
                try { resolve(JSON.parse(line.slice(6))); } catch (_) { resolve(null); }
                return;
              }
            }
          });
        }
      );
      req.on("error", () => { if (!resolved) resolve(null); });
      req.end();

      setTimeout(() => {
        activityService.logActivity(
          userId,
          "execution_started",
          taskId,
          "Execution started",
          {},
          new mongoose.Types.ObjectId().toHexString()
        ).catch(() => {});
      }, 200);

      setTimeout(() => { if (!resolved) { resolved = true; req.destroy(); resolve(null); } }, 5000);
    });

    expect(payload).toBeTruthy();
    expect(payload).toHaveProperty("type");
    expect(payload).toHaveProperty("message");
    expect(payload).toHaveProperty("taskId");
    expect(payload).toHaveProperty("executionId");
    expect(payload).toHaveProperty("metadata");
    expect(payload).toHaveProperty("timestamp");
    expect(payload.type).toBe("execution_started");
    expect(payload.taskId).toBe(taskId);
  });

  test("event is valid JSON parseable by EventSource onmessage", async () => {
    const raw = await new Promise((resolve, reject) => {
      const chunks = [];
      const req = http.request(
        `http://127.0.0.1:${port}/api/events/task/${taskId}?token=${encodeURIComponent(token)}`,
        (res) => {
          let done = false;
          res.on("data", (chunk) => {
            if (done) return;
            chunks.push(chunk.toString());
            const joined = chunks.join("");
            if (joined.includes("task_created")) {
              done = true;
              res.resume();
              resolve(joined);
            }
          });
        }
      );
      req.on("error", reject);
      req.end();

      setTimeout(() => {
        activityService.logActivity(
          userId,
          "task_created",
          taskId,
          "Created",
          {}
        ).catch(() => {});
      }, 200);

      setTimeout(() => { req.destroy(); resolve(""); }, 3000);
    });

    expect(raw).toBeTruthy();
    const lines = raw.split("\n");
    const dataLine = lines.find((l) => l.startsWith("data: ") && l.includes("task_created"));
    expect(dataLine).toBeTruthy();
    const jsonStr = dataLine.slice(6);
    expect(() => JSON.parse(jsonStr)).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════
// Cleanup / Disconnect
// ═══════════════════════════════════════════════════════════════════

describe("GET /api/events/task/:taskId — cleanup", () => {
  let taskId;

  beforeEach(async () => {
    const task = await Task.create({
      title: "Cleanup Test Task",
      status: "pending",
      userId,
    });
    taskId = task.id;
  });

  test("eventBus listener is removed after client disconnect", async () => {
    const listenersBefore = eventBus._bus.listenerCount("activity");

    await new Promise((resolve, reject) => {
      const req = http.request(
        `http://127.0.0.1:${port}/api/events/task/${taskId}?token=${encodeURIComponent(token)}`,
        (res) => {
          res.resume();
          const midCount = eventBus._bus.listenerCount("activity");
          expect(midCount).toBe(listenersBefore + 1);
          setTimeout(() => {
            req.destroy();
            setTimeout(resolve, 300);
          }, 200);
        }
      );
      req.on("error", reject);
      req.end();
    });

    const listenersAfter = eventBus._bus.listenerCount("activity");
    expect(listenersAfter).toBeLessThanOrEqual(listenersBefore);
  });

  test("no memory leak after multiple connect/disconnect cycles", async () => {
    const listenersBefore = eventBus._bus.listenerCount("activity");

    for (let i = 0; i < 5; i++) {
      await new Promise((resolve, reject) => {
        const req = http.request(
          `http://127.0.0.1:${port}/api/events/task/${taskId}?token=${encodeURIComponent(token)}`,
          (res) => {
            res.resume();
            setTimeout(() => {
              req.destroy();
              setTimeout(resolve, 50);
            }, 100);
          }
        );
        req.on("error", reject);
        req.end();
      });
    }

    const listenersAfter = eventBus._bus.listenerCount("activity");
    expect(listenersAfter).toBe(listenersBefore);
  });
});

// ═══════════════════════════════════════════════════════════════════
// eventBus unit tests
// ═══════════════════════════════════════════════════════════════════

describe("eventBus module", () => {
  test("onActivity registers a listener that receives emitted activities", () => {
    const received = [];
    const handler = (a) => received.push(a);
    eventBus.onActivity(handler);

    const activity = { type: "task_created", taskId: "abc" };
    eventBus.emitActivity(activity);

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(activity);

    eventBus.offActivity(handler);
  });

  test("offActivity removes the listener", () => {
    const received = [];
    const handler = (a) => received.push(a);
    eventBus.onActivity(handler);
    eventBus.offActivity(handler);

    eventBus.emitActivity({ type: "test" });
    expect(received).toHaveLength(0);
  });

  test("multiple listeners each receive the same activity", () => {
    const r1 = [];
    const r2 = [];
    const h1 = (a) => r1.push(a);
    const h2 = (a) => r2.push(a);
    eventBus.onActivity(h1);
    eventBus.onActivity(h2);

    const activity = { type: "task_completed", taskId: "xyz" };
    eventBus.emitActivity(activity);

    expect(r1).toHaveLength(1);
    expect(r2).toHaveLength(1);

    eventBus.offActivity(h1);
    eventBus.offActivity(h2);
  });
});

// ═══════════════════════════════════════════════════════════════════
// activity.service integration with eventBus
// ═══════════════════════════════════════════════════════════════════

describe("activity.service.logActivity → eventBus integration", () => {
  test("logActivity emits to eventBus after persisting to DB", async () => {
    const received = [];
    const handler = (a) => received.push(a);
    eventBus.onActivity(handler);

    const task = await Task.create({
      title: "Integration Test Task",
      status: "pending",
      userId,
    });

    const activity = await activityService.logActivity(
      userId,
      "task_created",
      task.id,
      "Task created in integration test",
      { title: "Integration Test Task" }
    );

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe("task_created");
    expect(received[0].taskId.toString()).toBe(task.id);
    expect(received[0].message).toBe("Task created in integration test");

    eventBus.offActivity(handler);
  });
});
