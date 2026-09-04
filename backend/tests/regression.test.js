const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const express = require("express");
const request = require("supertest");
const errorHandler = require("../src/middleware/error.middleware");

jest.mock("../src/services/ai.service", () => ({
  chatCompletion: jest.fn().mockResolvedValue("Mocked AI execution output"),
  buildImageDataUri: jest.fn().mockImplementation(() =>
    Promise.reject(new Error("buildImageDataUri not expected in this suite"))
  ),
}));

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

  app.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  const statusRoutes = require("../src/routes/status.routes");
  const authRoutes = require("../src/routes/auth.routes");
  const dashboardRoutes = require("../src/routes/dashboard.routes");
  const taskRoutes = require("../src/routes/task.routes");
  const aiRoutes = require("../src/routes/ai.routes");
  const executionRoutes = require("../src/execution/execution.routes");
  const approvalRoutes = require("../src/routes/approval.routes");
  const scheduleRoutes = require("../src/routes/schedule.routes");
  const analyticsRoutes = require("../src/routes/analytics.routes");
  const userRoutes = require("../src/routes/user.routes");
  const activityRoutes = require("../src/routes/activity.routes");
  const artifactRoutes = require("../src/routes/artifact.routes");

  app.use("/api/status", statusRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/tasks", taskRoutes);
  app.use("/api/ai", aiRoutes);
  app.use("/api/executions", executionRoutes);
  app.use("/api/approvals", approvalRoutes);
  app.use("/api/schedules", scheduleRoutes);
  app.use("/api/analytics", analyticsRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/activities", activityRoutes);
  app.use("/api/artifacts", artifactRoutes);

  app.use((req, res) => {
    res.status(404).json({ success: false, message: "Not found" });
  });
  app.use(errorHandler);

  const User = require("../src/db/models/user.model");
  const bcrypt = require("bcrypt");
  const { generateAccessToken } = require("../src/core/security");

  const passwordHash = await bcrypt.hash("Test1234!", 10);
  const user = await User.create({ email: "test@example.com", passwordHash, emailVerified: true });
  userId = user.id;
  token = generateAccessToken({ userId });

  const otherUser = await User.create({ email: "other@example.com", passwordHash, emailVerified: true });
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
    if (key !== "users") {
      await collections[key].deleteMany({});
    }
  }
});

function authHeader(t) {
  return { Authorization: `Bearer ${t || token}` };
}

// ───────────────────── APPROVAL LIFECYCLE ─────────────────────

