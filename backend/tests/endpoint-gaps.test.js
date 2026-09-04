process.env.JWT_SECRET = "test-jwt-secret-endpoint-gaps";

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const express = require("express");
const request = require("supertest");
const bcrypt = require("bcrypt");
const errorHandler = require("../src/middleware/error.middleware");

const User = require("../src/db/models/user.model");
const Artifact = require("../src/db/models/artifact.model");
const Approval = require("../src/db/models/approval.model");
const Task = require("../src/db/models/task.model");
const Execution = require("../src/db/models/execution.model");

const artifactRoutes = require("../src/routes/artifact.routes");
const approvalRoutes = require("../src/routes/approval.routes");
const taskRoutes = require("../src/routes/task.routes");
const authRoutes = require("../src/routes/auth.routes");
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
  app.use("/api/tasks", taskRoutes);
  app.use("/api/artifacts", artifactRoutes);
  app.use("/api/approvals", approvalRoutes);
  app.use((req, res) => {
    res.status(404).json({ success: false, message: "Not found" });
  });
  app.use(errorHandler);

  const passwordHash = await bcrypt.hash("TestPass1!", 10);
  const user = await User.create({
    email: "gap-test@example.com",
    passwordHash,
    emailVerified: true,
    firstName: "Test",
    lastName: "User",
  });
  userId = user.id;
  token = generateAccessToken({ userId });

  const otherUser = await User.create({
    email: "gap-other@example.com",
    passwordHash,
    emailVerified: true,
  });
  otherUserId = otherUser.id;
  otherToken = generateAccessToken({ userId: otherUserId });
});

