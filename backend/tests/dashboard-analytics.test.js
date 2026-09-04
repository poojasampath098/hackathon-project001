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

  const dashboardRoutes = require("../src/routes/dashboard.routes");
  const analyticsRoutes = require("../src/routes/analytics.routes");
  const authRoutes = require("../src/routes/auth.routes");
  const taskRoutes = require("../src/routes/task.routes");
  const executionRoutes = require("../src/execution/execution.routes");
  const approvalRoutes = require("../src/routes/approval.routes");
  const activityRoutes = require("../src/routes/activity.routes");

  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/analytics", analyticsRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/tasks", taskRoutes);
  app.use("/api/executions", executionRoutes);
  app.use("/api/approvals", approvalRoutes);
  app.use("/api/activities", activityRoutes);

  app.use((req, res) => {
    res.status(404).json({ success: false, message: "Not found" });
  });
  app.use(errorHandler);

  const User = require("../src/db/models/user.model");
  const bcrypt = require("bcrypt");
  const { generateAccessToken } = require("../src/core/security");

  const passwordHash = await bcrypt.hash("Test1234!", 10);
  const user = await User.create({ email: "test-dash@example.com", passwordHash, emailVerified: true });
  userId = user.id;
  token = generateAccessToken({ userId });

  const otherUser = await User.create({ email: "other-dash@example.com", passwordHash, emailVerified: true });
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

async function createTask(overrides = {}) {
  const res = await request(app)
    .post("/api/tasks")
    .set(authHeader())
    .send({ title: "Test Task", ...overrides });
  return res.body.data.task;
}

async function createExecution(taskId, overrides = {}) {
  const res = await request(app)
    .post("/api/executions")
    .set(authHeader())
    .send({ taskId, ...overrides });
  return res.body.data.execution;
}