describe("Approval Lifecycle", () => {
  let taskId, executionId, approvalId;

  beforeEach(async () => {
    const taskRes = await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ title: "Approval Task", requiresApproval: true });
    taskId = taskRes.body.data.task.id;

    const execRes = await request(app)
      .post("/api/executions")
      .set(authHeader())
      .send({ taskId, input: {} });
    executionId = execRes.body.data.execution.id;
  });

  test("full lifecycle: request → pending → approve", async () => {
    // Request approval
    const reqRes = await request(app)
      .post("/api/approvals")
      .set(authHeader())
      .send({ taskId, executionId });
    expect(reqRes.status).toBe(201);
    expect(reqRes.body.data.approval.status).toBe("pending");
    approvalId = reqRes.body.data.approval.id;

    // Check pending list
    const pendRes = await request(app)
      .get("/api/approvals/pending")
      .set(authHeader());
    expect(pendRes.status).toBe(200);
    expect(pendRes.body.data.approvals.length).toBeGreaterThanOrEqual(1);

    // Get single approval
    const getRes = await request(app)
      .get(`/api/approvals/${approvalId}`)
      .set(authHeader());
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.approval.status).toBe("pending");

    // Approve
    const approveRes = await request(app)
      .post(`/api/approvals/${approvalId}/approve`)
      .set(authHeader())
      .send({ reason: "Looks good" });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.approval.status).toBe("approved");
    expect(approveRes.body.data.approval.reason).toBe("Looks good");
  });

  test("full lifecycle: request → pending → reject", async () => {
    const reqRes = await request(app)
      .post("/api/approvals")
      .set(authHeader())
      .send({ taskId, executionId });
    approvalId = reqRes.body.data.approval.id;

    const rejectRes = await request(app)
      .post(`/api/approvals/${approvalId}/reject`)
      .set(authHeader())
      .send({ reason: "Not now" });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.approval.status).toBe("rejected");
    expect(rejectRes.body.data.approval.reason).toBe("Not now");
  });

  test("prevents double approval", async () => {
    const reqRes = await request(app)
      .post("/api/approvals")
      .set(authHeader())
      .send({ taskId, executionId });
    approvalId = reqRes.body.data.approval.id;

    await request(app)
      .post(`/api/approvals/${approvalId}/approve`)
      .set(authHeader())
      .send({});

    const secondApprove = await request(app)
      .post(`/api/approvals/${approvalId}/approve`)
      .set(authHeader())
      .send({});
    expect(secondApprove.status).toBe(409);
    expect(secondApprove.body.message).toMatch(/already approved/);
  });

  test("prevents double rejection", async () => {
    const reqRes = await request(app)
      .post("/api/approvals")
      .set(authHeader())
      .send({ taskId, executionId });
    approvalId = reqRes.body.data.approval.id;

    await request(app)
      .post(`/api/approvals/${approvalId}/reject`)
      .set(authHeader())
      .send({});

    const secondReject = await request(app)
      .post(`/api/approvals/${approvalId}/reject`)
      .set(authHeader())
      .send({});
    expect(secondReject.status).toBe(409);
    expect(secondReject.body.message).toMatch(/already rejected/);
  });

  test("prevents approving a rejected approval", async () => {
    const reqRes = await request(app)
      .post("/api/approvals")
      .set(authHeader())
      .send({ taskId, executionId });
    approvalId = reqRes.body.data.approval.id;

    await request(app)
      .post(`/api/approvals/${approvalId}/reject`)
      .set(authHeader())
      .send({});

    const approveRes = await request(app)
      .post(`/api/approvals/${approvalId}/approve`)
      .set(authHeader())
      .send({});
    expect(approveRes.status).toBe(409);
  });

  test("prevents approving a approved approval", async () => {
    const reqRes = await request(app)
      .post("/api/approvals")
      .set(authHeader())
      .send({ taskId, executionId });
    approvalId = reqRes.body.data.approval.id;

    await request(app)
      .post(`/api/approvals/${approvalId}/approve`)
      .set(authHeader())
      .send({});

    const rejectRes = await request(app)
      .post(`/api/approvals/${approvalId}/reject`)
      .set(authHeader())
      .send({});
    expect(rejectRes.status).toBe(409);
  });

  test("prevents duplicate pending approval for same execution", async () => {
    await request(app)
      .post("/api/approvals")
      .set(authHeader())
      .send({ taskId, executionId });

    const dupe = await request(app)
      .post("/api/approvals")
      .set(authHeader())
      .send({ taskId, executionId });
    expect(dupe.status).toBe(409);
  });

  test("another user may approve when no approver is designated", async () => {
    const reqRes = await request(app)
      .post("/api/approvals")
      .set(authHeader())
      .send({ taskId, executionId });
    approvalId = reqRes.body.data.approval.id;

    const otherApprove = await request(app)
      .post(`/api/approvals/${approvalId}/approve`)
      .set(authHeader(otherToken))
      .send({ reason: "Looks good" });
    expect(otherApprove.status).toBe(200);
    expect(otherApprove.body.data.approval.status).toBe("approved");
  });

  test("requester cannot approve when an approver is designated", async () => {
    const reqRes = await request(app)
      .post("/api/approvals")
      .set(authHeader())
      .send({ taskId, executionId, approverUserId: otherUserId });
    approvalId = reqRes.body.data.approval.id;

    const requesterApprove = await request(app)
      .post(`/api/approvals/${approvalId}/approve`)
      .set(authHeader())
      .send({});
    expect(requesterApprove.status).toBe(403);
  });

  test("designated approver can approve the request", async () => {
    const reqRes = await request(app)
      .post("/api/approvals")
      .set(authHeader())
      .send({ taskId, executionId, approverUserId: otherUserId });
    approvalId = reqRes.body.data.approval.id;

    const approverApprove = await request(app)
      .post(`/api/approvals/${approvalId}/approve`)
      .set(authHeader(otherToken))
      .send({ reason: "Approved by manager" });
    expect(approverApprove.status).toBe(200);
    expect(approverApprove.body.data.approval.status).toBe("approved");

    const requesterApprove = await request(app)
      .post(`/api/approvals/${approvalId}/approve`)
      .set(authHeader())
      .send({});
    expect(requesterApprove.status).toBe(403);

    const secondApprove = await request(app)
      .post(`/api/approvals/${approvalId}/approve`)
      .set(authHeader(otherToken))
      .send({});
    expect(secondApprove.status).toBe(409);
  });

  test("requester cannot designate self as approver", async () => {
    const res = await request(app)
      .post("/api/approvals")
      .set(authHeader())
      .send({ taskId, executionId, approverUserId: userId });
    expect(res.status).toBe(400);
  });

  test("requesting approval for another user's task or execution is rejected", async () => {
    const otherTaskRes = await request(app)
      .post("/api/tasks")
      .set(authHeader(otherToken))
      .send({ title: "Other Users Task" });
    const otherTaskId = otherTaskRes.body.data.task.id;
    const otherExecRes = await request(app)
      .post("/api/executions")
      .set(authHeader(otherToken))
      .send({ taskId: otherTaskId });
    const otherExecId = otherExecRes.body.data.execution.id;

    const res = await request(app)
      .post("/api/approvals")
      .set(authHeader())
      .send({ taskId: otherTaskId, executionId: otherExecId });
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/Task not found/);
  });

  test("rejects invalid IDs", async () => {
    const res = await request(app)
      .post("/api/approvals")
      .set(authHeader())
      .send({ taskId: "invalid", executionId: "invalid" });
    expect(res.status).toBe(400);
  });

  test("rejects missing fields", async () => {
    const res = await request(app)
      .post("/api/approvals")
      .set(authHeader())
      .send({});
    expect(res.status).toBe(400);
  });

  test("rejects invalid approval ID for approve", async () => {
    const res = await request(app)
      .post("/api/approvals/invalid/approve")
      .set(authHeader())
      .send({});
    expect(res.status).toBe(400);
  });

  test("returns 404 for non-existent approval", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .post(`/api/approvals/${fakeId}/approve`)
      .set(authHeader())
      .send({});
    expect(res.status).toBe(404);
  });
});

