const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const express = require("express");
const request = require("supertest");
const bcrypt = require("bcrypt");
const errorHandler = require("../src/middleware/error.middleware");
const { generateAccessToken } = require("../src/core/security");

// Keep generateOtp/hashOtp real but stub the actual SMTP send so send-otp
// requests never attempt a real network connection during tests (the controller
// swallows send failures anyway, and no test asserts on delivery).
jest.mock("../src/services/email.service", () => {
  const actual = jest.requireActual("../src/services/email.service");
  return { ...actual, sendVerificationOtpEmail: jest.fn().mockResolvedValue(undefined) };
});

let mongoServer;
let app;

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

function authHeader(t) {
  return { Authorization: `Bearer ${t}` };
}

// ───────────────────── REGISTER ────────────────────────────────

describe("POST /api/auth/register", () => {
  test("registers new user and returns user with firstName/lastName", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "new@example.com", password: "StrongPass1!" });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.id).toBeDefined();
    expect(res.body.data.user.email).toBe("new@example.com");
    expect(res.body.data.user.firstName).toBe("");
    expect(res.body.data.user.lastName).toBe("");
    expect(res.body.data.user.emailVerified).toBe(false);
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.user._id).toBeUndefined();
  });

  test("rejects missing email", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ password: "StrongPass1!" });
    expect(res.status).toBe(400);
  });

  test("rejects missing password", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "test@example.com" });
    expect(res.status).toBe(400);
  });

  test("rejects short password", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "test@example.com", password: "short" });
    expect(res.status).toBe(400);
  });

  test("rejects invalid email format", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "not-an-email", password: "StrongPass1!" });
    expect(res.status).toBe(400);
  });

  test("rejects duplicate email", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ email: "dupe@example.com", password: "StrongPass1!" });

    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "dupe@example.com", password: "AnotherPass1!" });
    expect(res.status).toBe(409);
  });

  test("normalizes email to lowercase", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "UPPER@EXAMPLE.COM", password: "StrongPass1!" });
    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe("upper@example.com");
  });

  test("response does not expose passwordHash", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "safe@example.com", password: "StrongPass1!" });
    const jsonStr = JSON.stringify(res.body);
    expect(jsonStr).not.toContain("passwordHash");
  });
});

// ───────────────────── LOGIN ───────────────────────────────────

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    const passwordHash = await bcrypt.hash("Test1234!", 10);
    const User = require("../src/db/models/user.model");
    await User.create({
      email: "logintest@example.com",
      passwordHash,
      firstName: "John",
      lastName: "Doe",
      emailVerified: true,
    });
  });

  test("logs in with valid credentials and returns token + user with firstName/lastName", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "logintest@example.com", password: "Test1234!" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(typeof res.body.data.token).toBe("string");
    expect(res.body.data.user.id).toBeDefined();
    expect(res.body.data.user.email).toBe("logintest@example.com");
    expect(res.body.data.user.firstName).toBe("John");
    expect(res.body.data.user.lastName).toBe("Doe");
    expect(res.body.data.user.emailVerified).toBe(true);
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  test("rejects wrong password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "logintest@example.com", password: "WrongPass1!" });
    expect(res.status).toBe(401);
  });

  test("rejects non-existent email", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "Test1234!" });
    expect(res.status).toBe(401);
  });

  test("rejects unverified email", async () => {
    const passwordHash = await bcrypt.hash("Test1234!", 10);
    const User = require("../src/db/models/user.model");
    await User.create({
      email: "unverified@example.com",
      passwordHash,
      emailVerified: false,
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "unverified@example.com", password: "Test1234!" });
    expect(res.status).toBe(403);
  });

  test("rejects deleted user", async () => {
    const passwordHash = await bcrypt.hash("Test1234!", 10);
    const User = require("../src/db/models/user.model");
    await User.create({
      email: "deleted@example.com",
      passwordHash,
      emailVerified: true,
      isDeleted: true,
      deletedAt: new Date(),
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "deleted@example.com", password: "Test1234!" });
    expect(res.status).toBe(401);
  });

  test("rejects missing fields", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({});
    expect(res.status).toBe(401);
  });

  test("normalizes email to lowercase", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "LOGintest@EXAMPLE.com", password: "Test1234!" });
    expect(res.status).toBe(200);
  });
});

