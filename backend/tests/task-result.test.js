const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const express = require("express");
const request = require("supertest");
const bcrypt = require("bcrypt");
const errorHandler = require("../src/middleware/error.middleware");
const { generateAccessToken } = require("../src/core/security");

let mongoServer;
let app;
let user1;
let token1;
let user2;
let token2;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);

  app = express();
  app.use(express.json());

  const authRoutes = require("../src/routes/auth.routes");
  const taskRoutes = require("../src/routes/task.routes");
  const executionRoutes = require("../src/execution/execution.routes");
  const artifactRoutes = require("../src/routes/artifact.routes");

  app.use("/api/auth", authRoutes);
  app.use("/api/tasks", taskRoutes);
  app.use("/api/executions", executionRoutes);
  app.use("/api/artifacts", artifactRoutes);

  app.use((req, res) => {
    res.status(404).json({ success: false, message: "Not found" });
  });
  app.use(errorHandler);

  const User = require("../src/db/models/user.model");
  const passwordHash = await bcrypt.hash("Test1234!", 10);

  const a = await User.create({
    email: "result-owner@example.com",
    passwordHash,
    emailVerified: true,
  });
  user1 = a.id;
  token1 = generateAccessToken({ userId: user1 });

  const b = await User.create({
    email: "result-other@example.com",
    passwordHash,
    emailVerified: true,
  });
  user2 = b.id;
  token2 = generateAccessToken({ userId: user2 });
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
  return { Authorization: `Bearer ${t}` };
}

function engineResult(taskTitle, outputText, input) {
  return {
    taskTitle,
    status: "completed",
    message: `Task "${taskTitle}" executed successfully`,
    output: outputText,
    input: input || {},
    timestamp: new Date().toISOString(),
  };
}

async function createTask(userId, title) {
  const Task = require("../src/db/models/task.model");
  const task = await Task.create({ userId, title });
  return task;
}

async function createExecution(userId, taskId, overrides) {
  const executionRepo = require("../src/db/repositories/execution.repository");
  const execution = await executionRepo.createExecution({
    taskId,
    userId,
    input: overrides && overrides.input ? overrides.input : {},
  });
  const updates = {};
  if (overrides) {
    const fields = [
      "status",
      "output",
      "error",
      "startedAt",
      "completedAt",
      "duration",
    ];
    fields.forEach((field) => {
      if (overrides[field] !== undefined) updates[field] = overrides[field];
    });
  }
  if (Object.keys(updates).length > 0) {
    await executionRepo.updateExecution(execution.id, userId, updates);
  }
  return executionRepo.findExecutionByIdAndUserId(execution.id, userId);
}

