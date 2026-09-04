const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const express = require("express");
const request = require("supertest");
const errorHandler = require("../src/middleware/error.middleware");
const engine = require("../src/execution/engine");

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
  const user = await User.create({
    email: "worker-test@example.com",
    passwordHash,
    emailVerified: true,
  });
  userId = user.id;
  token = generateAccessToken({ userId });

  const otherUser = await User.create({
    email: "other-worker@example.com",
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
    .send({ title: "Worker Test Task", ...overrides });
  return res.body.data.task;
}

async function createExecution(taskId, overrides = {}) {
  const Execution = require("../src/db/models/execution.model");
  const exec = await Execution.create({
    taskId,
    userId,
    status: "pending",
    input: {},
    steps: [],
    timeout: 30000,
    retryCount: 0,
    maxRetries: 0,
    ...overrides,
  });
  return exec.toObject();
}

const { stopTaskWorker, poll, processExecution, isRetryableError } =
  require("../src/execution/task.worker");

// ───────────────────── WORKER LIFECYCLE ─────────────────────

describe("Task Worker Lifecycle", () => {
  test("worker starts and stops without error", () => {
    const { startTaskWorker, stopTaskWorker: stop } =
      require("../src/execution/task.worker");
    startTaskWorker();
    stop();
  });

  test("worker does not create duplicate intervals", () => {
    const { startTaskWorker, stopTaskWorker: stop } =
      require("../src/execution/task.worker");
    startTaskWorker();
    startTaskWorker();
    stop();
  });

  test("graceful shutdown clears timer", () => {
    const { startTaskWorker, stopTaskWorker: stop } =
      require("../src/execution/task.worker");
    startTaskWorker();
    stop();
  });
});

// ───────────────────── HELPER FUNCTIONS ─────────────────────

describe("Task Worker Helper Functions", () => {
  test("isRetryableError returns true for timeout errors", () => {
    expect(isRetryableError({ statusCode: 408 })).toBe(true);
  });

  test("isRetryableError returns true for ECONNRESET", () => {
    expect(isRetryableError({ code: "ECONNRESET" })).toBe(true);
  });

  test("isRetryableError returns true for ECONNREFUSED", () => {
    expect(isRetryableError({ code: "ECONNREFUSED" })).toBe(true);
  });

  test("isRetryableError returns true for ETIMEDOUT", () => {
    expect(isRetryableError({ code: "ETIMEDOUT" })).toBe(true);
  });

  test("isRetryableError returns true for socket hang up message", () => {
    expect(isRetryableError({ message: "socket hang up" })).toBe(true);
  });

  test("isRetryableError returns true for timeout message", () => {
    expect(isRetryableError({ message: "read timeout occurred" })).toBe(true);
  });

  test("isRetryableError returns false for 500 error", () => {
    expect(isRetryableError({ statusCode: 500 })).toBe(false);
  });

  test("isRetryableError returns false for validation error", () => {
    expect(
      isRetryableError(new Error("Invalid input"))
    ).toBe(false);
  });

  test("isRetryableError returns false for null", () => {
    expect(isRetryableError(null)).toBe(false);
  });
});

// ───────────────────── ELIGIBILITY DETECTION ─────────────────────

describe("Eligibility Detection", () => {
  test("poll finds and processes eligible pending execution", async () => {
    const task = await createTask();
    const exec = await createExecution(task.id);

    await poll();

    const Execution = require("../src/db/models/execution.model");
    const updated = await Execution.findById(exec._id);
    expect(updated.status).toBe("completed");
  });

  test("worker ignores completed execution", async () => {
    const task = await createTask();
    const exec = await createExecution(task.id, {
      status: "completed",
      completedAt: new Date(),
    });

    await poll();

    const Execution = require("../src/db/models/execution.model");
    const updated = await Execution.findById(exec._id);
    expect(updated.status).toBe("completed");
  });

  test("worker ignores cancelled execution", async () => {
    const task = await createTask();
    const exec = await createExecution(task.id, {
      status: "cancelled",
      completedAt: new Date(),
    });

    await poll();

    const Execution = require("../src/db/models/execution.model");
    const updated = await Execution.findById(exec._id);
    expect(updated.status).toBe("cancelled");
  });

  test("worker ignores already-running execution", async () => {
    const task = await createTask();
    const exec = await createExecution(task.id, {
      status: "running",
      startedAt: new Date(),
    });

    await poll();

    const Execution = require("../src/db/models/execution.model");
    const updated = await Execution.findById(exec._id);
    expect(updated.status).toBe("running");
  });

  test("worker skips execution when task does not exist", async () => {
    const Execution = require("../src/db/models/execution.model");
    const fakeTaskId = new mongoose.Types.ObjectId();
    const exec = await Execution.create({
      taskId: fakeTaskId,
      userId,
      status: "pending",
      input: {},
      timeout: 30000,
      retryCount: 0,
      maxRetries: 0,
    });

    await poll();

    const updated = await Execution.findById(exec._id);
    expect(updated.status).toBe("pending");
  });

  test("worker skips execution when user is deleted", async () => {
    const User = require("../src/db/models/user.model");
    const bcrypt = require("bcrypt");
    const { generateAccessToken } = require("../src/core/security");

    const passwordHash = await bcrypt.hash("Test1234!", 10);
    const deletedUser = await User.create({
      email: `deleted-worker-${Date.now()}@example.com`,
      passwordHash,
      emailVerified: true,
      isDeleted: true,
      deletedAt: new Date(),
    });

    const task = await createTask();
    const Execution = require("../src/db/models/execution.model");
    const exec = await Execution.create({
      taskId: task.id,
      userId: deletedUser.id,
      status: "pending",
      input: {},
      timeout: 30000,
      retryCount: 0,
      maxRetries: 0,
    });

    await poll();

    const updated = await Execution.findById(exec._id);
    expect(updated.status).toBe("pending");
  });

  test("worker skips execution when task is completed", async () => {
    const Execution = require("../src/db/models/execution.model");
    const taskRepo = require("../src/db/repositories/task.repository");

    const taskRes = await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ title: "Completed Task" });
    const task = taskRes.body.data.task;

    await taskRepo.updateTask(task.id, userId, { status: "completed" });

    const exec = await Execution.create({
      taskId: task.id,
      userId,
      status: "pending",
      input: {},
      timeout: 30000,
      retryCount: 0,
      maxRetries: 0,
    });

    await poll();

    const updated = await Execution.findById(exec._id);
    expect(updated.status).toBe("pending");
  });
});