// ───────────────────── LOGOUT ──────────────────────────────────

describe("POST /api/auth/logout", () => {
  let token;

  beforeEach(async () => {
    const passwordHash = await bcrypt.hash("Test1234!", 10);
    const User = require("../src/db/models/user.model");
    const user = await User.create({
      email: "logout@example.com",
      passwordHash,
      emailVerified: true,
    });
    token = generateAccessToken({ userId: user.id });
  });

  test("returns success for authenticated user", async () => {
    const res = await request(app)
      .post("/api/auth/logout")
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/logged out/i);
  });

  test("rejects unauthenticated request", async () => {
    const res = await request(app)
      .post("/api/auth/logout");

    expect(res.status).toBe(401);
  });

  test("rejects invalid token", async () => {
    const res = await request(app)
      .post("/api/auth/logout")
      .set(authHeader("invalid-token-value"));

    expect(res.status).toBe(401);
  });

  test("rejects expired token", async () => {
    const jwt = require("jsonwebtoken");
    const config = require("../src/core/config");
    const expiredToken = jwt.sign(
      { userId: "000000000000000000000001" },
      config.jwtSecret,
      { expiresIn: "0s" }
    );

    const res = await request(app)
      .post("/api/auth/logout")
      .set(authHeader(expiredToken));

    expect(res.status).toBe(401);
  });
});

// ───────────────────── ME ──────────────────────────────────────

describe("GET /api/auth/me", () => {
  let token;

  beforeEach(async () => {
    const passwordHash = await bcrypt.hash("Test1234!", 10);
    const User = require("../src/db/models/user.model");
    const user = await User.create({
      email: "metest@example.com",
      passwordHash,
      firstName: "Alice",
      lastName: "Smith",
      emailVerified: true,
    });
    token = generateAccessToken({ userId: user.id });
  });

  test("returns current user with all fields", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.id).toBeDefined();
    expect(res.body.data.user.email).toBe("metest@example.com");
    expect(res.body.data.user.firstName).toBe("Alice");
    expect(res.body.data.user.lastName).toBe("Smith");
    expect(res.body.data.user.emailVerified).toBe(true);
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  test("rejects unauthenticated request", async () => {
    const res = await request(app)
      .get("/api/auth/me");

    expect(res.status).toBe(401);
  });

  test("rejects invalid token", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set(authHeader("bad-token"));

    expect(res.status).toBe(401);
  });

  test("returns 404 for deleted user", async () => {
    const User = require("../src/db/models/user.model");
    const bcrypt = require("bcrypt");
    const deletedHash = await bcrypt.hash("Test1234!", 10);
    const deletedUser = await User.create({
      email: "deleted-me@example.com",
      passwordHash: deletedHash,
      emailVerified: true,
    });
    const deletedToken = generateAccessToken({ userId: deletedUser.id });

    await User.findByIdAndUpdate(deletedUser._id, { isDeleted: true, deletedAt: new Date() });

    const res = await request(app)
      .get("/api/auth/me")
      .set(authHeader(deletedToken));

    expect(res.status).toBe(404);
  });

  test("response does not expose passwordHash", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set(authHeader(token));

    const jsonStr = JSON.stringify(res.body);
    expect(jsonStr).not.toContain("passwordHash");
  });
});

// ───────────────────── SEND OTP ────────────────────────────────