describe("Task result retrieval (execution output via existing authenticated APIs)", () => {
  test("GET /api/executions/:id returns the stored agent result for the owner", async () => {
    const task = await createTask(user1, "Research Task");
    const output = engineResult("Research Task", "Tesla Model 3 starts at $35,000.");
    const execution = await createExecution(user1, task.id, {
      status: "completed",
      startedAt: new Date(),
      completedAt: new Date(),
      duration: 4200,
      output,
    });

    const res = await request(app)
      .get(`/api/executions/${execution.id}`)
      .set(authHeader(token1));

    expect(res.status).toBe(200);
    expect(res.body.data.execution.output.taskTitle).toBe("Research Task");
    expect(res.body.data.execution.output.status).toBe("completed");
    expect(res.body.data.execution.output.output).toBe("Tesla Model 3 starts at $35,000.");
  });

  test("GET /api/executions/by-task returns every execution with its own distinct result", async () => {
    const task = await createTask(user1, "Daily Report");
    const first = await createExecution(user1, task.id, {
      status: "completed",
      output: engineResult("Daily Report", "Monday report content"),
    });
    const second = await createExecution(user1, task.id, {
      status: "completed",
      output: engineResult("Daily Report", "Tuesday report content"),
    });
    const third = await createExecution(user1, task.id, {
      status: "completed",
      output: engineResult("Daily Report", "Wednesday report content"),
    });

    const res = await request(app)
      .get(`/api/executions/by-task?taskId=${task.id}`)
      .set(authHeader(token1));

    expect(res.status).toBe(200);
    const executions = res.body.data.executions;
    expect(executions).toHaveLength(3);

    const byId = {};
    executions.forEach((e) => {
      byId[e.id] = e.output.output;
    });
    expect(byId[first.id]).toBe("Monday report content");
    expect(byId[second.id]).toBe("Tuesday report content");
    expect(byId[third.id]).toBe("Wednesday report content");
  });

  test("pending and running executions do not expose any result", async () => {
    const task = await createTask(user1, "Slow Task");
    const pending = await createExecution(user1, task.id, { status: "pending" });
    const running = await createExecution(user1, task.id, {
      status: "running",
      startedAt: new Date(),
      output: null,
    });

    const res = await request(app)
      .get(`/api/executions/by-task?taskId=${task.id}`)
      .set(authHeader(token1));

    expect(res.status).toBe(200);
    const execs = res.body.data.executions;
    const map = {};
    execs.forEach((e) => {
      map[e.id] = e;
    });
    expect(map[pending.id].output).toBe(null);
    expect(map[running.id].output).toBe(null);
  });

  test("failed executions expose the real error and no result payload", async () => {
    const task = await createTask(user1, "Fragile Task");
    const failed = await createExecution(user1, task.id, {
      status: "failed",
      startedAt: new Date(),
      completedAt: new Date(),
      error: "AI service returned 429 Too Many Requests",
      output: null,
    });

    const res = await request(app)
      .get(`/api/executions/${failed.id}`)
      .set(authHeader(token1));

    expect(res.status).toBe(200);
    expect(res.body.data.execution.status).toBe("failed");
    expect(res.body.data.execution.error).toMatch(/429 Too Many Requests/);
    expect(res.body.data.execution.output).toBe(null);
  });

  test("execution_output artifacts are listed per execution and downloadable with full content", async () => {
    const artifactService = require("../src/services/artifact.service");
    const task = await createTask(user1, "Artifact Task");
    const output = engineResult("Artifact Task", "The report body is here.");
    const execution = await createExecution(user1, task.id, {
      status: "completed",
      output,
    });

    const artifact = await artifactService.createArtifact(
      user1,
      "execution_output",
      `Execution ${execution.id} output`,
      { output, duration: 2500, steps: [] },
      task.id,
      execution.id,
      { completedAt: new Date().toISOString() }
    );

    const listRes = await request(app)
      .get(`/api/artifacts/execution/${execution.id}`)
      .set(authHeader(token1));
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.artifacts).toHaveLength(1);
    expect(listRes.body.data.artifacts[0].content.output.output).toBe("The report body is here.");

    const detailRes = await request(app)
      .get(`/api/artifacts/${artifact.id}`)
      .set(authHeader(token1));
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.artifact.content.output.output).toBe("The report body is here.");

    const downRes = await request(app)
      .get(`/api/artifacts/${artifact.id}/download`)
      .set(authHeader(token1));
    expect(downRes.status).toBe(200);
    expect(downRes.headers["content-type"]).toContain("application/json");
    expect(downRes.body.output.output).toBe("The report body is here.");
  });

  test("a completed execution with no stored output reports no result payload", async () => {
    const task = await createTask(user1, "Empty Task");
    const execution = await createExecution(user1, task.id, {
      status: "completed",
      startedAt: new Date(),
      completedAt: new Date(),
      duration: 1000,
      output: null,
    });

    const res = await request(app)
      .get(`/api/executions/${execution.id}`)
      .set(authHeader(token1));

    expect(res.status).toBe(200);
    expect(res.body.data.execution.status).toBe("completed");
    expect(res.body.data.execution.output).toBe(null);
  });
});

describe("Task result security (ownership scoping)", () => {
  test("a different user cannot read the owner's execution (404)", async () => {
    const task = await createTask(user1, "Private Task");
    const execution = await createExecution(user1, task.id, {
      status: "completed",
      output: engineResult("Private Task", "Secret result"),
    });

    const res = await request(app)
      .get(`/api/executions/${execution.id}`)
      .set(authHeader(token2));

    expect(res.status).toBe(404);
  });

  test("a different user gets an empty execution list for the owner's task (no leakage)", async () => {
    const task = await createTask(user1, "Private Task 2");
    await createExecution(user1, task.id, {
      status: "completed",
      output: engineResult("Private Task 2", "Secret result"),
    });

    const res = await request(app)
      .get(`/api/executions/by-task?taskId=${task.id}`)
      .set(authHeader(token2));

    expect(res.status).toBe(200);
    expect(res.body.data.executions).toHaveLength(0);
  });

  test("a different user cannot read the owner's task (404)", async () => {
    const task = await createTask(user1, "Private Task 3");

    const res = await request(app)
      .get(`/api/tasks/${task.id}`)
      .set(authHeader(token2));

    expect(res.status).toBe(404);
  });

  test("a different user cannot read or download the owner's artifact (404)", async () => {
    const artifactService = require("../src/services/artifact.service");
    const task = await createTask(user1, "Private Task 4");
    const execution = await createExecution(user1, task.id, {
      status: "completed",
      output: engineResult("Private Task 4", "result"),
    });
    const artifact = await artifactService.createArtifact(
      user1,
      "execution_output",
      "Secret artifact",
      { output: engineResult("Private Task 4", "result") },
      task.id,
      execution.id,
      {}
    );

    const getRes = await request(app)
      .get(`/api/artifacts/${artifact.id}`)
      .set(authHeader(token2));
    expect(getRes.status).toBe(404);

    const downRes = await request(app)
      .get(`/api/artifacts/${artifact.id}/download`)
      .set(authHeader(token2));
    expect(downRes.status).toBe(404);

    const listRes = await request(app)
      .get(`/api/artifacts/execution/${execution.id}`)
      .set(authHeader(token2));
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.artifacts).toHaveLength(0);
  });

  test("endpoints reject unauthenticated requests", async () => {
    const task = await createTask(user1, "No Auth Task");

    const execRes = await request(app).get("/api/executions/by-task?taskId=abc");
    expect([401, 403]).toContain(execRes.status);

    const artRes = await request(app).get("/api/artifacts/execution/abc");
    expect([401, 403]).toContain(artRes.status);
  });
});