async function runExecution(executionId, taskId) {
  const res = await request(app)
    .post(`/api/executions/${executionId}/run`)
    .set(authHeader())
    .send({ taskId });
  return res;
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD TESTS
// ═══════════════════════════════════════════════════════════════

describe("Dashboard - Empty Database", () => {
  test("GET /api/dashboard/summary returns all zeroed metrics", async () => {
    const res = await request(app)
      .get("/api/dashboard/summary")
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;

    expect(data.totalTasks).toBe(0);
    expect(data.activeTasks).toBe(0);
    expect(data.completedTasks).toBe(0);
    expect(data.failedTasks).toBe(0);
    expect(data.totalExecutions).toBe(0);
    expect(data.successfulExecutions).toBe(0);
    expect(data.failedExecutions).toBe(0);
    expect(data.runningExecutions).toBe(0);
    expect(data.pendingApprovals).toBe(0);
    expect(data.recentActivity).toEqual([]);
    expect(data.taskActivityThisWeek).toHaveLength(7);
    expect(data.trends).toEqual({
      activeTasks: { current: 0, previous: 0 },
      completedTasks: { current: 0, previous: 0 },
      pendingApprovals: { current: 0, previous: 0 },
      runningExecutions: { current: 0, previous: 0 },
    });
    expect(data.agentSuccessRate.successRate).toBe(0);
  });

  test("dashboard system status has required fields", async () => {
    const res = await request(app)
      .get("/api/dashboard/summary")
      .set(authHeader());

    const sys = res.body.data.systemStatus;
    expect(sys.status).toBe("operational");
    expect(typeof sys.uptime).toBe("number");
    expect(sys.nodeVersion).toBeDefined();
    expect(sys.environment).toBeDefined();
  });

  test("dashboard live executions has system metrics", async () => {
    const res = await request(app)
      .get("/api/dashboard/summary")
      .set(authHeader());

    const live = res.body.data.liveExecutions;
    expect(live.cpu).toBeDefined();
    expect(typeof live.cpu.cores).toBe("number");
    expect(live.memory).toBeDefined();
    expect(typeof live.memory.totalMB).toBe("number");
  });

  test("GET /api/dashboard/summary requires authentication", async () => {
    const res = await request(app).get("/api/dashboard/summary");
    expect(res.status).toBe(401);
  });
});

describe("Dashboard - Populated Database", () => {
  let taskId;

  beforeEach(async () => {
    const task = await createTask({ title: "Dashboard Task", priority: "high" });
    taskId = task.id;
  });

  test("counts total tasks correctly", async () => {
    await createTask({ title: "Second Task" });

    const res = await request(app)
      .get("/api/dashboard/summary")
      .set(authHeader());

    expect(res.body.data.totalTasks).toBe(2);
  });

  test("counts active tasks (pending + in_progress)", async () => {
    const task2 = await createTask({ title: "Active Task" });

    const res = await request(app)
      .get("/api/dashboard/summary")
      .set(authHeader());

    expect(res.body.data.activeTasks).toBe(2);
  });

  test("counts completed tasks", async () => {
    const Task = require("../src/db/models/task.model");
    await Task.create({ title: "Done Task", userId, status: "completed", priority: "medium" });

    const res = await request(app)
      .get("/api/dashboard/summary")
      .set(authHeader());

    expect(res.body.data.completedTasks).toBe(1);
  });

  test("counts failed tasks", async () => {
    const Task = require("../src/db/models/task.model");
    await Task.create({ title: "Failed Task", userId, status: "failed", priority: "low" });

    const res = await request(app)
      .get("/api/dashboard/summary")
      .set(authHeader());

    expect(res.body.data.failedTasks).toBe(1);
  });

  test("counts total executions", async () => {
    await createExecution(taskId);

    const res = await request(app)
      .get("/api/dashboard/summary")
      .set(authHeader());

    expect(res.body.data.totalExecutions).toBe(1);
  });

  test("counts successful executions", async () => {
    const exec = await createExecution(taskId);
    await runExecution(exec.id, taskId);

    const res = await request(app)
      .get("/api/dashboard/summary")
      .set(authHeader());

    expect(res.body.data.successfulExecutions).toBe(1);
    expect(res.body.data.failedExecutions).toBe(0);
  });

  test("counts failed executions", async () => {
    const exec = await createExecution(taskId);
    const Execution = require("../src/db/models/execution.model");
    await Execution.findOneAndUpdate(
      { _id: exec.id, userId },
      { $set: { status: "failed", error: "Test error" } }
    );

    const res = await request(app)
      .get("/api/dashboard/summary")
      .set(authHeader());

    expect(res.body.data.failedExecutions).toBe(1);
    expect(res.body.data.successfulExecutions).toBe(0);
  });

  test("counts pending approvals", async () => {
    const exec = await createExecution(taskId);
    const Approval = require("../src/db/models/approval.model");
    await Approval.create({ taskId, executionId: exec.id, userId, status: "pending" });

    const res = await request(app)
      .get("/api/dashboard/summary")
      .set(authHeader());

    expect(res.body.data.pendingApprovals).toBe(1);
  });

  test("recent activity returns activities", async () => {
    const Activity = require("../src/db/models/activity.model");
    await Activity.create({ userId, type: "task_created", message: "Created task" });
    await Activity.create({ userId, type: "task_completed", message: "Completed task" });

    const res = await request(app)
      .get("/api/dashboard/summary")
      .set(authHeader());

    expect(res.body.data.recentActivity.length).toBeGreaterThanOrEqual(2);
  });

  test("recent activity limited to 10", async () => {
    const Activity = require("../src/db/models/activity.model");
    for (let i = 0; i < 15; i++) {
      await Activity.create({ userId, type: "task_created", message: `Task ${i}` });
    }

    const res = await request(app)
      .get("/api/dashboard/summary")
      .set(authHeader());

    expect(res.body.data.recentActivity).toHaveLength(10);
  });

  test("agent success rate calculates correctly", async () => {
    const exec1 = await createExecution(taskId);
    await runExecution(exec1.id, taskId);

    const task2 = await createTask({ title: "Task 2" });
    const exec2 = await createExecution(task2.id);
    const Execution = require("../src/db/models/execution.model");
    await Execution.findOneAndUpdate(
      { _id: exec2.id, userId },
      { $set: { status: "failed", error: "Test" } }
    );

    const res = await request(app)
      .get("/api/dashboard/summary")
      .set(authHeader());

    const rate = res.body.data.agentSuccessRate;
    expect(rate.success).toBe(1);
    expect(rate.failed).toBe(1);
    expect(rate.successRate).toBe(50);
  });
});

describe("Dashboard - Multi-User Isolation", () => {
  test("users only see their own data", async () => {
    const Task = require("../src/db/models/task.model");
    const Execution = require("../src/db/models/execution.model");

    await Task.create({ title: "User1 Task", userId, status: "pending", priority: "medium" });
    await Task.create({ title: "User2 Task", userId: otherUserId, status: "pending", priority: "medium" });

    const user1Res = await request(app)
      .get("/api/dashboard/summary")
      .set(authHeader());
    const user2Res = await request(app)
      .get("/api/dashboard/summary")
      .set(authHeader(otherToken));

    expect(user1Res.body.data.totalTasks).toBe(1);
    expect(user2Res.body.data.totalTasks).toBe(1);

    expect(user1Res.body.data.recentActivity.length).toBe(0);
    expect(user2Res.body.data.recentActivity.length).toBe(0);
  });

  test("executions are user-scoped", async () => {
    const task1 = await createTask({ title: "T1" });
    await createExecution(task1.id);

    const Task = require("../src/db/models/task.model");
    const otherTask = await Task.create({ title: "Other Task", userId: otherUserId, status: "pending", priority: "medium" });
    const Execution = require("../src/db/models/execution.model");
    await Execution.create({ taskId: otherTask._id, userId: otherUserId, status: "completed" });

    const user1Res = await request(app)
      .get("/api/dashboard/summary")
      .set(authHeader());
    const user2Res = await request(app)
      .get("/api/dashboard/summary")
      .set(authHeader(otherToken));

    expect(user1Res.body.data.totalExecutions).toBe(1);
    expect(user2Res.body.data.totalExecutions).toBe(1);
  });
});

describe("Dashboard - Day-over-Day Trends", () => {
  test("trends current matches flat counts", async () => {
    await createTask({ title: "Active Trend Task" });

    const res = await request(app)
      .get("/api/dashboard/summary")
      .set(authHeader());

    const data = res.body.data;
    expect(data.trends.activeTasks.current).toBe(data.activeTasks);
    expect(data.trends.completedTasks.current).toBe(data.completedTasks);
    expect(data.trends.pendingApprovals.current).toBe(data.pendingApprovals);
    expect(data.trends.runningExecutions.current).toBe(data.runningExecutions);
    expect(data.trends.activeTasks.previous).toBe(0);
  });

  test("active task created yesterday contributes to previous activeTasks", async () => {
    const Task = require("../src/db/models/task.model");
    const oldTask = await createTask({ title: "Yesterday Active" });
    const yesterday = new Date(Date.now() - 86400000);
    await Task.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(oldTask.id) },
      { $set: { createdAt: yesterday, updatedAt: yesterday } }
    );

    const res = await request(app)
      .get("/api/dashboard/summary")
      .set(authHeader());

    const t = res.body.data.trends.activeTasks;
    expect(res.body.data.activeTasks).toBe(1);
    expect(t.current).toBe(1);
    expect(t.previous).toBe(1);
  });

  test("task completed yesterday contributes to previous completedTasks", async () => {
    const Task = require("../src/db/models/task.model");
    const doneTask = await Task.create({ title: "Done Yesterday", userId, status: "completed", priority: "medium" });
    const yesterday = new Date(Date.now() - 86400000);
    await Task.collection.updateOne(
      { _id: doneTask._id },
      { $set: { createdAt: yesterday, updatedAt: yesterday } }
    );

    const res = await request(app)
      .get("/api/dashboard/summary")
      .set(authHeader());

    const t = res.body.data.trends.completedTasks;
    expect(res.body.data.completedTasks).toBe(1);
    expect(t.current).toBe(1);
    expect(t.previous).toBe(1);
  });

  test("approval created yesterday contributes to previous pendingApprovals", async () => {
    const task = await createTask({ title: "Approval Trend Task" });
    const exec = await createExecution(task.id);
    const Approval = require("../src/db/models/approval.model");
    const approval = await Approval.create({ taskId: task.id, executionId: exec.id, userId, status: "pending" });
    const yesterday = new Date(Date.now() - 86400000);
    await Approval.collection.updateOne(
      { _id: approval._id },
      { $set: { createdAt: yesterday, updatedAt: yesterday } }
    );

    const res = await request(app)
      .get("/api/dashboard/summary")
      .set(authHeader());

    const t = res.body.data.trends.pendingApprovals;
    expect(res.body.data.pendingApprovals).toBe(1);
    expect(t.current).toBe(1);
    expect(t.previous).toBe(1);
  });

  test("execution started yesterday contributes to previous runningExecutions", async () => {
    const task = await createTask({ title: "Exec Trend Task" });
    const Execution = require("../src/db/models/execution.model");
    const yesterday = new Date(Date.now() - 86400000);
    await Execution.create({ taskId: task.id, userId, status: "running", startedAt: yesterday });

    const res = await request(app)
      .get("/api/dashboard/summary")
      .set(authHeader());

    const t = res.body.data.trends.runningExecutions;
    expect(res.body.data.runningExecutions).toBe(1);
    expect(t.current).toBe(1);
    expect(t.previous).toBe(1);
  });

  test("records from older windows do not leak into previous values", async () => {
    const Task = require("../src/db/models/task.model");
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000);
    await createTask({ title: "T1" });
    const oldTask = await createTask({ title: "T2" });
    await Task.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(oldTask.id) },
      { $set: { createdAt: threeDaysAgo, updatedAt: threeDaysAgo } }
    );

    const res = await request(app)
      .get("/api/dashboard/summary")
      .set(authHeader());

    expect(res.body.data.activeTasks).toBe(2);
    expect(res.body.data.trends.activeTasks).toEqual({ current: 2, previous: 0 });
  });
});

