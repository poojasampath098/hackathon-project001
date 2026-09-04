process.env.JWT_SECRET = "test-secret-key";
process.env.JWT_EXPIRES_IN = "1h";

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const express = require("express");
const request = require("supertest");
const bcrypt = require("bcrypt");
const errorHandler = require("../src/middleware/error.middleware");
const { generateAccessToken } = require("../src/core/security");

let mongo;
let app;
let User;
let Task;
let Schedule;
let userToken;
let userId;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());

  User = require("../src/db/models/user.model");
  Task = require("../src/db/models/task.model");
  Schedule = require("../src/db/models/schedule.model");

  const passwordHash = await bcrypt.hash("Test1234!", 10);
  const user = await User.create({
    email: "taskgroup@example.com",
    passwordHash,
    emailVerified: true,
  });
  userId = user._id.toString();
  userToken = generateAccessToken({ userId });

  app = express();
  app.use(express.json());

  const authRoutes = require("../src/routes/auth.routes");
  const taskRoutes = require("../src/routes/task.routes");
  const scheduleRoutes = require("../src/routes/schedule.routes");

  app.use("/api/auth", authRoutes);
  app.use("/api/tasks", taskRoutes);
  app.use("/api/schedules", scheduleRoutes);

  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await Task.deleteMany({ userId });
  await Schedule.deleteMany({ userId });
});

const authHeader = (token) => ({
  Authorization: `Bearer ${token || userToken}`,
});

// ─── TASK GROUP 1: name/title Normalization ──────────────────────────────────

describe("Task Group 1 — name/title Normalization", () => {
  test("POST /api/tasks accepts 'name' field (frontend format)", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ name: "Frontend Task", time: "09:00 AM", agent: "Extraction_Bot", scheduleType: "recurring" });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.task.name).toBe("Frontend Task");
    expect(res.body.data.task.title).toBe("Frontend Task");
    expect(res.body.data.task.time).toBe("09:00 AM");
    expect(res.body.data.task.agent).toBe("Extraction_Bot");
    expect(res.body.data.task.scheduleType).toBe("recurring");
  });

  test("POST /api/tasks accepts 'title' field (backend format)", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ title: "Backend Task", description: "A test task", priority: "high" });

    expect(res.status).toBe(201);
    expect(res.body.data.task.title).toBe("Backend Task");
    expect(res.body.data.task.name).toBe("Backend Task");
    expect(res.body.data.task.description).toBe("A test task");
    expect(res.body.data.task.priority).toBe("high");
  });

  test("POST /api/tasks rejects when neither name nor title provided", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ description: "No title" });

    expect(res.status).toBe(400);
  });

  test("POST /api/tasks validates scheduleType enum", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ name: "Bad Schedule", scheduleType: "invalid" });

    expect(res.status).toBe(400);
  });

  test("POST /api/tasks defaults scheduleType to 'once'", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ name: "Default Schedule" });

    expect(res.status).toBe(201);
    expect(res.body.data.task.scheduleType).toBe("once");
  });

  test("POST /api/tasks accepts all frontend fields together", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({
        name: "Full Frontend Task",
        description: "Detailed description",
        priority: "high",
        agent: "Report_Generator",
        time: "02:30 PM",
        scheduleType: "recurring",
      });

    expect(res.status).toBe(201);
    const task = res.body.data.task;
    expect(task.name).toBe("Full Frontend Task");
    expect(task.title).toBe("Full Frontend Task");
    expect(task.description).toBe("Detailed description");
    expect(task.priority).toBe("high");
    expect(task.agent).toBe("Report_Generator");
    expect(task.time).toBe("02:30 PM");
    expect(task.scheduledTime).toBe("02:30 PM");
    expect(task.scheduleType).toBe("recurring");
  });
});

// ─── TASK GROUP 1: Response Shape ────────────────────────────────────────────

describe("Task Group 1 — Response Shape", () => {
  test("GET /api/tasks returns badge and badgeVariant fields", async () => {
    await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ name: "Pending Task", scheduleType: "once" });

    const res = await request(app)
      .get("/api/tasks")
      .set(authHeader());

    expect(res.status).toBe(200);
    const task = res.body.data.tasks[0];
    expect(task.badge).toBe("Scheduled");
    expect(task.badgeVariant).toBe("blue");
    expect(task.name).toBeDefined();
    expect(task.time).toBeDefined();
    expect(task.agent).toBeDefined();
    expect(task.scheduleType).toBeDefined();
  });

  test("badge is 'Recurring' for recurring tasks", async () => {
    await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ name: "Recurring Task", scheduleType: "recurring" });

    const res = await request(app)
      .get("/api/tasks")
      .set(authHeader());

    const task = res.body.data.tasks[0];
    expect(task.badge).toBe("Recurring");
    expect(task.badgeVariant).toBe("purple");
  });

  test("badge is 'Completed' for completed tasks", async () => {
    await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ name: "Done Task" });

    const tasks = (await request(app).get("/api/tasks").set(authHeader())).body.data.tasks;
    const taskId = tasks[0].id;

    await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set(authHeader())
      .send({ status: "completed" });

    const res = await request(app)
      .get("/api/tasks")
      .set(authHeader());

    const task = res.body.data.tasks[0];
    expect(task.badge).toBe("Completed");
    expect(task.badgeVariant).toBe("green");
  });

  test("GET /api/tasks/:id returns frontend-friendly shape", async () => {
    await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ name: "Detail Task", agent: "Agent_X", time: "11:00 AM" });

    const tasks = (await request(app).get("/api/tasks").set(authHeader())).body.data.tasks;
    const res = await request(app)
      .get(`/api/tasks/${tasks[0].id}`)
      .set(authHeader());

    expect(res.status).toBe(200);
    const task = res.body.data.task;
    expect(task.name).toBe("Detail Task");
    expect(task.title).toBe("Detail Task");
    expect(task.agent).toBe("Agent_X");
    expect(task.time).toBe("11:00 AM");
    expect(task).toHaveProperty("badge");
    expect(task).toHaveProperty("badgeVariant");
  });
});

