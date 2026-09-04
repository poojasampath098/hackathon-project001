const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const express = require("express");
const request = require("supertest");
const bcrypt = require("bcrypt");
const errorHandler = require("../src/middleware/error.middleware");
const { generateAccessToken } = require("../src/core/security");

let mongoServer;
let app;
let userId;
let token;

let processDueSchedules;
let poll;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);

  app = express();
  app.use(express.json());

  const authRoutes = require("../src/routes/auth.routes");
  const taskRoutes = require("../src/routes/task.routes");
  const executionRoutes = require("../src/execution/execution.routes");
  const approvalRoutes = require("../src/routes/approval.routes");

  app.use("/api/auth", authRoutes);
  app.use("/api/tasks", taskRoutes);
  app.use("/api/executions", executionRoutes);
  app.use("/api/approvals", approvalRoutes);

  app.use((req, res) => {
    res.status(404).json({ success: false, message: "Not found" });
  });
  app.use(errorHandler);

  const User = require("../src/db/models/user.model");
  const passwordHash = await bcrypt.hash("Test1234!", 10);
  const user = await User.create({
    email: "approval-flow@example.com",
    passwordHash,
    emailVerified: true,
  });
  userId = user.id;
  token = generateAccessToken({ userId });

  processDueSchedules = require("../src/execution/schedule.worker").processDueSchedules;
  poll = require("../src/execution/task.worker").poll;
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

async function createRequiresApprovalTask() {
  const res = await request(app)
    .post("/api/tasks")
    .set(authHeader())
    .send({ title: "Scheduled Approval Task", requiresApproval: true });
  expect(res.status).toBe(201);
  return res.body.data.task;
}

function createDueSchedule(taskId, frequency = "once") {
  const Schedule = require("../src/db/models/schedule.model");
  return Schedule.create({
    taskId,
    userId,
    frequency,
    nextRunAt: new Date(Date.now() - 1000),
    enabled: true,
  });
}

