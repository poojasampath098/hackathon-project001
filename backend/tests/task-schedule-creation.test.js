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

const NEXT_RUN_ISO = "2030-01-15T09:00:00.000Z";

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());

  User = require("../src/db/models/user.model");
  Task = require("../src/db/models/task.model");
  Schedule = require("../src/db/models/schedule.model");

  const passwordHash = await bcrypt.hash("Test1234!", 10);
  const user = await User.create({
    email: "scheduled-task@example.com",
    passwordHash,
    emailVerified: true,
  });
  userId = user._id.toString();
  userToken = generateAccessToken({ userId });

  app = express();
  app.use(express.json());

  const taskRoutes = require("../src/routes/task.routes");
  const scheduleRoutes = require("../src/routes/schedule.routes");

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

describe("Task + Schedule atomic creation (Create Task wizard)", () => {
  test("once task with nextRunAt creates Task AND Schedule in one request", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ name: "One-off Run", scheduleType: "once", nextRunAt: NEXT_RUN_ISO });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.task.name).toBe("One-off Run");
    expect(res.body.data.task.scheduleType).toBe("once");

    const schedule = res.body.data.schedule;
    expect(schedule).toBeTruthy();
    expect(schedule.frequency).toBe("once");
    expect(schedule.enabled).toBe(true);
    expect(schedule.taskId).toBe(res.body.data.task.id);
    expect(new Date(schedule.nextRunAt).toISOString()).toBe(NEXT_RUN_ISO);

    const dbTask = await Task.findById(res.body.data.task.id);
    expect(dbTask).toBeTruthy();
    const dbSchedule = await Schedule.findOne({ taskId: dbTask._id, userId });
    expect(dbSchedule).toBeTruthy();
    expect(dbSchedule.frequency).toBe("once");
    expect(dbSchedule.enabled).toBe(true);
  });

  test("recurring task with nextRunAt + frequency creates repeating Schedule", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ name: "Weekly Digest", scheduleType: "recurring", frequency: "weekly", nextRunAt: NEXT_RUN_ISO });

    expect(res.status).toBe(201);
    expect(res.body.data.schedule.frequency).toBe("weekly");
    expect(new Date(res.body.data.schedule.nextRunAt).toISOString()).toBe(NEXT_RUN_ISO);

    const dbSchedule = await Schedule.findOne({ taskId: res.body.data.task.id, userId });
    expect(dbSchedule).toBeTruthy();
    expect(dbSchedule.frequency).toBe("weekly");
  });

  test("invalid frequency rejects with 400 and rolls back the created task", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ name: "Bad Schedule", scheduleType: "recurring", frequency: "hourly", nextRunAt: NEXT_RUN_ISO });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("Scheduling failed");
    expect(res.body.message).toContain("Frequency must be one of");

    const taskCount = await Task.countDocuments({ name: "Bad Schedule", userId });
    expect(taskCount).toBe(0);
  });

  test("invalid nextRunAt rejects with 400 and rolls back the created task", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ name: "Bad Date", scheduleType: "once", nextRunAt: "not-a-date" });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Scheduling failed");

    const taskCount = await Task.countDocuments({ name: "Bad Date", userId });
    expect(taskCount).toBe(0);
  });

  test("task without nextRunAt creates no Schedule", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ name: "Manual Task" });

    expect(res.status).toBe(201);
    expect(res.body.data.schedule).toBeNull();

    const dbTask = await Task.findById(res.body.data.task.id);
    expect(dbTask).toBeTruthy();
    const scheduleCount = await Schedule.countDocuments({ taskId: dbTask._id, userId });
    expect(scheduleCount).toBe(0);
  });

  test("requiresApproval persists from the request", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ name: "Needs OK", nextRunAt: NEXT_RUN_ISO, requiresApproval: true });

    expect(res.status).toBe(201);
    expect(res.body.data.task.requiresApproval).toBe(true);
    const dbTask = await Task.findById(res.body.data.task.id);
    expect(dbTask.requiresApproval).toBe(true);

    const resNoFlag = await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ name: "No Approval", nextRunAt: NEXT_RUN_ISO });
    expect(resNoFlag.status).toBe(201);
    expect(resNoFlag.body.data.task.requiresApproval).toBe(false);
  });
});

describe("Standalone POST /api/schedules (unchanged endpoint)", () => {
  test("still creates a schedule for an existing task", async () => {
    const taskRes = await request(app)
      .post("/api/tasks")
      .set(authHeader())
      .send({ name: "Existing Task" });
    const taskId = taskRes.body.data.task.id;
    expect(taskRes.status).toBe(201);

    const res = await request(app)
      .post("/api/schedules")
      .set(authHeader())
      .send({ taskId, frequency: "daily", nextRunAt: NEXT_RUN_ISO });

    expect(res.status).toBe(201);
    expect(res.body.data.schedule.frequency).toBe("daily");
    expect(new Date(res.body.data.schedule.nextRunAt).toISOString()).toBe(NEXT_RUN_ISO);
  });
});