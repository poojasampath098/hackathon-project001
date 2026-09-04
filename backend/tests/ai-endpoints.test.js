process.env.JWT_SECRET = "test-jwt-secret-ai-endpoints";

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const express = require("express");
const request = require("supertest");
const bcrypt = require("bcrypt");
const errorHandler = require("../src/middleware/error.middleware");

jest.mock("../src/services/ai.service");
jest.mock("../src/tools/search.tool");

const aiService = require("../src/services/ai.service");
const searchTool = require("../src/tools/search.tool");

const aiRoutes = require("../src/routes/ai.routes");
const authRoutes = require("../src/routes/auth.routes");
const taskRoutes = require("../src/routes/task.routes");
const { generateAccessToken } = require("../src/core/security");

let mongoServer;
let app;
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
  app.use("/api/ai", aiRoutes);
  app.use("/api/tasks", taskRoutes);
  app.use((req, res) => {
    res.status(404).json({ success: false, message: "Not found" });
  });
  app.use(errorHandler);

  const User = require("../src/db/models/user.model");
  const passwordHash = await bcrypt.hash("TestPass1!", 10);
  const user = await User.create({ email: "ai-test@example.com", passwordHash, emailVerified: true });
  userId = user.id;
  token = generateAccessToken({ userId });

  const otherUser = await User.create({ email: "ai-other@example.com", passwordHash, emailVerified: true });
  otherUserId = otherUser.id;
  otherToken = generateAccessToken({ userId: otherUserId });
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

afterEach(async () => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    if (key !== "users") {
      await collections[key].deleteMany({});
    }
  }
});

function authHeader(t) {
  return { Authorization: `Bearer ${t}` };
}

// ═══════════════════════════════════════════════════════════════════
// POST /api/ai/research
// ═══════════════════════════════════════════════════════════════════

describe("POST /api/ai/research", () => {
  test("authenticated successful research request", async () => {
    searchTool.research.mockResolvedValue("Research findings on quantum computing: ...");

    const res = await request(app)
      .post("/api/ai/research")
      .set(authHeader(token))
      .send({ query: "quantum computing basics" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/research/i);
    expect(res.body.data.query).toBe("quantum computing basics");
    expect(res.body.data.response).toBe("Research findings on quantum computing: ...");
    expect(searchTool.research).toHaveBeenCalledWith("quantum computing basics");
  });

  test("invalid research request - missing query", async () => {
    const res = await request(app)
      .post("/api/ai/research")
      .set(authHeader(token))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/query/i);
  });

  test("invalid research request - empty query", async () => {
    const res = await request(app)
      .post("/api/ai/research")
      .set(authHeader(token))
      .send({ query: "   " });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/empty/i);
  });

  test("invalid research request - query too long", async () => {
    const res = await request(app)
      .post("/api/ai/research")
      .set(authHeader(token))
      .send({ query: "x".repeat(5001) });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/too long/i);
  });

  test("unauthenticated request rejected", async () => {
    const res = await request(app)
      .post("/api/ai/research")
      .send({ query: "test query" });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test("AI/provider failure returns error", async () => {
    searchTool.research.mockRejectedValue(new Error("Research service is currently unavailable."));

    const res = await request(app)
      .post("/api/ai/research")
      .set(authHeader(token))
      .send({ query: "test topic" });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/unavailable/i);
  });

  test("research tool validation failure (query too short)", async () => {
    searchTool.research.mockImplementation(() => {
      const err = new Error("Query must be at least 2 characters");
      err.statusCode = 400;
      throw err;
    });

    const res = await request(app)
      .post("/api/ai/research")
      .set(authHeader(token))
      .send({ query: "a" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/2 characters/i);
  });
});

// ═══════════════════════════════════════════════════════════════════
// POST /api/ai/generate
// ═══════════════════════════════════════════════════════════════════

