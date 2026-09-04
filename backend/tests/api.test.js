const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const express = require("express");
const request = require("supertest");

let mongoServer;
let app;
let userId;
let token;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);

  app = express();
  app.use(express.json());

  const activityRoutes = require("../src/routes/activity.routes");
  const artifactRoutes = require("../src/routes/artifact.routes");
  app.use("/api/activities", activityRoutes);
  app.use("/api/artifacts", artifactRoutes);

  const { generateAccessToken } = require("../src/core/security");
  userId = new mongoose.Types.ObjectId();
  token = generateAccessToken({ userId });
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

function authHeader() {
  return { Authorization: `Bearer ${token}` };
}

describe("Activity API", () => {
  test("GET /api/activities requires auth", async () => {
    const res = await request(app).get("/api/activities");
    expect(res.status).toBe(401);
  });

  test("GET /api/activities returns empty list", async () => {
    const res = await request(app)
      .get("/api/activities")
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.activities).toEqual([]);
  });

  test("GET /api/activities returns activities", async () => {
    const Activity = require("../src/db/models/activity.model");
    await Activity.create({ userId, type: "task_created", message: "Test" });

    const res = await request(app)
      .get("/api/activities")
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.activities).toHaveLength(1);
  });

  test("GET /api/activities respects limit query", async () => {
    const Activity = require("../src/db/models/activity.model");
    for (let i = 0; i < 5; i++) {
      await Activity.create({ userId, type: "task_created", message: `Task ${i}` });
    }

    const res = await request(app)
      .get("/api/activities?limit=2")
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.activities).toHaveLength(2);
  });

  test("GET /api/activities/task/:taskId returns task activities", async () => {
    const taskId = new mongoose.Types.ObjectId();
    const Activity = require("../src/db/models/activity.model");
    await Activity.create({ userId, type: "task_created", taskId, message: "Created" });
    await Activity.create({ userId, type: "task_completed", taskId, message: "Done" });

    const res = await request(app)
      .get(`/api/activities/task/${taskId}`)
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.activities).toHaveLength(2);
  });

  test("GET /api/activities/task/:taskId rejects invalid ID", async () => {
    const res = await request(app)
      .get("/api/activities/task/invalid")
      .set(authHeader());

    expect(res.status).toBe(400);
  });

  test("GET /api/activities/execution/:executionId returns execution activities", async () => {
    const executionId = new mongoose.Types.ObjectId();
    const Activity = require("../src/db/models/activity.model");
    await Activity.create({ userId, type: "execution_started", executionId, message: "Start" });

    const res = await request(app)
      .get(`/api/activities/execution/${executionId}`)
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.activities).toHaveLength(1);
  });

  test("DELETE /api/activities/:id deletes activity", async () => {
    const Activity = require("../src/db/models/activity.model");
    const activity = await Activity.create({ userId, type: "task_created", message: "Test" });

    const res = await request(app)
      .delete(`/api/activities/${activity.id}`)
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Activity deleted");
  });

  test("DELETE /api/activities/:id returns 404 for non-existent", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .delete(`/api/activities/${fakeId}`)
      .set(authHeader());

    expect(res.status).toBe(404);
  });

  test("DELETE /api/activities/:id rejects invalid ID", async () => {
    const res = await request(app)
      .delete("/api/activities/invalid")
      .set(authHeader());

    expect(res.status).toBe(400);
  });
});