describe("POST /api/auth/send-otp", () => {
  test("returns success for registered unverified email", async () => {
    const passwordHash = await bcrypt.hash("Test1234!", 10);
    const User = require("../src/db/models/user.model");
    await User.create({
      email: "otp@example.com",
      passwordHash,
      emailVerified: false,
    });

    const res = await request(app)
      .post("/api/auth/send-otp")
      .send({ email: "otp@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test("returns generic message for non-existent email (no enumeration)", async () => {
    const res = await request(app)
      .post("/api/auth/send-otp")
      .send({ email: "ghost@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if the email is registered/i);
  });

  test("rejects already verified email", async () => {
    const passwordHash = await bcrypt.hash("Test1234!", 10);
    const User = require("../src/db/models/user.model");
    await User.create({
      email: "verified@example.com",
      passwordHash,
      emailVerified: true,
    });

    const res = await request(app)
      .post("/api/auth/send-otp")
      .send({ email: "verified@example.com" });

    expect(res.status).toBe(400);
  });

  test("rejects missing email", async () => {
    const res = await request(app)
      .post("/api/auth/send-otp")
      .send({});

    expect(res.status).toBe(400);
  });

  test("rejects invalid email format", async () => {
    const res = await request(app)
      .post("/api/auth/send-otp")
      .send({ email: "not-valid" });

    expect(res.status).toBe(400);
  });
});

// ───────────────────── VERIFY OTP ──────────────────────────────

describe("POST /api/auth/verify-otp", () => {
  test("verifies correct OTP and returns token", async () => {
    const passwordHash = await bcrypt.hash("Test1234!", 10);
    const User = require("../src/db/models/user.model");
    const user = await User.create({
      email: "verify@example.com",
      passwordHash,
      emailVerified: false,
    });

    const emailService = require("../src/services/email.service");
    const otpRepo = require("../src/db/repositories/otp.repository");
    const otp = "123456";
    const otpHash = emailService.hashOtp(otp);
    const expiresAt = Date.now() + 10 * 60 * 1000;
    await otpRepo.saveOtp("verify@example.com", otpHash, expiresAt);

    const res = await request(app)
      .post("/api/auth/verify-otp")
      .send({ email: "verify@example.com", otp });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.emailVerified).toBe(true);
    expect(res.body.data.user.firstName).toBeDefined();
    expect(res.body.data.user.lastName).toBeDefined();
  });

  test("rejects incorrect OTP", async () => {
    const passwordHash = await bcrypt.hash("Test1234!", 10);
    const User = require("../src/db/models/user.model");
    await User.create({
      email: "wrongotp@example.com",
      passwordHash,
      emailVerified: false,
    });

    const emailService = require("../src/services/email.service");
    const otpRepo = require("../src/db/repositories/otp.repository");
    const otpHash = emailService.hashOtp("123456");
    const expiresAt = Date.now() + 10 * 60 * 1000;
    await otpRepo.saveOtp("wrongotp@example.com", otpHash, expiresAt);

    const res = await request(app)
      .post("/api/auth/verify-otp")
      .send({ email: "wrongotp@example.com", otp: "000000" });

    expect(res.status).toBe(400);
  });

  test("rejects missing fields", async () => {
    const res = await request(app)
      .post("/api/auth/verify-otp")
      .send({ email: "test@example.com" });
    expect(res.status).toBe(400);

    const res2 = await request(app)
      .post("/api/auth/verify-otp")
      .send({ otp: "123456" });
    expect(res2.status).toBe(400);
  });

  test("rejects OTP for non-existent user", async () => {
    const res = await request(app)
      .post("/api/auth/verify-otp")
      .send({ email: "ghost@example.com", otp: "123456" });
    expect(res.status).toBe(400);
  });

  test("enforces max OTP attempts", async () => {
    const passwordHash = await bcrypt.hash("Test1234!", 10);
    const User = require("../src/db/models/user.model");
    await User.create({
      email: "maxotp@example.com",
      passwordHash,
      emailVerified: false,
    });

    const emailService = require("../src/services/email.service");
    const otpRepo = require("../src/db/repositories/otp.repository");
    const otpHash = emailService.hashOtp("123456");
    const expiresAt = Date.now() + 10 * 60 * 1000;
    await otpRepo.saveOtp("maxotp@example.com", otpHash, expiresAt);

    for (let i = 0; i < 5; i++) {
      await request(app)
        .post("/api/auth/verify-otp")
        .send({ email: "maxotp@example.com", otp: "000000" });
    }

    const res = await request(app)
      .post("/api/auth/verify-otp")
      .send({ email: "maxotp@example.com", otp: "000000" });

    expect(res.status).toBe(400);
  });
});

// ───────────────────── GET /api/users/profile ──────────────────

describe("GET /api/users/profile", () => {
  let token;

  beforeEach(async () => {
    const passwordHash = await bcrypt.hash("Test1234!", 10);
    const User = require("../src/db/models/user.model");
    const user = await User.create({
      email: "profile@example.com",
      passwordHash,
      firstName: "Jane",
      lastName: "Doe",
      emailVerified: true,
    });
    token = generateAccessToken({ userId: user.id });
  });

  test("returns full profile with new fields", async () => {
    const res = await request(app)
      .get("/api/users/profile")
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe("profile@example.com");
    expect(res.body.data.user.firstName).toBe("Jane");
    expect(res.body.data.user.lastName).toBe("Doe");
    expect(res.body.data.user.avatar).toBeNull();
    expect(res.body.data.user.emailVerified).toBe(true);
  });

  test("rejects unauthenticated request", async () => {
    const res = await request(app)
      .get("/api/users/profile");
    expect(res.status).toBe(401);
  });

  test("returns 404 for deleted user", async () => {
    const User = require("../src/db/models/user.model");
    const bcryptLib = require("bcrypt");
    const deletedHash = await bcryptLib.hash("Test1234!", 10);
    const deletedUser = await User.create({
      email: "deleted-profile@example.com",
      passwordHash: deletedHash,
      emailVerified: true,
    });
    const deletedToken = generateAccessToken({ userId: deletedUser.id });

    await User.findByIdAndUpdate(deletedUser._id, { isDeleted: true, deletedAt: new Date() });

    const res = await request(app)
      .get("/api/users/profile")
      .set(authHeader(deletedToken));
    expect(res.status).toBe(404);
  });
});

// ───────────────────── PUT /api/users/profile ──────────────────

describe("PUT /api/users/profile", () => {
  let token;

  beforeEach(async () => {
    const passwordHash = await bcrypt.hash("Test1234!", 10);
    const User = require("../src/db/models/user.model");
    const user = await User.create({
      email: "update@example.com",
      passwordHash,
      firstName: "",
      lastName: "",
      emailVerified: true,
    });
    token = generateAccessToken({ userId: user.id });
  });

  test("updates firstName", async () => {
    const res = await request(app)
      .put("/api/users/profile")
      .set(authHeader(token))
      .send({ firstName: "Alice" });

    expect(res.status).toBe(200);
    expect(res.body.data.user.firstName).toBe("Alice");
  });

  test("updates lastName", async () => {
    const res = await request(app)
      .put("/api/users/profile")
      .set(authHeader(token))
      .send({ lastName: "Wonderland" });

    expect(res.status).toBe(200);
    expect(res.body.data.user.lastName).toBe("Wonderland");
  });

  test("updates avatar", async () => {
    const res = await request(app)
      .put("/api/users/profile")
      .set(authHeader(token))
      .send({ avatar: "https://example.com/avatar.jpg" });

    expect(res.status).toBe(200);
    expect(res.body.data.user.avatar).toBe("https://example.com/avatar.jpg");
  });

  test("updates email with unique check", async () => {
    const res = await request(app)
      .put("/api/users/profile")
      .set(authHeader(token))
      .send({ email: "newemail@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe("newemail@example.com");
  });

  test("updates multiple fields at once", async () => {
    const res = await request(app)
      .put("/api/users/profile")
      .set(authHeader(token))
      .send({ firstName: "Bob", lastName: "Builder", avatar: "https://img.test/bob.png" });

    expect(res.status).toBe(200);
    expect(res.body.data.user.firstName).toBe("Bob");
    expect(res.body.data.user.lastName).toBe("Builder");
    expect(res.body.data.user.avatar).toBe("https://img.test/bob.png");
  });

  test("rejects duplicate email", async () => {
    const passwordHash = await bcrypt.hash("Test1234!", 10);
    const User = require("../src/db/models/user.model");
    await User.create({
      email: "taken@example.com",
      passwordHash,
      emailVerified: true,
    });

    const res = await request(app)
      .put("/api/users/profile")
      .set(authHeader(token))
      .send({ email: "taken@example.com" });

    expect(res.status).toBe(409);
  });

  test("allows keeping own email", async () => {
    const res = await request(app)
      .put("/api/users/profile")
      .set(authHeader(token))
      .send({ email: "update@example.com" });

    expect(res.status).toBe(200);
  });

  test("rejects empty update", async () => {
    const res = await request(app)
      .put("/api/users/profile")
      .set(authHeader(token))
      .send({});

    expect(res.status).toBe(400);
  });

  test("rejects unauthenticated request", async () => {
    const res = await request(app)
      .put("/api/users/profile")
      .send({ firstName: "Hacker" });
    expect(res.status).toBe(401);
  });

  test("returns 404 for deleted user", async () => {
    const User = require("../src/db/models/user.model");
    const bcryptLib = require("bcrypt");
    const deletedHash = await bcryptLib.hash("Test1234!", 10);
    const deletedUser = await User.create({
      email: "deleted-update@example.com",
      passwordHash: deletedHash,
      emailVerified: true,
    });
    const deletedToken = generateAccessToken({ userId: deletedUser.id });

    await User.findByIdAndUpdate(deletedUser._id, { isDeleted: true, deletedAt: new Date() });

    const res = await request(app)
      .put("/api/users/profile")
      .set(authHeader(deletedToken))
      .send({ firstName: "Ghost" });
    expect(res.status).toBe(404);
  });

  test("response does not expose passwordHash", async () => {
    const res = await request(app)
      .put("/api/users/profile")
      .set(authHeader(token))
      .send({ firstName: "Safe" });

    const jsonStr = JSON.stringify(res.body);
    expect(jsonStr).not.toContain("passwordHash");
  });
});

// ───────────────────── DELETE /api/users/account ────────────────

describe("DELETE /api/users/account", () => {
  test("soft-deletes user and preserves data", async () => {
    const passwordHash = await bcrypt.hash("Test1234!", 10);
    const User = require("../src/db/models/user.model");
    const user = await User.create({
      email: "delme@example.com",
      passwordHash,
      firstName: "Delete",
      lastName: "Me",
      emailVerified: true,
    });
    const token = generateAccessToken({ userId: user.id });

    const res = await request(app)
      .delete("/api/users/account")
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const dbUser = await User.findById(user._id);
    expect(dbUser.isDeleted).toBe(true);
    expect(dbUser.deletedAt).toBeDefined();
    expect(dbUser.firstName).toBe("Delete");
    expect(dbUser.lastName).toBe("Me");
  });

  test("deleted user cannot login", async () => {
    const passwordHash = await bcrypt.hash("Test1234!", 10);
    const User = require("../src/db/models/user.model");
    const user = await User.create({
      email: "dellogin@example.com",
      passwordHash,
      emailVerified: true,
    });
    const token = generateAccessToken({ userId: user.id });

    await request(app)
      .delete("/api/users/account")
      .set(authHeader(token));

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "dellogin@example.com", password: "Test1234!" });
    expect(res.status).toBe(401);
  });

  test("deleted user cannot access profile", async () => {
    const passwordHash = await bcrypt.hash("Test1234!", 10);
    const User = require("../src/db/models/user.model");
    const user = await User.create({
      email: "delprofile@example.com",
      passwordHash,
      emailVerified: true,
    });
    const token = generateAccessToken({ userId: user.id });

    await request(app)
      .delete("/api/users/account")
      .set(authHeader(token));

    const res = await request(app)
      .get("/api/users/profile")
      .set(authHeader(token));
    expect(res.status).toBe(404);
  });

  test("rejects unauthenticated request", async () => {
    const res = await request(app)
      .delete("/api/users/account");
    expect(res.status).toBe(401);
  });

  test("returns 404 if user already deleted", async () => {
    const passwordHash = await bcrypt.hash("Test1234!", 10);
    const User = require("../src/db/models/user.model");
    const user = await User.create({
      email: "alreadydel@example.com",
      passwordHash,
      emailVerified: true,
    });
    const token = generateAccessToken({ userId: user.id });

    await request(app)
      .delete("/api/users/account")
      .set(authHeader(token));

    const res =     await request(app)
      .delete("/api/users/account")
      .set(authHeader(token));
    expect(res.status).toBe(404);
  });
});

// ───────────────────── REGISTER SEND OTP (pre-registration) ────────────────

describe("POST /api/auth/register/send-otp", () => {
  test("sends OTP for a new (not yet registered) email", async () => {
    const res = await request(app)
      .post("/api/auth/register/send-otp")
      .send({ email: "brandnew@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/verification code sent/i);

    const otpRepo = require("../src/db/repositories/otp.repository");
    const stored = await otpRepo.findOtp("brandnew@example.com");
    expect(stored).toBeTruthy();
    expect(stored.otpHash).toBeDefined();
  });

  test("rejects an already registered email with 409", async () => {
    const passwordHash = await bcrypt.hash("Test1234!", 10);
    const User = require("../src/db/models/user.model");
    await User.create({
      email: "registered@example.com",
      passwordHash,
      emailVerified: true,
    });

    const res = await request(app)
      .post("/api/auth/register/send-otp")
      .send({ email: "registered@example.com" });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already registered/i);
  });

  test("rejects missing email", async () => {
    const res = await request(app)
      .post("/api/auth/register/send-otp")
      .send({});
    expect(res.status).toBe(400);
  });

  test("rejects invalid email format", async () => {
    const res = await request(app)
      .post("/api/auth/register/send-otp")
      .send({ email: "not-an-email" });
    expect(res.status).toBe(400);
  });

  test("rate limits the endpoint per email after exceeding the threshold", async () => {
    const email = "ratebeat@example.com";
    let last = null;
    // max is 4 per window; requests 1-4 pass, request 5 is throttled with 429.
    for (let i = 0; i < 5; i++) {
      last = await request(app)
        .post("/api/auth/register/send-otp")
        .send({ email });
    }
    expect(last.status).toBe(429);
    expect(last.body.success).toBe(false);
  });

  test("rate limits many distinct emails from the same IP (enumeration)", async () => {
    // Reset the shared in-memory bucket so this scan runs from a clean slate.
    const { resetRateLimits } = require("../src/middleware/rateLimit.middleware");
    resetRateLimits();
    // Per-IP max is 20/15min. Scanning 21 distinct emails from one IP trips it.
    let last = null;
    for (let i = 0; i < 21; i++) {
      last = await request(app)
        .post("/api/auth/register/send-otp")
        .send({ email: `probe-${i}@example.com` });
    }
    expect(last.status).toBe(429);
    expect(last.body.success).toBe(false);
  });
});

// ───────────────────── REGISTER VERIFY OTP (pre-registration) ──────────────

describe("POST /api/auth/register/verify-otp", () => {
  test("verifies correct OTP and returns a verification ticket (no user exists)", async () => {
    const emailService = require("../src/services/email.service");
    const otpRepo = require("../src/db/repositories/otp.repository");
    const otp = "654321";
    const otpHash = emailService.hashOtp(otp);
    await otpRepo.saveOtp("ticket@example.com", otpHash, Date.now() + 10 * 60 * 1000);

    const res = await request(app)
      .post("/api/auth/register/verify-otp")
      .send({ email: "ticket@example.com", otp });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.verificationTicket).toBeDefined();
    expect(typeof res.body.data.verificationTicket).toBe("string");

    // No user should exist yet, and the OTP should be consumed.
    const User = require("../src/db/models/user.model");
    expect(await User.findOne({ email: "ticket@example.com" })).toBeNull();
    expect(await otpRepo.findOtp("ticket@example.com")).toBeNull();
  });

  test("rejects incorrect OTP", async () => {
    const emailService = require("../src/services/email.service");
    const otpRepo = require("../src/db/repositories/otp.repository");
    const otpHash = emailService.hashOtp("123456");
    await otpRepo.saveOtp("wrongticket@example.com", otpHash, Date.now() + 10 * 60 * 1000);

    const res = await request(app)
      .post("/api/auth/register/verify-otp")
      .send({ email: "wrongticket@example.com", otp: "000000" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid verification code/i);
  });

  test("rejects expired OTP", async () => {
    const emailService = require("../src/services/email.service");
    const otpRepo = require("../src/db/repositories/otp.repository");
    const otpHash = emailService.hashOtp("123456");
    await otpRepo.saveOtp("expiredreg@example.com", otpHash, Date.now() - 1000);

    const res = await request(app)
      .post("/api/auth/register/verify-otp")
      .send({ email: "expiredreg@example.com", otp: "123456" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/otp expired/i);
  });

  test("rejects missing fields", async () => {
    const res = await request(app)
      .post("/api/auth/register/verify-otp")
      .send({ email: "test@example.com" });
    expect(res.status).toBe(400);
  });

  test("enforces max OTP attempts", async () => {
    const emailService = require("../src/services/email.service");
    const otpRepo = require("../src/db/repositories/otp.repository");
    const otpHash = emailService.hashOtp("123456");
    await otpRepo.saveOtp("maxreg@example.com", otpHash, Date.now() + 10 * 60 * 1000);

    for (let i = 0; i < 5; i++) {
      await request(app)
        .post("/api/auth/register/verify-otp")
        .send({ email: "maxreg@example.com", otp: "000000" });
    }

    const res = await request(app)
      .post("/api/auth/register/verify-otp")
      .send({ email: "maxreg@example.com", otp: "000000" });
    expect(res.status).toBe(400);
  });

  test("rate limits OTP guessing attempts per email after exceeding the threshold", async () => {
    const email = "verifyrate@example.com";
    let last = null;
    // max is 10 per window; requests 1-10 pass validation checks, request 11 is
    // throttled with 429 before reaching the controller.
    for (let i = 0; i < 11; i++) {
      last = await request(app)
        .post("/api/auth/register/verify-otp")
        .send({ email, otp: "000000" });
    }
    expect(last.status).toBe(429);
    expect(last.body.success).toBe(false);
  });

  test("rate limits many distinct emails from the same IP (scanning)", async () => {
    const { resetRateLimits } = require("../src/middleware/rateLimit.middleware");
    resetRateLimits();
    // Per-IP max is 30/15min. Scanning 31 distinct emails from one IP trips it.
    let last = null;
    for (let i = 0; i < 31; i++) {
      last = await request(app)
        .post("/api/auth/register/verify-otp")
        .send({ email: `verify-probe-${i}@example.com`, otp: "000000" });
    }
    expect(last.status).toBe(429);
    expect(last.body.success).toBe(false);
  });
});

// ───────────────────── REGISTER with verification ticket ───────────────────

describe("POST /api/auth/register (verification ticket branch)", () => {
  test("creates a verified user and returns a login token with a valid ticket", async () => {
    const security = require("../src/core/security");
    const ticket = security.generateVerificationTicket("ticketuser@example.com");

    const res = await request(app)
      .post("/api/auth/register")
      .send({
        email: "ticketuser@example.com",
        password: "StrongPass1!",
        firstName: "Ticked",
        lastName: "User",
        verificationTicket: ticket,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(typeof res.body.data.token).toBe("string");
    expect(res.body.data.user.emailVerified).toBe(true);
    expect(res.body.data.user.email).toBe("ticketuser@example.com");
    expect(res.body.data.user.firstName).toBe("Ticked");
    expect(res.body.data.user.lastName).toBe("User");
  });

  test("rejects an expired ticket", async () => {
    const jwt = require("jsonwebtoken");
    const config = require("../src/core/config");
    const expiredTicket = jwt.sign(
      { purpose: "registration_email_verified", email: "expiredticket@example.com" },
      config.jwtSecret,
      { expiresIn: "-1s" }
    );

    const res = await request(app)
      .post("/api/auth/register")
      .send({
        email: "expiredticket@example.com",
        password: "StrongPass1!",
        verificationTicket: expiredTicket,
      });

    expect(res.status).toBe(400);
  });

  test("rejects a tampered/garbage ticket", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({
        email: "tampered@example.com",
        password: "StrongPass1!",
        verificationTicket: "not-a-real-token",
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/expired or invalid/i);
  });

  test("rejects a ticket whose email does not match the submitted email", async () => {
    const security = require("../src/core/security");
    const ticket = security.generateVerificationTicket("other-email@example.com");

    const res = await request(app)
      .post("/api/auth/register")
      .send({
        email: "mismatch@example.com",
        password: "StrongPass1!",
        verificationTicket: ticket,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/expired or invalid/i);
  });

  test("falls back to old behavior when no ticket is provided", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "noticket@example.com", password: "StrongPass1!" });

    expect(res.status).toBe(201);
    expect(res.body.data.user.emailVerified).toBe(false);
    expect(res.body.data.token).toBeUndefined();
  });
});