// ───────────────────── APPROVAL + EXECUTION INTEGRATION ───────

describe("Approval → Execution Integration", () => {
  test("task with requiresApproval blocks execution without approval", async () => {
    const taskRes = await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ title: "Block Test", requiresApproval: true });
    const taskId = taskRes.body.data.task.id;

    const execRes = await request(app)
      .post("/api/executions")
      .set(authHeader())
      .send({ taskId });
    const executionId = execRes.body.data.execution.id;

    const runRes = await request(app)
      .post(`/api/executions/${executionId}/run`)
      .set(authHeader())
      .send({ taskId });
    expect(runRes.status).toBe(403);
    expect(runRes.body.message).toMatch(/requires approval/);
  });

  test("task with requiresApproval allows execution after approval", async () => {
    const taskRes = await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ title: "Allow Test", requiresApproval: true });
    const taskId = taskRes.body.data.task.id;

    const execRes = await request(app)
      .post("/api/executions")
      .set(authHeader())
      .send({ taskId });
    const executionId = execRes.body.data.execution.id;

    const approvalRes = await request(app)
      .post("/api/approvals")
      .set(authHeader())
      .send({ taskId, executionId });
    const approvalId = approvalRes.body.data.approval.id;

    await request(app)
      .post(`/api/approvals/${approvalId}/approve`)
      .set(authHeader())
      .send({});

    const runRes = await request(app)
      .post(`/api/executions/${executionId}/run`)
      .set(authHeader())
      .send({ taskId });
    expect(runRes.status).toBe(200);
  });

  test("task without requiresApproval executes normally", async () => {
    const taskRes = await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ title: "No Approval Task" });
    const taskId = taskRes.body.data.task.id;

    const execRes = await request(app)
      .post("/api/executions")
      .set(authHeader())
      .send({ taskId });
    const executionId = execRes.body.data.execution.id;

    const runRes = await request(app)
      .post(`/api/executions/${executionId}/run`)
      .set(authHeader())
      .send({ taskId });
    expect(runRes.status).toBe(200);
  });
});