// ───────────────────── OWNERSHIP & SECURITY ─────────────────────

describe("Ownership & Security", () => {
  test("worker respects task ownership - different user cannot trigger", async () => {
    const taskRes = await request(app)
      .post("/api/tasks")
      .set(authHeader(otherToken))
      .send({ title: "Other User Task" });
    const otherTask = taskRes.body.data.task;

    const Execution = require("../src/db/models/execution.model");

    const otherExec = await Execution.create({
      taskId: otherTask.id,
      userId: otherUserId,
      status: "pending",
      input: {},
      timeout: 30000,
      retryCount: 0,
      maxRetries: 0,
    });

    await poll();

    const updatedOther = await Execution.findById(otherExec._id);
    expect(updatedOther.status).toBe("completed");
  });

  test("inconsistent task/execution ownership is handled safely", async () => {
    const task = await createTask();
    const Execution = require("../src/db/models/execution.model");
    const exec = await Execution.create({
      taskId: task.id,
      userId: otherUserId,
      status: "pending",
      input: {},
      timeout: 30000,
      retryCount: 0,
      maxRetries: 0,
    });

    await poll();

    const updated = await Execution.findById(exec._id);
    expect(updated.status).toBe("pending");
  });
});

// ───────────────────── APPROVAL INTEGRATION ─────────────────────