describe("POST /api/ai/generate", () => {
  test("authenticated successful generate request", async () => {
    aiService.chatCompletion.mockResolvedValue("Generated content: Here is a detailed summary...");

    const res = await request(app)
      .post("/api/ai/generate")
      .set(authHeader(token))
      .send({ prompt: "Write a summary of AI trends" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/generated/i);
    expect(res.body.data.response).toBe("Generated content: Here is a detailed summary...");
    expect(res.body.data.type).toBe("general");
    expect(aiService.chatCompletion).toHaveBeenCalled();

    const callArgs = aiService.chatCompletion.mock.calls[0][0];
    expect(callArgs[0].role).toBe("system");
    expect(callArgs[1].role).toBe("user");
    expect(callArgs[1].content).toBe("Write a summary of AI trends");
  });

  test("generate with context and type", async () => {
    aiService.chatCompletion.mockResolvedValue("Generated code snippet...");

    const res = await request(app)
      .post("/api/ai/generate")
      .set(authHeader(token))
      .send({
        prompt: "Generate a function",
        context: "Must use async/await",
        type: "code",
      });

    expect(res.status).toBe(200);
    expect(res.body.data.type).toBe("code");
    expect(res.body.data.response).toBe("Generated code snippet...");

    const callArgs = aiService.chatCompletion.mock.calls[0][0];
    expect(callArgs[0].content).toContain("async/await");
    expect(callArgs[0].content).toContain("code");
  });

  test("invalid generate request - missing prompt", async () => {
    const res = await request(app)
      .post("/api/ai/generate")
      .set(authHeader(token))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/prompt/i);
  });

  test("invalid generate request - empty prompt", async () => {
    const res = await request(app)
      .post("/api/ai/generate")
      .set(authHeader(token))
      .send({ prompt: "   " });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/empty/i);
  });

  test("invalid generate request - prompt too long", async () => {
    const res = await request(app)
      .post("/api/ai/generate")
      .set(authHeader(token))
      .send({ prompt: "x".repeat(10001) });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/too long/i);
  });

  test("unauthenticated request rejected", async () => {
    const res = await request(app)
      .post("/api/ai/generate")
      .send({ prompt: "test" });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test("AI/provider failure returns error", async () => {
    aiService.chatCompletion.mockRejectedValue(new Error("AI service configuration error"));

    const res = await request(app)
      .post("/api/ai/generate")
      .set(authHeader(token))
      .send({ prompt: "Write something" });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  test("context too long returns 400", async () => {
    const res = await request(app)
      .post("/api/ai/generate")
      .set(authHeader(token))
      .send({ prompt: "test", context: "x".repeat(2001) });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/context/i);
  });
});

// ═══════════════════════════════════════════════════════════════════
// POST /api/ai/analyze/:taskId
// ═══════════════════════════════════════════════════════════════════

describe("POST /api/ai/analyze/:taskId", () => {
  let taskId;

  beforeEach(async () => {
    const Task = require("../src/db/models/task.model");
    const task = await Task.create({
      title: "Test Task for Analysis",
      description: "A test task with description",
      priority: "high",
      status: "pending",
      userId,
      requiresApproval: true,
      agent: "TestAgent",
      scheduledTime: "10:00 AM",
      scheduleType: "once",
    });
    taskId = task.id;
  });

  test("authenticated successful task analysis", async () => {
    aiService.chatCompletion.mockResolvedValue("Task Analysis: The task has high priority and requires approval...");

    const res = await request(app)
      .post(`/api/ai/analyze/${taskId}`)
      .set(authHeader(token))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/analysis/i);
    expect(res.body.data.response).toContain("Task Analysis");
    expect(res.body.data.task.id).toBe(taskId);
    expect(res.body.data.task.title).toBe("Test Task for Analysis");
    expect(res.body.data.task.status).toBe("pending");
    expect(res.body.data.task.priority).toBe("high");
    expect(res.body.data.task.scheduleType).toBe("once");

    const callArgs = aiService.chatCompletion.mock.calls[0][0];
    expect(callArgs[1].content).toContain("Test Task for Analysis");
    expect(callArgs[1].content).toContain("pending");
    expect(callArgs[1].content).toContain("high");
  });

  test("analyze with focus parameter", async () => {
    aiService.chatCompletion.mockResolvedValue("Focused analysis on security aspects...");

    const res = await request(app)
      .post(`/api/ai/analyze/${taskId}`)
      .set(authHeader(token))
      .send({ focus: "security risks" });

    expect(res.status).toBe(200);
    expect(res.body.data.response).toContain("Focused analysis");

    const callArgs = aiService.chatCompletion.mock.calls[0][0];
    expect(callArgs[1].content).toContain("security risks");
  });

  test("invalid taskId format", async () => {
    const res = await request(app)
      .post("/api/ai/analyze/not-a-valid-id")
      .set(authHeader(token))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/invalid/i);
  });

  test("task not found", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .post(`/api/ai/analyze/${fakeId}`)
      .set(authHeader(token))
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/not found/i);
  });

  test("unauthorized task access (other user's task)", async () => {
    const res = await request(app)
      .post(`/api/ai/analyze/${taskId}`)
      .set(authHeader(otherToken))
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/not found/i);
  });

  test("unauthenticated request rejected", async () => {
    const res = await request(app)
      .post(`/api/ai/analyze/${taskId}`)
      .send({});

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test("AI/provider failure during analysis", async () => {
    aiService.chatCompletion.mockRejectedValue(new Error("AI service request timed out"));

    const res = await request(app)
      .post(`/api/ai/analyze/${taskId}`)
      .set(authHeader(token))
      .send({});

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  test("focus too long returns 400", async () => {
    const res = await request(app)
      .post(`/api/ai/analyze/${taskId}`)
      .set(authHeader(token))
      .send({ focus: "x".repeat(2001) });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/focus/i);
  });
});
