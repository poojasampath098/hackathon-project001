process.env.JWT_SECRET = "test-jwt-secret-activity-read";

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const express = require("express");
const request = require("supertest");

const User = require("../src/db/models/user.model");
const Activity = require("../src/db/models/activity.model");
const activityRoutes = require("../src/routes/activity.routes");
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
  app.use("/api/activities", activityRoutes);
  app.use((req, res) => {
    res.status(404).json({ success: false, message: "Not found" });
  });
  app.use(require("../src/middleware/error.middleware"));

  const user = await User.create({
    email: "notif@example.com",
    passwordHash: "x",
    emailVerified: true,
  });
  userId = user.id;
  token = generateAccessToken({ userId });

  const otherUser = await User.create({
    email: "notif-other@example.com",
    passwordHash: "x",
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
  for (const key in mongoose.connection.collections) {
    await mongoose.connection.collections[key].deleteMany({});
  }
  // Re-seed the users that tests rely on.
  const user = await User.create({ email: "notif@example.com", passwordHash: "x", emailVerified: true });
  userId = user.id;
  token = generateAccessToken({ userId });
  const otherUser = await User.create({ email: "notif-other@example.com", passwordHash: "x", emailVerified: true });
  otherUserId = otherUser.id;
  otherToken = generateAccessToken({ userId: otherUserId });
});

function authHeader(t) {
  return { Authorization: `Bearer ${t}` };
}

async function seedActivities(ownerId, count) {
  const docs = [];
  for (let i = 0; i < count; i++) {
    docs.push(
      await Activity.create({ userId: ownerId, type: "task_created", message: `Message ${i}` })
    );
  }
  return docs;
}

describe("GET /api/activities (read field)", () => {
  test("new activities are returned with read=false", async () => {
    await seedActivities(userId, 2);

    const res = await request(app).get("/api/activities").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.activities).toHaveLength(2);
    for (const a of res.body.data.activities) {
      expect(a.read).toBe(false);
    }
  });
});

describe("PATCH /api/activities/:id/read", () => {
  test("marks an activity as read and persists it", async () => {
    const [a1, a2] = await seedActivities(userId, 2);

    const res = await request(app)
      .patch(`/api/activities/${a1.id}/read`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.activity.id).toBe(a1.id);
    expect(res.body.data.activity.read).toBe(true);

    // Persisted: a refetch shows the marked activity read and the other unread.
    const refetch = await request(app).get("/api/activities").set(authHeader(token));
    const byId = Object.fromEntries(
      refetch.body.data.activities.map((a) => [a.id, a.read])
    );
    expect(refetch.body.data.activities).toHaveLength(2);
    expect(byId[a1.id]).toBe(true);
    expect(byId[a2.id]).toBe(false);
  });

  test("does not mark other activities read (one id != all)", async () => {
    const [a1, a2, a3] = await seedActivities(userId, 3);
    await request(app).patch(`/api/activities/${a2.id}/read`).set(authHeader(token));

    const refetch = await request(app).get("/api/activities").set(authHeader(token));
    const byId = Object.fromEntries(refetch.body.data.activities.map((a) => [a.id, a.read]));
    expect(byId[a1.id]).toBe(false);
    expect(byId[a2.id]).toBe(true);
    expect(byId[a3.id]).toBe(false);
  });

  test("idempotent: marking an already-read activity still succeeds", async () => {
    const [a1] = await seedActivities(userId, 1);
    await request(app).patch(`/api/activities/${a1.id}/read`).set(authHeader(token));
    const res = await request(app).patch(`/api/activities/${a1.id}/read`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.data.activity.read).toBe(true);
  });

  test("returns 404 for another user's activity (no IDOR)", async () => {
    const [a1] = await seedActivities(userId, 1);

    const res = await request(app)
      .patch(`/api/activities/${a1.id}/read`)
      .set(authHeader(otherToken));

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);

    // The original owner's activity is untouched.
    const reloaded = await Activity.findById(a1.id);
    expect(reloaded.read).toBe(false);
  });

  test("returns 400 for an invalid activity id", async () => {
    const res = await request(app)
      .patch("/api/activities/not-an-id/read")
      .set(authHeader(token));
    expect(res.status).toBe(400);
  });

  test("returns 404 for a non-existent activity", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .patch(`/api/activities/${fakeId}/read`)
      .set(authHeader(token));
    expect(res.status).toBe(404);
  });

  test("returns 401 without authentication", async () => {
    const [a1] = await seedActivities(userId, 1);
    const res = await request(app).patch(`/api/activities/${a1.id}/read`);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/activities/read-all", () => {
  test("marks all of the current user's activities as read", async () => {
    await seedActivities(userId, 3);

    const res = await request(app)
      .post("/api/activities/read-all")
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.modifiedCount).toBe(3);

    const refetch = await request(app).get("/api/activities").set(authHeader(token));
    expect(refetch.body.data.activities.map((a) => a.read)).toEqual([true, true, true]);
  });

  test("does not touch another user's activities", async () => {
    await seedActivities(userId, 2);
    const theirs = await seedActivities(otherUserId, 2);

    await request(app).post("/api/activities/read-all").set(authHeader(token));

    const reloaded = await Activity.find({ _id: { $in: theirs.map((a) => a._id) } });
    expect(reloaded.every((a) => a.read === false)).toBe(true);
  });

  test("returns modifiedCount 0 when there is nothing unread", async () => {
    await seedActivities(userId, 1);
    await request(app).post("/api/activities/read-all").set(authHeader(token));

    const res = await request(app)
      .post("/api/activities/read-all")
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.data.modifiedCount).toBe(0);
  });

  test("returns 401 without authentication", async () => {
    const res = await request(app).post("/api/activities/read-all");
    expect(res.status).toBe(401);
  });
});