// ─── TASK GROUP 1: Filtering ─────────────────────────────────────────────────

describe("Task Group 1 — Status Filtering", () => {
  beforeEach(async () => {
    await request(app).post("/api/tasks").set(authHeader()).send({ name: "Pending 1" });
    await request(app).post("/api/tasks").set(authHeader()).send({ name: "Pending 2" });

    const tasks = (await request(app).get("/api/tasks").set(authHeader())).body.data.tasks;
    await request(app).patch(`/api/tasks/${tasks[1].id}`).set(authHeader()).send({ status: "completed" });
  });

  test("GET /api/tasks?status=pending returns only pending tasks", async () => {
    const res = await request(app)
      .get("/api/tasks?status=pending")
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.tasks.length).toBe(1);
    expect(res.body.data.tasks[0].status).toBe("pending");
  });

  test("GET /api/tasks?status=completed returns only completed tasks", async () => {
    const res = await request(app)
      .get("/api/tasks?status=completed")
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.tasks.length).toBe(1);
    expect(res.body.data.tasks[0].status).toBe("completed");
  });

  test("GET /api/tasks without filter returns all tasks", async () => {
    const res = await request(app)
      .get("/api/tasks")
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.tasks.length).toBe(2);
  });
});

// ─── TASK GROUP 1: PUT Endpoint ──────────────────────────────────────────────

describe("Task Group 1 — PUT /api/tasks/:id", () => {
  test("PUT updates task with frontend fields", async () => {
    await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ name: "Original Task" });

    const tasks = (await request(app).get("/api/tasks").set(authHeader())).body.data.tasks;
    const res = await request(app)
      .put(`/api/tasks/${tasks[0].id}`)
      .set(authHeader())
      .send({ name: "Updated Task", agent: "New_Agent", time: "03:00 PM", scheduleType: "recurring" });

    expect(res.status).toBe(200);
    expect(res.body.data.task.name).toBe("Updated Task");
    expect(res.body.data.task.agent).toBe("New_Agent");
    expect(res.body.data.task.time).toBe("03:00 PM");
    expect(res.body.data.task.scheduleType).toBe("recurring");
  });

  test("PUT works same as PATCH for partial updates", async () => {
    await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ name: "Partial Task", agent: "Old_Agent" });

    const tasks = (await request(app).get("/api/tasks").set(authHeader())).body.data.tasks;
    const res = await request(app)
      .put(`/api/tasks/${tasks[0].id}`)
      .set(authHeader())
      .send({ agent: "New_Agent" });

    expect(res.status).toBe(200);
    expect(res.body.data.task.agent).toBe("New_Agent");
    expect(res.body.data.task.name).toBe("Partial Task");
  });

  test("PUT rejects invalid scheduleType", async () => {
    await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ name: "Validate Task" });

    const tasks = (await request(app).get("/api/tasks").set(authHeader())).body.data.tasks;
    const res = await request(app)
      .put(`/api/tasks/${tasks[0].id}`)
      .set(authHeader())
      .send({ scheduleType: "invalid" });

    expect(res.status).toBe(400);
  });
});

// ─── TASK GROUP 1: Ownership Isolation ───────────────────────────────────────