// ═══════════════════════════════════════════════════════════════
// ANALYTICS TESTS
// ═══════════════════════════════════════════════════════════════

describe("Analytics - Empty Database", () => {
  test("GET /api/analytics returns zeroed stats", async () => {
    const res = await request(app)
      .get("/api/analytics")
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;

    expect(data.taskStats.total).toBe(0);
    expect(data.taskStats.byStatus).toEqual({});
    expect(data.taskStats.byPriority).toEqual({});
    expect(data.taskStats.completionRate).toBe(0);

    expect(data.executionStats.total).toBe(0);
    expect(data.executionStats.byStatus).toEqual({});
    expect(data.executionStats.avgDuration).toBe(0);

    expect(data.activityStats.total).toBe(0);
    expect(data.activityStats.byType).toEqual({});

    expect(data.approvalStats.total).toBe(0);
    expect(data.approvalStats.byStatus).toEqual({});
  });

  test("GET /api/analytics requires authentication", async () => {
    const res = await request(app).get("/api/analytics");
    expect(res.status).toBe(401);
  });
});

describe("Analytics - Populated Database", () => {
  let taskId;

  beforeEach(async () => {
    const task = await createTask({ title: "Analytics Task", priority: "high" });
    taskId = task.id;
  });

  test("task stats by status", async () => {
    const Task = require("../src/db/models/task.model");
    await Task.create({ title: "Completed", userId, status: "completed", priority: "medium" });
    await Task.create({ title: "Failed", userId, status: "failed", priority: "low" });
    await Task.create({ title: "Active", userId, status: "in_progress", priority: "high" });

    const res = await request(app)
      .get("/api/analytics")
      .set(authHeader());

    const ts = res.body.data.taskStats;
    expect(ts.total).toBe(4);
    expect(ts.byStatus.pending).toBe(1);
    expect(ts.byStatus.completed).toBe(1);
    expect(ts.byStatus.failed).toBe(1);
    expect(ts.byStatus.in_progress).toBe(1);
  });

  test("task stats by priority", async () => {
    await createTask({ title: "Low", priority: "low" });
    await createTask({ title: "High", priority: "high" });

    const res = await request(app)
      .get("/api/analytics")
      .set(authHeader());

    const tp = res.body.data.taskStats.byPriority;
    expect(tp.high).toBe(2);
    expect(tp.low).toBe(1);
    expect(tp.medium).toBeUndefined();
  });

  test("task completion rate", async () => {
    const Task = require("../src/db/models/task.model");
    await Task.create({ title: "Done 1", userId, status: "completed", priority: "medium" });
    await Task.create({ title: "Done 2", userId, status: "completed", priority: "medium" });

    const res = await request(app)
      .get("/api/analytics")
      .set(authHeader());

    const ts = res.body.data.taskStats;
    expect(ts.byStatus.completed).toBe(2);
    expect(ts.completionRate).toBeGreaterThanOrEqual(50);
  });

  test("execution stats by status", async () => {
    const exec1 = await createExecution(taskId);
    await runExecution(exec1.id, taskId);

    const task2 = await createTask({ title: "T2" });
    const exec2 = await createExecution(task2.id);
    const Execution = require("../src/db/models/execution.model");
    await Execution.findOneAndUpdate(
      { _id: exec2.id, userId },
      { $set: { status: "failed", error: "err" } }
    );

    const res = await request(app)
      .get("/api/analytics")
      .set(authHeader());

    const es = res.body.data.executionStats;
    expect(es.total).toBe(2);
    expect(es.byStatus.completed).toBe(1);
    expect(es.byStatus.failed).toBe(1);
  });

  test("execution average duration", async () => {
    const Execution = require("../src/db/models/execution.model");
    await Execution.create({ taskId: new mongoose.Types.ObjectId(taskId), userId, status: "completed", duration: 1000 });
    await Execution.create({ taskId: new mongoose.Types.ObjectId(taskId), userId, status: "completed", duration: 3000 });

    const res = await request(app)
      .get("/api/analytics")
      .set(authHeader());

    expect(res.body.data.executionStats.avgDuration).toBe(2000);
  });

  test("activity stats by type", async () => {
    const Activity = require("../src/db/models/activity.model");
    await Activity.create({ userId, type: "task_created", message: "A" });
    await Activity.create({ userId, type: "task_created", message: "B" });
    await Activity.create({ userId, type: "task_completed", message: "C" });

    const res = await request(app)
      .get("/api/analytics")
      .set(authHeader());

    const as = res.body.data.activityStats;
    expect(as.total).toBeGreaterThanOrEqual(3);
    expect(as.byType.task_created).toBeGreaterThanOrEqual(2);
    expect(as.byType.task_completed).toBeGreaterThanOrEqual(1);
  });

  test("approval stats", async () => {
    const exec = await createExecution(taskId);
    const Approval = require("../src/db/models/approval.model");
    await Approval.create({ taskId, executionId: exec.id, userId, status: "pending" });

    const task2 = await createTask({ title: "T2" });
    const exec2 = await createExecution(task2.id);
    await Approval.create({ taskId: task2.id, executionId: exec2.id, userId, status: "approved" });

    const res = await request(app)
      .get("/api/analytics")
      .set(authHeader());

    const aps = res.body.data.approvalStats;
    expect(aps.total).toBe(2);
    expect(aps.byStatus.pending).toBe(1);
    expect(aps.byStatus.approved).toBe(1);
  });

  test("analytics and dashboard are consistent", async () => {
    const Task = require("../src/db/models/task.model");
    const Execution = require("../src/db/models/execution.model");

    await Task.create({ title: "C1", userId, status: "completed", priority: "medium" });
    await Task.create({ title: "C2", userId, status: "completed", priority: "low" });

    const dashRes = await request(app)
      .get("/api/dashboard/summary")
      .set(authHeader());
    const anaRes = await request(app)
      .get("/api/analytics")
      .set(authHeader());

    expect(dashRes.body.data.totalTasks).toBe(anaRes.body.data.taskStats.total);
    expect(dashRes.body.data.completedTasks).toBe(anaRes.body.data.taskStats.byStatus.completed);
  });
});