// ───────────────────── SCHEDULE CRUD ─────────────────────────

describe("Schedule CRUD", () => {
  let taskId;

  beforeEach(async () => {
    const taskRes = await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ title: "Schedule Task" });
    taskId = taskRes.body.data.task.id;
  });

  test("create schedule", async () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const res = await request(app)
      .post("/api/schedules")
      .set(authHeader())
      .send({ taskId, frequency: "daily", nextRunAt: future });
    expect(res.status).toBe(201);
    expect(res.body.data.schedule.frequency).toBe("daily");
    expect(res.body.data.schedule.enabled).toBe(true);
  });

  test("list schedules", async () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    await request(app)
      .post("/api/schedules")
      .set(authHeader())
      .send({ taskId, frequency: "daily", nextRunAt: future });

    const res = await request(app)
      .get("/api/schedules")
      .set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data.schedules.length).toBeGreaterThanOrEqual(1);
  });

  test("get schedule by id", async () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const createRes = await request(app)
      .post("/api/schedules")
      .set(authHeader())
      .send({ taskId, frequency: "weekly", nextRunAt: future });
    const id = createRes.body.data.schedule.id;

    const res = await request(app)
      .get(`/api/schedules/${id}`)
      .set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data.schedule.id).toBe(id);
  });

  test("toggle schedule off", async () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const createRes = await request(app)
      .post("/api/schedules")
      .set(authHeader())
      .send({ taskId, frequency: "daily", nextRunAt: future });
    const id = createRes.body.data.schedule.id;

    const res = await request(app)
      .post(`/api/schedules/${id}/toggle`)
      .set(authHeader())
      .send({ enabled: false });
    expect(res.status).toBe(200);
    expect(res.body.data.schedule.enabled).toBe(false);
    expect(res.body.message).toMatch(/disabled/);
  });

  test("toggle schedule on", async () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const createRes = await request(app)
      .post("/api/schedules")
      .set(authHeader())
      .send({ taskId, frequency: "daily", nextRunAt: future });
    const id = createRes.body.data.schedule.id;

    await request(app)
      .post(`/api/schedules/${id}/toggle`)
      .set(authHeader())
      .send({ enabled: false });

    const res = await request(app)
      .post(`/api/schedules/${id}/toggle`)
      .set(authHeader())
      .send({ enabled: true });
    expect(res.status).toBe(200);
    expect(res.body.data.schedule.enabled).toBe(true);
    expect(res.body.message).toMatch(/enabled/);
  });

  test("delete schedule", async () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const createRes = await request(app)
      .post("/api/schedules")
      .set(authHeader())
      .send({ taskId, frequency: "once", nextRunAt: future });
    const id = createRes.body.data.schedule.id;

    const res = await request(app)
      .delete(`/api/schedules/${id}`)
      .set(authHeader());
    expect(res.status).toBe(200);

    const getRes = await request(app)
      .get(`/api/schedules/${id}`)
      .set(authHeader());
    expect(getRes.status).toBe(404);
  });

  test("rejects missing taskId", async () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const res = await request(app)
      .post("/api/schedules")
      .set(authHeader())
      .send({ frequency: "daily", nextRunAt: future });
    expect(res.status).toBe(400);
  });

  test("rejects missing nextRunAt", async () => {
    const res = await request(app)
      .post("/api/schedules")
      .set(authHeader())
      .send({ taskId, frequency: "daily" });
    expect(res.status).toBe(400);
  });

  test("rejects invalid frequency", async () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const res = await request(app)
      .post("/api/schedules")
      .set(authHeader())
      .send({ taskId, frequency: "yearly", nextRunAt: future });
    expect(res.status).toBe(400);
  });

  test("rejects invalid schedule ID", async () => {
    const res = await request(app)
      .get("/api/schedules/invalid")
      .set(authHeader());
    expect(res.status).toBe(400);
  });

  test("returns 404 for non-existent schedule", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .get(`/api/schedules/${fakeId}`)
      .set(authHeader());
    expect(res.status).toBe(404);
  });

  test("schedule ownership - other user cannot access", async () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const createRes = await request(app)
      .post("/api/schedules")
      .set(authHeader())
      .send({ taskId, frequency: "daily", nextRunAt: future });
    const id = createRes.body.data.schedule.id;

    const res = await request(app)
      .get(`/api/schedules/${id}`)
      .set(authHeader(otherToken));
    expect(res.status).toBe(404);
  });

  test("validates all frequency types", async () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    for (const freq of ["once", "daily", "weekly", "monthly"]) {
      const res = await request(app)
        .post("/api/schedules")
        .set(authHeader())
        .send({ taskId, frequency: freq, nextRunAt: future });
      expect(res.status).toBe(201);
      expect(res.body.data.schedule.frequency).toBe(freq);
    }
  });
});