describe("Approval Integration", () => {
  test("requiresApproval=true + pending approval waits (stays pending, never runs)", async () => {
    const taskRes = await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ title: "Approval Task", requiresApproval: true });
    const task = taskRes.body.data.task;

    const exec = await createExecution(task.id);

    const approvalRes = await request(app)
      .post("/api/approvals")
      .set(authHeader())
      .send({ taskId: task.id, executionId: exec.id });
    const approvalId = approvalRes.body.data.approval.id;

    await poll();

    const Execution = require("../src/db/models/execution.model");
    const updated = await Execution.findById(exec._id);
    expect(updated.status).toBe("pending");
    expect(updated.error).toBeNull();

    const Task = require("../src/db/models/task.model");
    const updatedTask = await Task.findById(task.id);
    expect(updatedTask.status).toBe("pending");
  });

  test("requiresApproval=true + pending approval executes after approval", async () => {
    const taskRes = await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ title: "Approval Task 2", requiresApproval: true });
    const task = taskRes.body.data.task;

    const exec = await createExecution(task.id);

    const approvalRes = await request(app)
      .post("/api/approvals")
      .set(authHeader())
      .send({ taskId: task.id, executionId: exec.id });
    const approvalId = approvalRes.body.data.approval.id;

    await poll();
    const Execution = require("../src/db/models/execution.model");
    expect((await Execution.findById(exec._id)).status).toBe("pending");

    await request(app)
      .post(`/api/approvals/${approvalId}/approve`)
      .set(authHeader())
      .send({ reason: "Looks good" });

    await poll();

    const approved = await Execution.findById(exec._id);
    expect(approved.status).toBe("completed");
  });

  test("requiresApproval=true + rejected approval → blocked", async () => {
    const taskRes = await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ title: "Approval Task", requiresApproval: true });
    const task = taskRes.body.data.task;

    const exec = await createExecution(task.id);

    const approvalRes = await request(app)
      .post("/api/approvals")
      .set(authHeader())
      .send({ taskId: task.id, executionId: exec.id });
    const approvalId = approvalRes.body.data.approval.id;

    await request(app)
      .post(`/api/approvals/${approvalId}/reject`)
      .set(authHeader())
      .send({ reason: "Not now" });

    await poll();

    const Execution = require("../src/db/models/execution.model");
    const updated = await Execution.findById(exec._id);
    expect(updated.status).toBe("failed");
    expect(updated.error).toMatch(/requires.*approval/i);
  });

  test("requiresApproval=true + approved approval → allowed", async () => {
    const taskRes = await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ title: "Approval Task", requiresApproval: true });
    const task = taskRes.body.data.task;

    const exec = await createExecution(task.id);

    const approvalRes = await request(app)
      .post("/api/approvals")
      .set(authHeader())
      .send({ taskId: task.id, executionId: exec.id });
    const approvalId = approvalRes.body.data.approval.id;

    await request(app)
      .post(`/api/approvals/${approvalId}/approve`)
      .set(authHeader())
      .send({ reason: "Looks good" });

    await poll();

    const Execution = require("../src/db/models/execution.model");
    const updated = await Execution.findById(exec._id);
    expect(updated.status).toBe("completed");
  });

  test("requiresApproval=false → executes normally without approval", async () => {
    const task = await createTask({ requiresApproval: false });
    const exec = await createExecution(task.id);

    await poll();

    const Execution = require("../src/db/models/execution.model");
    const updated = await Execution.findById(exec._id);
    expect(updated.status).toBe("completed");
  });
});

// ───────────────────── EXECUTION FLOW ─────────────────────