describe("Approval workflow (scheduled executions)", () => {
  test("scheduled requiresApproval task auto-creates a pending approval and executes only after approval", async () => {
    const task = await createRequiresApprovalTask();
    await createDueSchedule(task.id);

    await processDueSchedules();

    const Execution = require("../src/db/models/execution.model");
    const Approval = require("../src/db/models/approval.model");
    const Schedule = require("../src/db/models/schedule.model");

    const executions = await Execution.find({ taskId: task.id, userId });
    expect(executions).toHaveLength(1);
    expect(executions[0].status).toBe("pending");

    const approvals = await Approval.find({ taskId: task.id, userId });
    expect(approvals).toHaveLength(1);
    expect(String(approvals[0].executionId)).toBe(String(executions[0]._id));
    expect(approvals[0].status).toBe("pending");
    expect(String(approvals[0].userId)).toBe(String(userId));

    const schedule = await Schedule.findOne({ taskId: task.id });
    expect(schedule.enabled).toBe(false);

    await poll();
    expect((await Execution.findOne({ taskId: task.id })).status).toBe("pending");

    const approveRes = await request(app)
      .post(`/api/approvals/${approvals[0].id}/approve`)
      .set(authHeader())
      .send({ reason: "Looks good" });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.approval.status).toBe("approved");

    await poll();

    const done = await Execution.findOne({ taskId: task.id });
    expect(done.status).toBe("completed");
    const Task = require("../src/db/models/task.model");
    expect((await Task.findById(task.id)).status).toBe("completed");
  });

  test("scheduled requiresApproval task that is rejected never executes", async () => {
    const task = await createRequiresApprovalTask();
    await createDueSchedule(task.id);

    await processDueSchedules();

    const Execution = require("../src/db/models/execution.model");
    const Approval = require("../src/db/models/approval.model");

    const approval = await Approval.findOne({ taskId: task.id });
    expect(approval.status).toBe("pending");

    const rejectRes = await request(app)
      .post(`/api/approvals/${approval.id}/reject`)
      .set(authHeader())
      .send({ reason: "Not now" });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.approval.status).toBe("rejected");

    await poll();

    const blocked = await Execution.findOne({ taskId: task.id });
    expect(blocked.status).toBe("failed");
    expect(blocked.error).toMatch(/requires.*approval/i);

    await poll();
    expect((await Execution.findOne({ taskId: task.id })).status).toBe("failed");
  });

  test("no duplicate executions or approvals while awaiting a decision", async () => {
    const task = await createRequiresApprovalTask();
    const schedule = await createDueSchedule(task.id, "daily");

    await processDueSchedules();

    const Execution = require("../src/db/models/execution.model");
    const Approval = require("../src/db/models/approval.model");
    const Schedule = require("../src/db/models/schedule.model");

    expect(await Execution.countDocuments({ taskId: task.id })).toBe(1);
    expect(await Approval.countDocuments({ taskId: task.id })).toBe(1);

    await Schedule.updateOne(
      { _id: schedule._id },
      { $set: { nextRunAt: new Date(Date.now() - 1000) } }
    );

    await processDueSchedules();

    expect(await Execution.countDocuments({ taskId: task.id })).toBe(1);
    expect(await Approval.countDocuments({ taskId: task.id })).toBe(1);
  });

  test("scheduled task without requiresApproval executes without any approval", async () => {
    const taskRes = await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ title: "Plain Scheduled Task" });
    const task = taskRes.body.data.task;
    await createDueSchedule(task.id);

    await processDueSchedules();

    const Execution = require("../src/db/models/execution.model");
    const done = await Execution.findOne({ taskId: task.id });
    expect(done.status).toBe("completed");
    const Approval = require("../src/db/models/approval.model");
    expect(await Approval.countDocuments({ taskId: task.id })).toBe(0);
  });

  test("pending approvals list and dashboard count track approval-required tasks only", async () => {
    const Dashboard = require("../src/services/dashboard.service");
    const Execution = require("../src/db/models/execution.model");
    const Approval = require("../src/db/models/approval.model");

    expect((await Dashboard.getSummary(userId)).pendingApprovals).toBe(0);

    const task = await createRequiresApprovalTask();
    await createDueSchedule(task.id);
    await processDueSchedules();

    const pendingRes = await request(app).get("/api/approvals/pending").set(authHeader());
    expect(pendingRes.status).toBe(200);
    expect(
      pendingRes.body.data.approvals.some((a) => String(a.taskId) === String(task.id))
    ).toBe(true);
    expect((await Dashboard.getSummary(userId)).pendingApprovals).toBe(1);

    const directRes = await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ title: "Direct Exec Task", requiresApproval: false });
    expect(directRes.status).toBe(201);
    const directTaskId = directRes.body.data.task.id;
    await createDueSchedule(directTaskId);
    await processDueSchedules();

    expect((await Execution.findOne({ taskId: directTaskId })).status).toBe("completed");
    expect(await Approval.countDocuments({ taskId: directTaskId })).toBe(0);

    const pendingRes2 = await request(app).get("/api/approvals/pending").set(authHeader());
    expect(
      pendingRes2.body.data.approvals.some((a) => String(a.taskId) === String(directTaskId))
    ).toBe(false);

    const summaryAfter = await Dashboard.getSummary(userId);
    expect(summaryAfter.pendingApprovals).toBe(1);
  });

  test("approving a pending approval clears the dashboard pending-approvals count", async () => {
    const Dashboard = require("../src/services/dashboard.service");
    const task = await createRequiresApprovalTask();
    await createDueSchedule(task.id);
    await processDueSchedules();

    const Approval = require("../src/db/models/approval.model");
    const approval = await Approval.findOne({ taskId: task.id });
    expect((await Dashboard.getSummary(userId)).pendingApprovals).toBe(1);

    await request(app)
      .post(`/api/approvals/${approval.id}/approve`)
      .set(authHeader())
      .send({ reason: "OK" });

    expect((await Dashboard.getSummary(userId)).pendingApprovals).toBe(0);
  });

  test("approved execution is not starved by an older still-pending approval in the worker queue", async () => {
    const Execution = require("../src/db/models/execution.model");
    const Approval = require("../src/db/models/approval.model");

    const taskA = await createRequiresApprovalTask();
    await createDueSchedule(taskA.id);
    await processDueSchedules();

    const taskB = await createRequiresApprovalTask();
    await createDueSchedule(taskB.id);
    await processDueSchedules();

    const approvalB = await Approval.findOne({ taskId: taskB.id });
    expect(approvalB.status).toBe("pending");

    await request(app)
      .post(`/api/approvals/${approvalB.id}/approve`)
      .set(authHeader())
      .send({ reason: "Go" });
    expect((await Approval.findOne({ taskId: taskB.id })).status).toBe("approved");

    await poll();

    expect((await Execution.findOne({ taskId: taskB.id })).status).toBe("completed");
    expect((await Execution.findOne({ taskId: taskA.id })).status).toBe("pending");

    await poll();
    expect((await Execution.findOne({ taskId: taskA.id })).status).toBe("pending");
  });

  test("manual execution start does not auto-create an approval (API contract preserved)", async () => {
    const task = await createRequiresApprovalTask();

    const execRes = await request(app)
      .post("/api/executions")
      .set(authHeader())
      .send({ taskId: task.id });
    expect(execRes.status).toBe(201);
    const executionId = execRes.body.data.execution.id;

    const Approval = require("../src/db/models/approval.model");
    expect(
      await Approval.countDocuments({ executionId, userId })
    ).toBe(0);

    const approvalRes = await request(app)
      .post("/api/approvals")
      .set(authHeader())
      .send({ taskId: task.id, executionId });
    expect(approvalRes.status).toBe(201);
    expect(approvalRes.body.data.approval.status).toBe("pending");
  });
});