describe("Task Group 1 — Ownership Isolation", () => {
  let otherToken;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash("Other1234!", 10);
    const other = await User.create({
      email: "other-taskuser@example.com",
      passwordHash,
      emailVerified: true,
    });
    otherToken = generateAccessToken({ userId: other._id.toString() });
  });

  test("user cannot access another user's task by ID", async () => {
    await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ name: "My Task" });

    const tasks = (await request(app).get("/api/tasks").set(authHeader())).body.data.tasks;
    const res = await request(app)
      .get(`/api/tasks/${tasks[0].id}`)
      .set(authHeader(otherToken));

    expect(res.status).toBe(404);
  });

  test("user cannot update another user's task", async () => {
    await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ name: "My Task" });

    const tasks = (await request(app).get("/api/tasks").set(authHeader())).body.data.tasks;
    const res = await request(app)
      .patch(`/api/tasks/${tasks[0].id}`)
      .set(authHeader(otherToken))
      .send({ name: "Hacked Task" });

    expect(res.status).toBe(404);
  });

  test("user cannot delete another user's task", async () => {
    await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ name: "My Task" });

    const tasks = (await request(app).get("/api/tasks").set(authHeader())).body.data.tasks;
    const res = await request(app)
      .delete(`/api/tasks/${tasks[0].id}`)
      .set(authHeader(otherToken));

    expect(res.status).toBe(404);
  });

  test("GET /api/tasks only returns current user's tasks", async () => {
    await request(app).post("/api/tasks").set(authHeader()).send({ name: "My Task" });
    await request(app).post("/api/tasks").set(authHeader(otherToken)).send({ name: "Other Task" });

    const res = await request(app).get("/api/tasks").set(authHeader());
    expect(res.body.data.tasks.length).toBe(1);
    expect(res.body.data.tasks[0].name).toBe("My Task");
  });
});

// ─── TASK GROUP 2: Schedule CRUD ─────────────────────────────────────────────

describe("Task Group 2 — Schedule CRUD", () => {
  let taskId;

  beforeEach(async () => {
    const taskRes = await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ name: "Schedule Task" });
    taskId = taskRes.body.data.task.id;
  });

  test("POST /api/schedules creates schedule", async () => {
    const res = await request(app)
      .post("/api/schedules")
      .set(authHeader())
      .send({ taskId, frequency: "daily", nextRunAt: new Date(Date.now() + 86400000).toISOString() });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.schedule.frequency).toBe("daily");
  });

  test("GET /api/schedules lists user schedules", async () => {
    await request(app)
      .post("/api/schedules")
      .set(authHeader())
      .send({ taskId, frequency: "weekly", nextRunAt: new Date(Date.now() + 604800000).toISOString() });

    const res = await request(app)
      .get("/api/schedules")
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.schedules.length).toBe(1);
  });

  test("PUT /api/schedules/:id updates schedule frequency", async () => {
    const createRes = await request(app)
      .post("/api/schedules")
      .set(authHeader())
      .send({ taskId, frequency: "once", nextRunAt: new Date(Date.now() + 3600000).toISOString() });

    const scheduleId = createRes.body.data.schedule.id;

    const res = await request(app)
      .put(`/api/schedules/${scheduleId}`)
      .set(authHeader())
      .send({ frequency: "monthly" });

    expect(res.status).toBe(200);
    expect(res.body.data.schedule.frequency).toBe("monthly");
  });

  test("PUT /api/schedules/:id updates nextRunAt", async () => {
    const createRes = await request(app)
      .post("/api/schedules")
      .set(authHeader())
      .send({ taskId, frequency: "daily", nextRunAt: new Date(Date.now() + 86400000).toISOString() });

    const scheduleId = createRes.body.data.schedule.id;
    const newDate = new Date(Date.now() + 172800000).toISOString();

    const res = await request(app)
      .put(`/api/schedules/${scheduleId}`)
      .set(authHeader())
      .send({ nextRunAt: newDate });

    expect(res.status).toBe(200);
    expect(new Date(res.body.data.schedule.nextRunAt).getTime()).toBeGreaterThan(0);
  });

  test("PUT /api/schedules/:id rejects invalid frequency", async () => {
    const createRes = await request(app)
      .post("/api/schedules")
      .set(authHeader())
      .send({ taskId, frequency: "once", nextRunAt: new Date(Date.now() + 3600000).toISOString() });

    const scheduleId = createRes.body.data.schedule.id;

    const res = await request(app)
      .put(`/api/schedules/${scheduleId}`)
      .set(authHeader())
      .send({ frequency: "hourly" });

    expect(res.status).toBe(400);
  });

  test("PUT /api/schedules/:id returns 404 for non-existent", async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .put(`/api/schedules/${fakeId}`)
      .set(authHeader())
      .send({ frequency: "daily" });

    expect(res.status).toBe(404);
  });

  test("PUT /api/schedules/:id rejects empty update", async () => {
    const createRes = await request(app)
      .post("/api/schedules")
      .set(authHeader())
      .send({ taskId, frequency: "once", nextRunAt: new Date(Date.now() + 3600000).toISOString() });

    const scheduleId = createRes.body.data.schedule.id;

    const res = await request(app)
      .put(`/api/schedules/${scheduleId}`)
      .set(authHeader())
      .send({});

    expect(res.status).toBe(400);
  });

  test("DELETE /api/schedules/:id deletes schedule", async () => {
    const createRes = await request(app)
      .post("/api/schedules")
      .set(authHeader())
      .send({ taskId, frequency: "once", nextRunAt: new Date(Date.now() + 3600000).toISOString() });

    const scheduleId = createRes.body.data.schedule.id;

    const res = await request(app)
      .delete(`/api/schedules/${scheduleId}`)
      .set(authHeader());

    expect(res.status).toBe(200);

    const getRes = await request(app)
      .get(`/api/schedules/${scheduleId}`)
      .set(authHeader());
    expect(getRes.status).toBe(404);
  });
});