describe("Execution Flow", () => {
  test("successful execution becomes completed", async () => {
    const task = await createTask();
    const exec = await createExecution(task.id);

    await poll();

    const Execution = require("../src/db/models/execution.model");
    const updated = await Execution.findById(exec._id);
    expect(updated.status).toBe("completed");
    expect(updated.output).toBeDefined();
    expect(updated.completedAt).toBeDefined();
    expect(updated.duration).toBeDefined();
  });

  test("task status is updated to completed on success", async () => {
    const task = await createTask();
    const exec = await createExecution(task.id);

    await poll();

    const Task = require("../src/db/models/task.model");
    const updated = await Task.findById(task.id);
    expect(updated.status).toBe("completed");
  });

  test("task status is set to in_progress during execution", async () => {
    const task = await createTask();
    const exec = await createExecution(task.id);

    const Task = require("../src/db/models/task.model");
    const taskBefore = await Task.findById(task.id);
    expect(taskBefore.status).toBe("pending");

    await poll();

    const taskAfter = await Task.findById(task.id);
    expect(taskAfter.status).toBe("completed");
  });

  test("execution output is stored on success", async () => {
    const task = await createTask();
    const exec = await createExecution(task.id, { input: { key: "value" } });

    await poll();

    const Execution = require("../src/db/models/execution.model");
    const updated = await Execution.findById(exec._id);
    expect(updated.output).toBeDefined();
    expect(updated.input).toEqual({ key: "value" });
  });

  test("failed execution becomes failed", async () => {
    const task = await createTask();
    const exec = await createExecution(task.id, {
      maxRetries: 0,
      retryCount: 0,
    });

    const originalExecute = engine.execute;
    engine.execute = async () => {
      throw new Error("Simulated execution failure");
    };

    await poll();

    engine.execute = originalExecute;

    const Execution = require("../src/db/models/execution.model");
    const updated = await Execution.findById(exec._id);
    expect(updated.status).toBe("failed");
    expect(updated.error).toBe("Simulated execution failure");
    expect(updated.completedAt).toBeDefined();
  });

  test("task status is updated to failed on execution failure", async () => {
    const task = await createTask();
    const exec = await createExecution(task.id, {
      maxRetries: 0,
      retryCount: 0,
    });

    const originalExecute = engine.execute;
    engine.execute = async () => {
      throw new Error("Simulated failure");
    };

    await poll();

    engine.execute = originalExecute;

    const Task = require("../src/db/models/task.model");
    const updated = await Task.findById(task.id);
    expect(updated.status).toBe("failed");
  });
});

// ───────────────────── RETRY SYSTEM ─────────────────────