describe("Analytics - Multi-User Isolation", () => {
  test("users only see their own analytics", async () => {
    const Task = require("../src/db/models/task.model");
    const Activity = require("../src/db/models/activity.model");

    await Task.create({ title: "U1 Task", userId, status: "completed", priority: "high" });
    await Task.create({ title: "U1 Task 2", userId, status: "pending", priority: "medium" });
    await Activity.create({ userId, type: "task_created", message: "U1 activity" });

    await Task.create({ title: "U2 Task", userId: otherUserId, status: "failed", priority: "low" });
    await Activity.create({ userId: otherUserId, type: "task_created", message: "U2 activity" });
    await Activity.create({ userId: otherUserId, type: "task_completed", message: "U2 activity 2" });

    const user1 = await request(app)
      .get("/api/analytics")
      .set(authHeader());
    const user2 = await request(app)
      .get("/api/analytics")
      .set(authHeader(otherToken));

    expect(user1.body.data.taskStats.total).toBe(2);
    expect(user1.body.data.taskStats.byStatus.completed).toBe(1);
    expect(user1.body.data.activityStats.total).toBe(1);

    expect(user2.body.data.taskStats.total).toBe(1);
    expect(user2.body.data.taskStats.byStatus.failed).toBe(1);
    expect(user2.body.data.activityStats.total).toBe(2);
  });

  test("execution stats are user-scoped", async () => {
    const Task = require("../src/db/models/task.model");
    const Execution = require("../src/db/models/execution.model");

    const t1 = await Task.create({ title: "U1T", userId, status: "pending", priority: "medium" });
    await Execution.create({ taskId: t1._id, userId, status: "completed", duration: 500 });
    await Execution.create({ taskId: t1._id, userId, status: "failed", duration: 200 });

    const t2 = await Task.create({ title: "U2T", userId: otherUserId, status: "pending", priority: "medium" });
    await Execution.create({ taskId: t2._id, userId: otherUserId, status: "completed", duration: 1000 });

    const user1 = await request(app)
      .get("/api/analytics")
      .set(authHeader());
    const user2 = await request(app)
      .get("/api/analytics")
      .set(authHeader(otherToken));

    expect(user1.body.data.executionStats.total).toBe(2);
    expect(user1.body.data.executionStats.byStatus.completed).toBe(1);
    expect(user1.body.data.executionStats.byStatus.failed).toBe(1);

    expect(user2.body.data.executionStats.total).toBe(1);
    expect(user2.body.data.executionStats.byStatus.completed).toBe(1);
  });

  test("approval stats are user-scoped", async () => {
    const Task = require("../src/db/models/task.model");
    const Execution = require("../src/db/models/execution.model");
    const Approval = require("../src/db/models/approval.model");

    const t1 = await Task.create({ title: "T1", userId, status: "pending", priority: "medium" });
    const e1 = await Execution.create({ taskId: t1._id, userId, status: "pending" });
    await Approval.create({ taskId: t1._id, executionId: e1._id, userId, status: "pending" });

    const t2 = await Task.create({ title: "T2", userId: otherUserId, status: "pending", priority: "medium" });
    const e2 = await Execution.create({ taskId: t2._id, userId: otherUserId, status: "pending" });
    await Approval.create({ taskId: t2._id, executionId: e2._id, userId: otherUserId, status: "approved" });
    await Approval.create({ taskId: t2._id, executionId: e2._id, userId: otherUserId, status: "rejected" });

    const user1 = await request(app)
      .get("/api/analytics")
      .set(authHeader());
    const user2 = await request(app)
      .get("/api/analytics")
      .set(authHeader(otherToken));

    expect(user1.body.data.approvalStats.total).toBe(1);
    expect(user1.body.data.approvalStats.byStatus.pending).toBe(1);

    expect(user2.body.data.approvalStats.total).toBe(2);
    expect(user2.body.data.approvalStats.byStatus.approved).toBe(1);
    expect(user2.body.data.approvalStats.byStatus.rejected).toBe(1);
  });
});