describe("Artifact API", () => {
  test("POST /api/artifacts requires auth", async () => {
    const res = await request(app)
      .post("/api/artifacts")
      .send({ type: "document", name: "Test" });
    expect(res.status).toBe(401);
  });

  test("POST /api/artifacts creates artifact", async () => {
    const res = await request(app)
      .post("/api/artifacts")
      .set(authHeader())
      .send({ type: "document", name: "Test Doc", content: { text: "hello" } });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.artifact.name).toBe("Test Doc");
  });

  test("POST /api/artifacts rejects invalid type", async () => {
    const res = await request(app)
      .post("/api/artifacts")
      .set(authHeader())
      .send({ type: "invalid", name: "Test" });

    expect(res.status).toBe(400);
  });

  test("POST /api/artifacts rejects missing name", async () => {
    const res = await request(app)
      .post("/api/artifacts")
      .set(authHeader())
      .send({ type: "document" });

    expect(res.status).toBe(400);
  });

  test("POST /api/artifacts rejects missing type", async () => {
    const res = await request(app)
      .post("/api/artifacts")
      .set(authHeader())
      .send({ name: "Test" });

    expect(res.status).toBe(400);
  });

  test("POST /api/artifacts rejects invalid taskId", async () => {
    const res = await request(app)
      .post("/api/artifacts")
      .set(authHeader())
      .send({ type: "document", name: "Test", taskId: "invalid" });

    expect(res.status).toBe(400);
  });

  test("POST /api/artifacts rejects invalid executionId", async () => {
    const res = await request(app)
      .post("/api/artifacts")
      .set(authHeader())
      .send({ type: "document", name: "Test", executionId: "invalid" });

    expect(res.status).toBe(400);
  });

  test("GET /api/artifacts returns empty list", async () => {
    const res = await request(app)
      .get("/api/artifacts")
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.artifacts).toEqual([]);
  });

  test("GET /api/artifacts returns artifacts", async () => {
    const Artifact = require("../src/db/models/artifact.model");
    await Artifact.create({ userId, type: "document", name: "Test" });

    const res = await request(app)
      .get("/api/artifacts")
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.artifacts).toHaveLength(1);
  });

  test("GET /api/artifacts respects limit query", async () => {
    const Artifact = require("../src/db/models/artifact.model");
    for (let i = 0; i < 5; i++) {
      await Artifact.create({ userId, type: "document", name: `Doc ${i}` });
    }

    const res = await request(app)
      .get("/api/artifacts?limit=2")
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.artifacts).toHaveLength(2);
  });

  test("GET /api/artifacts/:id returns artifact", async () => {
    const Artifact = require("../src/db/models/artifact.model");
    const artifact = await Artifact.create({ userId, type: "document", name: "Test" });

    const res = await request(app)
      .get(`/api/artifacts/${artifact.id}`)
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.artifact.name).toBe("Test");
  });

  test("GET /api/artifacts/:id returns 404 for non-existent", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .get(`/api/artifacts/${fakeId}`)
      .set(authHeader());

    expect(res.status).toBe(404);
  });

  test("GET /api/artifacts/:id rejects invalid ID", async () => {
    const res = await request(app)
      .get("/api/artifacts/invalid")
      .set(authHeader());

    expect(res.status).toBe(400);
  });

  test("GET /api/artifacts/task/:taskId returns task artifacts", async () => {
    const taskId = new mongoose.Types.ObjectId();
    const Artifact = require("../src/db/models/artifact.model");
    await Artifact.create({ userId, type: "document", name: "For task", taskId });

    const res = await request(app)
      .get(`/api/artifacts/task/${taskId}`)
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.artifacts).toHaveLength(1);
  });

  test("GET /api/artifacts/execution/:executionId returns execution artifacts", async () => {
    const executionId = new mongoose.Types.ObjectId();
    const Artifact = require("../src/db/models/artifact.model");
    await Artifact.create({ userId, type: "execution_output", name: "Output", executionId });

    const res = await request(app)
      .get(`/api/artifacts/execution/${executionId}`)
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.artifacts).toHaveLength(1);
  });

  test("DELETE /api/artifacts/:id deletes artifact", async () => {
    const Artifact = require("../src/db/models/artifact.model");
    const artifact = await Artifact.create({ userId, type: "document", name: "Test" });

    const res = await request(app)
      .delete(`/api/artifacts/${artifact.id}`)
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Artifact deleted");
  });

  test("DELETE /api/artifacts/:id returns 404 for non-existent", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .delete(`/api/artifacts/${fakeId}`)
      .set(authHeader());

    expect(res.status).toBe(404);
  });

  test("DELETE /api/artifacts/:id rejects invalid ID", async () => {
    const res = await request(app)
      .delete("/api/artifacts/invalid")
      .set(authHeader());

    expect(res.status).toBe(400);
  });

  test("POST /api/artifacts with taskId creates artifact with task association", async () => {
    const taskId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .post("/api/artifacts")
      .set(authHeader())
      .send({ type: "document", name: "Task Doc", taskId });

    expect(res.status).toBe(201);
    expect(res.body.data.artifact.taskId).toBe(taskId.toString());
  });

  test("POST /api/artifacts with executionId creates artifact with execution association", async () => {
    const executionId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .post("/api/artifacts")
      .set(authHeader())
      .send({ type: "execution_output", name: "Exec Output", executionId });

    expect(res.status).toBe(201);
    expect(res.body.data.artifact.executionId).toBe(executionId.toString());
  });
});