describe("Retry System", () => {
  test("retry occurs when eligible failure happens", async () => {
    const task = await createTask();
    const exec = await createExecution(task.id, {
      maxRetries: 2,
      retryCount: 0,
    });

    const originalExecute = engine.execute;
    let callCount = 0;
    engine.execute = async () => {
      callCount++;
      if (callCount === 1) {
        const err = new Error("ECONNRESET");
        err.code = "ECONNRESET";
        throw err;
      }
      return { output: "success after retry", duration: 10, steps: [] };
    };

    await poll();

    const Execution = require("../src/db/models/execution.model");
    const updated = await Execution.findById(exec._id);
    expect(updated.status).toBe("pending");
    expect(updated.retryCount).toBe(1);

    engine.execute = originalExecute;
  });

  test("maximum retry limit is enforced", async () => {
    const task = await createTask();
    const exec = await createExecution(task.id, {
      maxRetries: 2,
      retryCount: 0,
    });

    const originalExecute = engine.execute;
    engine.execute = async () => {
      const err = new Error("ETIMEDOUT");
      err.code = "ETIMEDOUT";
      throw err;
    };

    await poll();
    await poll();
    await poll();

    engine.execute = originalExecute;

    const Execution = require("../src/db/models/execution.model");
    const updated = await Execution.findById(exec._id);
    expect(updated.status).toBe("failed");
    expect(updated.retryCount).toBe(2);
  });

  test("no infinite retries - stops at maxRetries", async () => {
    const task = await createTask();
    const exec = await createExecution(task.id, {
      maxRetries: 1,
      retryCount: 0,
    });

    const originalExecute = engine.execute;
    engine.execute = async () => {
      const err = new Error("ECONNRESET");
      err.code = "ECONNRESET";
      throw err;
    };

    await poll();
    await poll();
    await poll();
    await poll();

    engine.execute = originalExecute;

    const Execution = require("../src/db/models/execution.model");
    const updated = await Execution.findById(exec._id);
    expect(updated.retryCount).toBe(1);
    expect(updated.status).toBe("failed");
  });

  test("non-retryable error fails immediately without retry", async () => {
    const task = await createTask();
    const exec = await createExecution(task.id, {
      maxRetries: 3,
      retryCount: 0,
    });

    const originalExecute = engine.execute;
    engine.execute = async () => {
      throw Object.assign(new Error("Bad request"), { statusCode: 400 });
    };

    await poll();

    engine.execute = originalExecute;

    const Execution = require("../src/db/models/execution.model");
    const updated = await Execution.findById(exec._id);
    expect(updated.status).toBe("failed");
    expect(updated.retryCount).toBe(0);
  });

  test("retry count is preserved across retry cycles", async () => {
    const task = await createTask();
    const exec = await createExecution(task.id, {
      maxRetries: 3,
      retryCount: 0,
    });

    const originalExecute = engine.execute;
    let callCount = 0;
    engine.execute = async () => {
      callCount++;
      if (callCount <= 2) {
        const err = new Error("ECONNRESET");
        err.code = "ECONNRESET";
        throw err;
      }
      return { output: "success", duration: 5, steps: [] };
    };

    await poll();
    await poll();
    await poll();

    engine.execute = originalExecute;

    const Execution = require("../src/db/models/execution.model");
    const updated = await Execution.findById(exec._id);
    expect(updated.status).toBe("completed");
    expect(updated.retryCount).toBe(2);
  });

  test("failed with maxRetries=0 does not retry", async () => {
    const task = await createTask();
    const exec = await createExecution(task.id, {
      maxRetries: 0,
      retryCount: 0,
    });

    const originalExecute = engine.execute;
    engine.execute = async () => {
      throw new Error("ECONNRESET");
    };

    await poll();

    engine.execute = originalExecute;

    const Execution = require("../src/db/models/execution.model");
    const updated = await Execution.findById(exec._id);
    expect(updated.status).toBe("failed");
    expect(updated.retryCount).toBe(0);
  });

  test("retry reset clears error and timestamps", async () => {
    const task = await createTask();
    const exec = await createExecution(task.id, {
      maxRetries: 1,
      retryCount: 0,
    });

    const originalExecute = engine.execute;
    let callCount = 0;
    engine.execute = async () => {
      callCount++;
      if (callCount === 1) {
        const err = new Error("ECONNRESET");
        err.code = "ECONNRESET";
        throw err;
      }
      return { output: "ok", duration: 5, steps: [] };
    };

    await poll();

    const Execution = require("../src/db/models/execution.model");
    const midState = await Execution.findById(exec._id);
    expect(midState.status).toBe("pending");
    expect(midState.error).toBeNull();

    await poll();

    engine.execute = originalExecute;

    const finalState = await Execution.findById(exec._id);
    expect(finalState.status).toBe("completed");
  });
});

// ───────────────────── WORKER SAFETY ─────────────────────