// ───────────────────── SCHEDULE WORKER ───────────────────────

describe("Schedule Worker", () => {
  test("processDueSchedules executes due schedule and updates lastRunAt", async () => {
    const scheduleRepo = require("../src/db/repositories/schedule.repository");
    const { processDueSchedules } = require("../src/execution/schedule.worker");
    const Schedule = require("../src/db/models/schedule.model");

    const taskRes = await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ title: "Worker Task" });
    const taskId = taskRes.body.data.task.id;

    const pastDate = new Date(Date.now() - 1000);
    const schedule = await Schedule.create({
      taskId,
      userId,
      frequency: "once",
      nextRunAt: pastDate,
      enabled: true,
    });

    await processDueSchedules();

    const updated = await Schedule.findById(schedule._id);
    expect(updated.enabled).toBe(false);
    expect(updated.lastRunAt).toBeDefined();
  });

  test("processDueSchedules disables non-existent task schedules", async () => {
    const { processDueSchedules } = require("../src/execution/schedule.worker");
    const Schedule = require("../src/db/models/schedule.model");

    const fakeTaskId = new mongoose.Types.ObjectId();
    const schedule = await Schedule.create({
      taskId: fakeTaskId,
      userId,
      frequency: "daily",
      nextRunAt: new Date(Date.now() - 1000),
      enabled: true,
    });

    await processDueSchedules();

    const updated = await Schedule.findById(schedule._id);
    expect(updated.enabled).toBe(false);
  });

  test("processDueSchedules computes next run for recurring schedules", async () => {
    const { processDueSchedules } = require("../src/execution/schedule.worker");
    const Schedule = require("../src/db/models/schedule.model");

    const taskRes = await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ title: "Recurring Task" });
    const taskId = taskRes.body.data.task.id;

    const pastDate = new Date(Date.now() - 1000);
    const schedule = await Schedule.create({
      taskId,
      userId,
      frequency: "daily",
      nextRunAt: pastDate,
      enabled: true,
    });

    await processDueSchedules();

    const updated = await Schedule.findById(schedule._id);
    expect(updated.enabled).toBe(true);
    expect(updated.lastRunAt).toBeDefined();
    expect(updated.nextRunAt.getTime()).toBeGreaterThan(Date.now());
  });

  test("worker start/stop without error", async () => {
    const { start, stop } = require("../src/execution/schedule.worker");
    start();
    stop();
  });
});

// ───────────────────── HEALTH + STATUS + AUTH + TASKS ─────────

describe("Health & Status", () => {
  test("GET /health returns ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  test("GET /api/status returns status", async () => {
    const res = await request(app).get("/api/status");
    expect(res.status).toBe(200);
  });
});

describe("Auth", () => {
  test("POST /api/auth/login returns token", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "test@example.com", password: "Test1234!" });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeDefined();
  });

  test("POST /api/auth/login rejects wrong password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "test@example.com", password: "Wrong" });
    expect(res.status).toBe(401);
  });
});