afterAll(async () => {
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

function authHeader(t) {
  return { Authorization: `Bearer ${t}` };
}

// ═══════════════════════════════════════════════════════════════════
// GET /api/artifacts/:id/download
// ═══════════════════════════════════════════════════════════════════

describe("GET /api/artifacts/:id/download", () => {
  let artifactId;
  const sampleContent = {
    report: { title: "Q4 Report", data: [1, 2, 3] },
    generatedAt: "2026-08-26T10:00:00Z",
  };

  beforeEach(async () => {
    const doc = await Artifact.create({
      userId,
      type: "report",
      name: "Q4 Report",
      content: sampleContent,
      metadata: { format: "json", source: "ai" },
    });
    artifactId = doc.id;
  });

  test("authenticated user downloads artifact content as JSON file", async () => {
    const res = await request(app)
      .get(`/api/artifacts/${artifactId}/download`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.headers["content-disposition"]).toContain('attachment; filename="Q4 Report.json"');

    const body = JSON.parse(res.text);
    expect(body).toEqual(sampleContent);
  });

  test("returns 404 for nonexistent artifact", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .get(`/api/artifacts/${fakeId}/download`)
      .set(authHeader(token));

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/not found/i);
  });

  test("returns 400 for invalid artifact ID format", async () => {
    const res = await request(app)
      .get("/api/artifacts/not-a-valid-id/download")
      .set(authHeader(token));

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/invalid/i);
  });

  test("returns 404 when another user tries to download", async () => {
    const res = await request(app)
      .get(`/api/artifacts/${artifactId}/download`)
      .set(authHeader(otherToken));

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test("returns 401 without auth token", async () => {
    const res = await request(app)
      .get(`/api/artifacts/${artifactId}/download`);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test("downloads artifact with empty content object", async () => {
    const doc = await Artifact.create({
      userId,
      type: "document",
      name: "Empty Doc",
      content: { placeholder: true },
      metadata: {},
    });

    const res = await request(app)
      .get(`/api/artifacts/${doc.id}/download`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain("Empty Doc.json");
    const body = JSON.parse(res.text);
    expect(body).toEqual({ placeholder: true });
  });

  test("downloads artifact with string content", async () => {
    const doc = await Artifact.create({
      userId,
      type: "ai_response",
      name: "AI Output",
      content: "Some AI text output here",
      metadata: {},
    });

    const res = await request(app)
      .get(`/api/artifacts/${doc.id}/download`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    const body = JSON.parse(res.text);
    expect(body).toBe("Some AI text output here");
  });

  test("special characters in name are sanitized in filename", async () => {
    const doc = await Artifact.create({
      userId,
      type: "document",
      name: "Report: v2.0 (final)!",
      content: { ok: true },
      metadata: {},
    });

    const res = await request(app)
      .get(`/api/artifacts/${doc.id}/download`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain("attachment; filename=");
    expect(res.headers["content-disposition"]).not.toMatch(/[:(!)]/);
  });

  test("existing GET /:id route still works (not broken by download route)", async () => {
    const res = await request(app)
      .get(`/api/artifacts/${artifactId}`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.artifact.id).toBe(artifactId);
    expect(res.body.data.artifact.name).toBe("Q4 Report");
  });
});

// ═══════════════════════════════════════════════════════════════════
// GET /api/approvals  (list all)
// ═══════════════════════════════════════════════════════════════════

describe("GET /api/approvals  (list all approvals)", () => {
  let taskId;
  let execId1;
  let execId2;
  let approvalId1;
  let approvalId2;
  let approvalId3;

  beforeEach(async () => {
    const task = await Task.create({
      title: "Approval Task",
      description: "Task for approvals",
      priority: "medium",
      status: "pending",
      userId,
      requiresApproval: true,
    });
    taskId = task.id;

    const exec1 = await Execution.create({
      taskId,
      userId,
      status: "pending",
      input: { action: "test" },
    });
    execId1 = exec1.id;

    const exec2 = await Execution.create({
      taskId,
      userId,
      status: "running",
      input: { action: "test2" },
    });
    execId2 = exec2.id;

    // Create 3 approvals: pending, approved, rejected
    const a1 = await Approval.create({
      taskId,
      executionId: execId1,
      userId,
      status: "pending",
    });
    approvalId1 = a1.id;

    const a2 = await Approval.create({
      taskId,
      executionId: execId2,
      userId,
      status: "pending",
    });
    approvalId2 = a2.id;

    // Approve a2
    await Approval.findByIdAndUpdate(
      a2.id,
      { $set: { status: "approved", reason: "Looks good" } }
    );

    // Create rejected
    const exec3 = await Execution.create({
      taskId,
      userId,
      status: "failed",
      input: { action: "test3" },
    });
    const a3 = await Approval.create({
      taskId,
      executionId: exec3.id,
      userId,
      status: "pending",
    });
    await Approval.findByIdAndUpdate(
      a3.id,
      { $set: { status: "rejected", reason: "Not ready" } }
    );
    approvalId3 = a3.id;
  });

  test("returns all approvals for authenticated user (pending + approved + rejected)", async () => {
    const res = await request(app)
      .get("/api/approvals")
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.approvals)).toBe(true);
    expect(res.body.data.approvals.length).toBe(3);

    const statuses = res.body.data.approvals.map((a) => a.status);
    expect(statuses).toContain("pending");
    expect(statuses).toContain("approved");
    expect(statuses).toContain("rejected");
  });

  test("returns empty array when user has no approvals", async () => {
    const res = await request(app)
      .get("/api/approvals")
      .set(authHeader(otherToken));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.approvals).toEqual([]);
  });

  test("returns 401 without auth token", async () => {
    const res = await request(app)
      .get("/api/approvals");

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test("does not return other users approvals", async () => {
    const res = await request(app)
      .get("/api/approvals")
      .set(authHeader(otherToken));

    expect(res.status).toBe(200);
    expect(res.body.data.approvals.length).toBe(0);
  });

  test("GET /pending still works (not broken by new GET /)", async () => {
    const res = await request(app)
      .get("/api/approvals/pending")
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.approvals.length).toBe(1);
    expect(res.body.data.approvals[0].status).toBe("pending");
  });

  test("returns approvals in descending createdAt order", async () => {
    const res = await request(app)
      .get("/api/approvals")
      .set(authHeader(token));

    expect(res.status).toBe(200);
    const dates = res.body.data.approvals.map((a) => new Date(a.createdAt).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]);
    }
  });

  test("each approval object includes expected fields", async () => {
    const res = await request(app)
      .get("/api/approvals")
      .set(authHeader(token));

    expect(res.status).toBe(200);
    const approval = res.body.data.approvals[0];
    expect(approval).toHaveProperty("id");
    expect(approval).toHaveProperty("taskId");
    expect(approval).toHaveProperty("executionId");
    expect(approval).toHaveProperty("status");
    expect(approval).toHaveProperty("createdAt");
    expect(["pending", "approved", "rejected"]).toContain(approval.status);
  });
});