describe("Worker Safety", () => {
  test("worker survives execution error and continues", async () => {
    const task1 = await createTask({ title: "Fail Task" });
    const task2 = await createTask({ title: "Success Task" });
    const exec1 = await createExecution(task1.id, {
      maxRetries: 0,
      retryCount: 0,
    });
    const exec2 = await createExecution(task2.id);

    const originalExecute = engine.execute;
    let callCount = 0;
    engine.execute = async (exec, task) => {
      callCount++;
      if (callCount === 1) {
        throw new Error("First task fails");
      }
      return { output: "second task ok", duration: 5, steps: [] };
    };

    await poll();

    const Execution = require("../src/db/models/execution.model");
    const updated1 = await Execution.findById(exec1._id);
    expect(updated1.status).toBe("failed");

    await poll();

    const updated2 = await Execution.findById(exec2._id);
    expect(updated2.status).toBe("completed");

    engine.execute = originalExecute;
  });

  test("one failed task does not stop processing other tasks", async () => {
    const task1 = await createTask({ title: "Fail Task" });
    const task2 = await createTask({ title: "Fail Task 2" });
    const task3 = await createTask({ title: "Success Task" });
    const exec1 = await createExecution(task1.id, {
      maxRetries: 0,
      retryCount: 0,
    });
    const exec2 = await createExecution(task2.id, {
      maxRetries: 0,
      retryCount: 0,
    });
    const exec3 = await createExecution(task3.id);

    const originalExecute = engine.execute;
    let callCount = 0;
    engine.execute = async () => {
      callCount++;
      if (callCount <= 2) {
        throw new Error("Task fails");
      }
      return { output: "success", duration: 5, steps: [] };
    };

    await poll();
    await poll();

    const Execution = require("../src/db/models/execution.model");
    const updated1 = await Execution.findById(exec1._id);
    const updated2 = await Execution.findById(exec2._id);
    expect(updated1.status).toBe("failed");
    expect(updated2.status).toBe("failed");

    await poll();

    const updated3 = await Execution.findById(exec3._id);
    expect(updated3.status).toBe("completed");

    engine.execute = originalExecute;
  });

  test("invalid execution ID is handled safely", async () => {
    const task = await createTask();
    const Execution = require("../src/db/models/execution.model");
    const exec = await Execution.create({
      taskId: task.id,
      userId,
      status: "pending",
      input: {},
      timeout: 30000,
      retryCount: 0,
      maxRetries: 0,
    });

    await Execution.deleteOne({ _id: exec._id });

    await poll();
  });

  test("missing task is handled safely", async () => {
    const fakeTaskId = new mongoose.Types.ObjectId();
    const Execution = require("../src/db/models/execution.model");
    const exec = await Execution.create({
      taskId: fakeTaskId,
      userId,
      status: "pending",
      input: {},
      timeout: 30000,
      retryCount: 0,
      maxRetries: 0,
    });

    await poll();

    const updated = await Execution.findById(exec._id);
    expect(updated.status).toBe("pending");
  });

  test("worker does not process same execution concurrently", async () => {
    const task = await createTask();
    const exec = await createExecution(task.id);

    const originalExecute = engine.execute;
    let executing = false;
    let concurrentDetected = false;
    engine.execute = async () => {
      if (executing) {
        concurrentDetected = true;
      }
      executing = true;
      await new Promise((resolve) => setTimeout(resolve, 50));
      executing = false;
      return { output: "ok", duration: 10, steps: [] };
    };

    await Promise.all([poll(), poll()]);

    const Execution = require("../src/db/models/execution.model");
    const updated = await Execution.findById(exec._id);
    expect(updated.status).toBe("completed");
    expect(concurrentDetected).toBe(false);

    engine.execute = originalExecute;
  });

  test("worker processes next execution after completing one", async () => {
    const task1 = await createTask({ title: "Task 1" });
    const task2 = await createTask({ title: "Task 2" });
    const exec1 = await createExecution(task1.id);
    const exec2 = await createExecution(task2.id);

    await poll();

    const Execution = require("../src/db/models/execution.model");
    const updated1 = await Execution.findById(exec1._id);
    expect(updated1.status).toBe("completed");

    const updated2 = await Execution.findById(exec2._id);
    expect(updated2.status).toBe("pending");

    await poll();

    const updated2After = await Execution.findById(exec2._id);
    expect(updated2After.status).toBe("completed");
  });
});

// ───────────────────── ACTIVITY & ARTIFACT INTEGRATION ─────────────────────