describe("Tasks", () => {
  test("POST /api/tasks creates task", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ title: "Test Task", description: "Desc", priority: "high" });
    expect(res.status).toBe(201);
    expect(res.body.data.task.title).toBe("Test Task");
  });

  test("POST /api/tasks requires auth", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .send({ title: "Test" });
    expect(res.status).toBe(401);
  });

  test("POST /api/tasks rejects empty title", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ title: "" });
    expect(res.status).toBe(400);
  });

  test("POST /api/tasks with requiresApproval", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ title: "Approval Task", requiresApproval: true });
    expect(res.status).toBe(201);
    expect(res.body.data.task.requiresApproval).toBe(true);
  });

  test("GET /api/tasks returns tasks", async () => {
    await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ title: "Task 1" });

    const res = await request(app)
      .get("/api/tasks")
      .set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data.tasks.length).toBeGreaterThan(0);
  });

  test("GET /api/tasks/:id returns task", async () => {
    const createRes = await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ title: "Get Task" });
    const id = createRes.body.data.task.id;

    const res = await request(app)
      .get(`/api/tasks/${id}`)
      .set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data.task.id).toBe(id);
  });

  test("PATCH /api/tasks/:id updates task", async () => {
    const createRes = await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ title: "Update Task" });
    const id = createRes.body.data.task.id;

    const res = await request(app)
      .patch(`/api/tasks/${id}`)
      .set(authHeader())
      .send({ title: "Updated" });
    expect(res.status).toBe(200);
    expect(res.body.data.task.title).toBe("Updated");
  });

  test("DELETE /api/tasks/:id deletes task", async () => {
    const createRes = await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ title: "Delete Task" });
    const id = createRes.body.data.task.id;

    const res = await request(app)
      .delete(`/api/tasks/${id}`)
      .set(authHeader());
    expect(res.status).toBe(200);
  });
});

// ───────────────────── EXECUTIONS ────────────────────────────

describe("Executions", () => {
  let execTaskId;

  beforeEach(async () => {
    const createRes = await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ title: "Exec Task" });
    execTaskId = createRes.body.data.task.id;
  });

  test("POST /api/executions creates execution", async () => {
    const res = await request(app)
      .post("/api/executions")
      .set(authHeader())
      .send({ taskId: execTaskId, input: { key: "value" } });
    expect(res.status).toBe(201);
    expect(res.body.data.execution).toBeDefined();
  });

  test("POST /api/executions requires taskId", async () => {
    const res = await request(app)
      .post("/api/executions")
      .set(authHeader())
      .send({});
    expect(res.status).toBe(400);
  });

  test("GET /api/executions returns executions", async () => {
    const res = await request(app)
      .get("/api/executions")
      .set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data.executions).toBeDefined();
  });

  test("POST /api/executions/:id/run executes task", async () => {
    const createRes = await request(app)
      .post("/api/executions")
      .set(authHeader())
      .send({ taskId: execTaskId });
    const execId = createRes.body.data.execution.id;

    const runRes = await request(app)
      .post(`/api/executions/${execId}/run`)
      .set(authHeader())
      .send({ taskId: execTaskId });
    expect(runRes.status).toBe(200);
  });

  test("POST /api/executions/:id/cancel cancels execution", async () => {
    const createRes = await request(app)
      .post("/api/executions")
      .set(authHeader())
      .send({ taskId: execTaskId });
    const execId = createRes.body.data.execution.id;

    const cancelRes = await request(app)
      .post(`/api/executions/${execId}/cancel`)
      .set(authHeader());
    expect(cancelRes.status).toBe(200);
  });
});

// ───────────────────── ACTIVITIES + ARTIFACTS ────────────────

describe("Activities", () => {
  test("GET /api/activities requires auth", async () => {
    const res = await request(app).get("/api/activities");
    expect(res.status).toBe(401);
  });

  test("GET /api/activities returns empty list", async () => {
    const res = await request(app)
      .get("/api/activities")
      .set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data.activities).toEqual([]);
  });
});

describe("Artifacts", () => {
  test("POST /api/artifacts creates artifact", async () => {
    const res = await request(app)
      .post("/api/artifacts")
      .set(authHeader())
      .send({ type: "document", name: "Test Doc" });
    expect(res.status).toBe(201);
  });

  test("GET /api/artifacts returns artifacts", async () => {
    const res = await request(app)
      .get("/api/artifacts")
      .set(authHeader());
    expect(res.status).toBe(200);
  });
});

// ───────────────────── ANALYTICS + USERS ─────────────────────