describe("Analytics - Edge Cases", () => {
  test("handles many task statuses", async () => {
    const Task = require("../src/db/models/task.model");
    const statuses = ["pending", "in_progress", "completed", "failed", "cancelled"];
    for (const status of statuses) {
      await Task.create({ title: `Task ${status}`, userId, status, priority: "medium" });
    }

    const res = await request(app)
      .get("/api/analytics")
      .set(authHeader());

    const ts = res.body.data.taskStats;
    expect(ts.total).toBe(5);
    for (const status of statuses) {
      expect(ts.byStatus[status]).toBe(1);
    }
  });

  test("handles many execution statuses", async () => {
    const Task = require("../src/db/models/task.model");
    const Execution = require("../src/db/models/execution.model");
    const statuses = ["pending", "running", "completed", "failed", "cancelled"];
    const t = await Task.create({ title: "T", userId, status: "pending", priority: "medium" });

    for (const status of statuses) {
      await Execution.create({ taskId: t._id, userId, status });
    }

    const res = await request(app)
      .get("/api/analytics")
      .set(authHeader());

    const es = res.body.data.executionStats;
    expect(es.total).toBe(5);
    for (const status of statuses) {
      expect(es.byStatus[status]).toBe(1);
    }
  });

  test("completion rate of 0% when no completed tasks", async () => {
    const Task = require("../src/db/models/task.model");
    await Task.create({ title: "Pending", userId, status: "pending", priority: "medium" });
    await Task.create({ title: "Failed", userId, status: "failed", priority: "low" });

    const res = await request(app)
      .get("/api/analytics")
      .set(authHeader());

    expect(res.body.data.taskStats.completionRate).toBe(0);
  });

  test("completion rate of 100% when all completed", async () => {
    const Task = require("../src/db/models/task.model");
    await Task.create({ title: "Done1", userId, status: "completed", priority: "medium" });
    await Task.create({ title: "Done2", userId, status: "completed", priority: "high" });

    const res = await request(app)
      .get("/api/analytics")
      .set(authHeader());

    expect(res.body.data.taskStats.completionRate).toBe(100);
  });

  test("avg duration is 0 when no durations", async () => {
    const Task = require("../src/db/models/task.model");
    const Execution = require("../src/db/models/execution.model");
    const t = await Task.create({ title: "T", userId, status: "pending", priority: "medium" });
    await Execution.create({ taskId: t._id, userId, status: "pending" });

    const res = await request(app)
      .get("/api/analytics")
      .set(authHeader());

    expect(res.body.data.executionStats.avgDuration).toBe(0);
  });
});