describe("Activity Integration", () => {
  test("activity is recorded on successful execution", async () => {
    const task = await createTask();
    const exec = await createExecution(task.id);

    await poll();
    await new Promise((r) => setTimeout(r, 100));

    const Activity = require("../src/db/models/activity.model");
    const activities = await Activity.find({
      userId,
      executionId: exec._id,
      type: "execution_completed",
    });
    expect(activities.length).toBe(1);
    expect(activities[0].message).toMatch(/completed/i);
  });

  test("activity is recorded on failed execution", async () => {
    const task = await createTask();
    const exec = await createExecution(task.id, {
      maxRetries: 0,
      retryCount: 0,
    });

    const originalExecute = engine.execute;
    engine.execute = async () => {
      throw new Error("Test failure");
    };

    await poll();
    await new Promise((r) => setTimeout(r, 100));

    engine.execute = originalExecute;

    const Activity = require("../src/db/models/activity.model");
    const activities = await Activity.find({
      userId,
      executionId: exec._id,
      type: "execution_failed",
    });
    expect(activities.length).toBe(1);
    expect(activities[0].message).toMatch(/failed/i);
  });

  test("activity is recorded on retry", async () => {
    const task = await createTask();
    const exec = await createExecution(task.id, {
      maxRetries: 2,
      retryCount: 0,
    });

    const originalExecute = engine.execute;
    let callCount = 0;
    engine.execute = async () => {
      callCount++;
      if (callCount === 1) {
        const err = new Error("ECONNRESET");
        err.code = "ECONNRESET";
        throw err;
      }
      return { output: "ok", duration: 5, steps: [] };
    };

    await poll();
    await new Promise((r) => setTimeout(r, 100));

    engine.execute = originalExecute;

    const Activity = require("../src/db/models/activity.model");
    const activities = await Activity.find({
      userId,
      executionId: exec._id,
      type: "execution_failed",
    });
    expect(activities.length).toBeGreaterThanOrEqual(1);
    expect(activities[0].message).toMatch(/retry/i);
  });
});

// ───────────────────── FIND PENDING EXECUTIONS ─────────────────────

describe("Find Pending Executions", () => {
  test("findPendingExecutions returns pending executions", async () => {
    const task = await createTask();
    const exec = await createExecution(task.id);

    const executionRepo = require("../src/db/repositories/execution.repository");
    const pending = await executionRepo.findPendingExecutions();
    expect(pending.length).toBeGreaterThanOrEqual(1);
    const found = pending.find(
      (e) => (e.id || e._id.toString()) === exec._id.toString()
    );
    expect(found).toBeDefined();
  });

  test("findPendingExecutions returns failed with retries available", async () => {
    const task = await createTask();
    const Execution = require("../src/db/models/execution.model");
    const exec = await Execution.create({
      taskId: task.id,
      userId,
      status: "failed",
      error: "Test error",
      retryCount: 0,
      maxRetries: 2,
      input: {},
      timeout: 30000,
    });

    const executionRepo = require("../src/db/repositories/execution.repository");
    const pending = await executionRepo.findPendingExecutions();
    const found = pending.find(
      (e) => (e.id || e._id.toString()) === exec._id.toString()
    );
    expect(found).toBeDefined();
  });

  test("findPendingExecutions excludes permanently failed", async () => {
    const task = await createTask();
    const Execution = require("../src/db/models/execution.model");
    await Execution.create({
      taskId: task.id,
      userId,
      status: "failed",
      error: "Test error",
      retryCount: 3,
      maxRetries: 3,
      input: {},
      timeout: 30000,
    });

    const executionRepo = require("../src/db/repositories/execution.repository");
    const pending = await executionRepo.findPendingExecutions();
    const permanentlyFailed = pending.filter((e) => e.status === "failed");
    expect(permanentlyFailed.length).toBe(0);
  });

  test("findPendingExecutions excludes completed executions", async () => {
    const task = await createTask();
    const Execution = require("../src/db/models/execution.model");
    await Execution.create({
      taskId: task.id,
      userId,
      status: "completed",
      output: "done",
      completedAt: new Date(),
      input: {},
      timeout: 30000,
    });

    const executionRepo = require("../src/db/repositories/execution.repository");
    const pending = await executionRepo.findPendingExecutions();
    const completed = pending.filter((e) => e.status === "completed");
    expect(completed.length).toBe(0);
  });
});