describe("Analytics", () => {
  test("GET /api/analytics returns analytics", async () => {
    const res = await request(app)
      .get("/api/analytics")
      .set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data.taskStats).toBeDefined();
    expect(res.body.data.executionStats).toBeDefined();
    expect(res.body.data.activityStats).toBeDefined();
  });
});

describe("Users", () => {
  test("GET /api/users/profile returns profile", async () => {
    const res = await request(app)
      .get("/api/users/profile")
      .set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data.user).toBeDefined();
  });
});

// ───────────────────── SOFT DELETE ──────────────────────────────

describe("Soft Delete Account", () => {
  let deleteUserId, deleteUserToken, deleteEmail;

  beforeEach(async () => {
    const User = require("../src/db/models/user.model");
    const bcrypt = require("bcrypt");
    const { generateAccessToken } = require("../src/core/security");

    deleteEmail = `softdelete-${Date.now()}@example.com`;
    const passwordHash = await bcrypt.hash("Delete123!", 10);
    const user = await User.create({ email: deleteEmail, passwordHash, emailVerified: true });
    deleteUserId = user.id;
    deleteUserToken = generateAccessToken({ userId: deleteUserId });
  });

  test("DELETE /api/users/account marks user as deleted", async () => {
    const res = await request(app)
      .delete("/api/users/account")
      .set({ Authorization: `Bearer ${deleteUserToken}` });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Account deleted");

    const User = require("../src/db/models/user.model");
    const user = await User.findById(deleteUserId);
    expect(user).not.toBeNull();
    expect(user.isDeleted).toBe(true);
    expect(user.deletedAt).toBeDefined();
  });

  test("user record still exists in MongoDB after deletion", async () => {
    await request(app)
      .delete("/api/users/account")
      .set({ Authorization: `Bearer ${deleteUserToken}` });

    const User = require("../src/db/models/user.model");
    const user = await User.findById(deleteUserId);
    expect(user).not.toBeNull();
    expect(user.email).toBe(deleteEmail);
    expect(user.passwordHash).toBeDefined();
  });

  test("related historical data still exists after deletion", async () => {
    const taskRes = await request(app)
      .post("/api/tasks")
      .set({ Authorization: `Bearer ${deleteUserToken}` })
      .send({ title: "My Task" });
    const taskId = taskRes.body.data.task.id;

    await request(app)
      .delete("/api/users/account")
      .set({ Authorization: `Bearer ${deleteUserToken}` });

    const Task = require("../src/db/models/task.model");
    const task = await Task.findById(taskId);
    expect(task).not.toBeNull();
    expect(task.title).toBe("My Task");
  });

  test("deleted user cannot login", async () => {
    await request(app)
      .delete("/api/users/account")
      .set({ Authorization: `Bearer ${deleteUserToken}` });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: deleteEmail, password: "Delete123!" });
    expect(res.status).toBe(401);
  });

  test("deleted user cannot access protected APIs", async () => {
    await request(app)
      .delete("/api/users/account")
      .set({ Authorization: `Bearer ${deleteUserToken}` });

    const res = await request(app)
      .get("/api/users/profile")
      .set({ Authorization: `Bearer ${deleteUserToken}` });
    expect(res.status).toBe(404);
  });

  test("deleted user cannot update profile", async () => {
    await request(app)
      .delete("/api/users/account")
      .set({ Authorization: `Bearer ${deleteUserToken}` });

    const res = await request(app)
      .put("/api/users/profile")
      .set({ Authorization: `Bearer ${deleteUserToken}` })
      .send({ email: `new-${Date.now()}@example.com` });
    expect(res.status).toBe(404);
  });

  test("active users continue working normally after deletion", async () => {
    await request(app)
      .delete("/api/users/account")
      .set({ Authorization: `Bearer ${deleteUserToken}` });

    const res = await request(app)
      .get("/api/users/profile")
      .set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe("test@example.com");
  });

  test("same email cannot be re-registered due to existing record", async () => {
    await request(app)
      .delete("/api/users/account")
      .set({ Authorization: `Bearer ${deleteUserToken}` });

    const registerRes = await request(app)
      .post("/api/auth/register")
      .send({ email: deleteEmail, password: "NewPass123!" });
    expect(registerRes.status).toBe(409);
  });
});