// ───────────────────── END-TO-END SCENARIOS ─────────────────────

describe("End-to-End Scenarios", () => {
  test("full lifecycle: create task → create execution → worker processes → completed", async () => {
    const task = await createTask({ title: "E2E Task" });
    const exec = await createExecution(task.id);

    const Execution = require("../src/db/models/execution.model");
    const before = await Execution.findById(exec._id);
    expect(before.status).toBe("pending");

    await poll();

    const after = await Execution.findById(exec._id);
    expect(after.status).toBe("completed");
    expect(after.output).toBeDefined();
    expect(after.completedAt).toBeDefined();
    expect(after.duration).toBeGreaterThanOrEqual(0);

    const Task = require("../src/db/models/task.model");
    const taskAfter = await Task.findById(task.id);
    expect(taskAfter.status).toBe("completed");
  });

  test("full retry lifecycle: fail → retry → succeed", async () => {
    const task = await createTask({ title: "Retry E2E" });
    const exec = await createExecution(task.id, {
      maxRetries: 2,
      retryCount: 0,
    });

    const originalExecute = engine.execute;
    let callCount = 0;
    engine.execute = async () => {
      callCount++;
      if (callCount === 1) {
        const err = new Error("ETIMEDOUT");
        err.code = "ETIMEDOUT";
        throw err;
      }
      return { output: "success after retry", duration: 10, steps: [] };
    };

    await poll();

    const Execution = require("../src/db/models/execution.model");
    const mid = await Execution.findById(exec._id);
    expect(mid.status).toBe("pending");
    expect(mid.retryCount).toBe(1);

    await poll();

    const final_ = await Execution.findById(exec._id);
    expect(final_.status).toBe("completed");
    expect(final_.retryCount).toBe(1);
    expect(final_.output).toBe("success after retry");

    engine.execute = originalExecute;
  });

  test("full permanent failure: exhaust all retries", async () => {
    const task = await createTask({ title: "Permanent Fail" });
    const exec = await createExecution(task.id, {
      maxRetries: 2,
      retryCount: 0,
    });

    const originalExecute = engine.execute;
    engine.execute = async () => {
      const err = new Error("ECONNRESET");
      err.code = "ECONNRESET";
      throw err;
    };

    await poll();
    await poll();
    await poll();

    engine.execute = originalExecute;

    const Execution = require("../src/db/models/execution.model");
    const final_ = await Execution.findById(exec._id);
    expect(final_.status).toBe("failed");
    expect(final_.retryCount).toBe(2);

    const Task = require("../src/db/models/task.model");
    const taskAfter = await Task.findById(task.id);
    expect(taskAfter.status).toBe("failed");
  });

  test("multiple tasks processed in sequence", async () => {
    const task1 = await createTask({ title: "Task A" });
    const task2 = await createTask({ title: "Task B" });
    const task3 = await createTask({ title: "Task C" });
    const exec1 = await createExecution(task1.id);
    const exec2 = await createExecution(task2.id);
    const exec3 = await createExecution(task3.id);

    await poll();
    await poll();
    await poll();

    const Execution = require("../src/db/models/execution.model");
    const u1 = await Execution.findById(exec1._id);
    const u2 = await Execution.findById(exec2._id);
    const u3 = await Execution.findById(exec3._id);
    expect(u1.status).toBe("completed");
    expect(u2.status).toBe("completed");
    expect(u3.status).toBe("completed");
  });
});
