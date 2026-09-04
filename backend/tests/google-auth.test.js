process.env.JWT_SECRET = "test-jwt-secret-google";
process.env.GOOGLE_CLIENT_ID = "test-client-id-google";

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const express = require("express");
const request = require("supertest");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// Fully mock google-auth-library so controller/service tests never hit the
// network. The library's OAuth2Client.verifyIdToken is the trust boundary for
// signature/issuer/audience/expiry; here each test controls its behavior.
jest.mock("google-auth-library", () => ({
  OAuth2Client: jest.fn(),
}));

const { OAuth2Client } = require("google-auth-library");
const config = require("../src/core/config");
const User = require("../src/db/models/user.model");
const authRoutes = require("../src/routes/auth.routes");
const googleService = require("../src/services/google.service");

// The verified profile a successful Google ID token yields.
const profile = {
  email: "fresh@gmail.com",
  email_verified: true,
  given_name: "New",
  family_name: "Google",
  picture: "https://img.google/fresh.png",
  sub: "google-sub-1",
};

// The client instance returned by the mocked OAuth2Client constructor (the
// service's "new OAuth2Client(...)"), captured so tests can assert how the
// service drives verifyIdToken.
let lastClient;

function mockVerifySuccess(payload = profile) {
  OAuth2Client.mockImplementation(() => {
    lastClient = {
      verifyIdToken: jest.fn().mockResolvedValue({ getPayload: () => ({ ...payload }) }),
    };
    return lastClient;
  });
}

function mockVerifyFailure(error) {
  OAuth2Client.mockImplementation(() => {
    lastClient = {
      verifyIdToken: jest.fn().mockRejectedValue(error),
    };
    return lastClient;
  });
}

let mongoServer;
let app;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  app = express();
  app.use(express.json());
  app.use("/api/auth", authRoutes);
  app.use((req, res) => {
    res.status(404).json({ success: false, message: "Not found" });
  });
  app.use(require("../src/middleware/error.middleware"));
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

beforeEach(async () => {
  const { resetRateLimits } = require("../src/middleware/rateLimit.middleware");
  resetRateLimits();
  OAuth2Client.mockClear();
  for (const key in mongoose.connection.collections) {
    await mongoose.connection.collections[key].deleteMany({});
  }
});

// ───────────────────── POST /api/auth/google (ID-token sign-in) ──

describe("POST /api/auth/google", () => {
  test("returns 503 with a clear message when GOOGLE_CLIENT_ID is not configured", async () => {
    const originalClientId = config.googleClientId;
    config.googleClientId = undefined;
    try {
      const res = await request(app)
        .post("/api/auth/google")
        .send({ credential: "some-id-token" });

      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/not configured/i);
      expect(res.body.message).toContain("GOOGLE_CLIENT_ID");
      expect(res.body.data).toBeUndefined();
    } finally {
      config.googleClientId = originalClientId;
    }
  });

  test("returns 400 when the credential (ID token) is missing", async () => {
    const res = await request(app).post("/api/auth/google").send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/token is missing/i);
    expect(await User.countDocuments()).toBe(0);
  });

  test("verification failure maps to a clear 401, never a 500", async () => {
    // google-auth-library throws for expired/tampered/wrong-audience tokens.
    mockVerifyFailure(new Error("Token used too late"));

    const res = await request(app)
      .post("/api/auth/google")
      .send({ credential: "tampered-or-expired-token" });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/invalid or expired/i);
    expect(await User.countDocuments()).toBe(0);
  });

  test("rejects a token whose Google email is not verified", async () => {
    mockVerifySuccess({ ...profile, email_verified: false });

    const res = await request(app)
      .post("/api/auth/google")
      .send({ credential: "unverified-email-token" });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/not verified/i);
    expect(await User.countDocuments()).toBe(0);
  });

  test("creates a new verified user and returns the same session shape as login", async () => {
    mockVerifySuccess();

    const res = await request(app)
      .post("/api/auth/google")
      .send({ credential: "google-id-token" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe("fresh@gmail.com");
    expect(res.body.data.user.firstName).toBe("New");
    expect(res.body.data.user.lastName).toBe("Google");
    expect(res.body.data.user.avatar).toBe("https://img.google/fresh.png");
    expect(res.body.data.user.emailVerified).toBe(true);
    expect(typeof res.body.data.token).toBe("string");

    // The token is the same real login JWT used everywhere else.
    const payload = jwt.verify(res.body.data.token, process.env.JWT_SECRET);
    expect(payload.userId).toBe(res.body.data.user.id);

    const user = await User.findOne({ email: "fresh@gmail.com" });
    expect(user).not.toBeNull();
    expect(user.emailVerified).toBe(true);
    expect(user.firstName).toBe("New");
    expect(user.lastName).toBe("Google");
    expect(user.avatar).toBe("https://img.google/fresh.png");
    // A Google-only account still has a real (random, unusable) password hash so
    // a password login can never succeed for it.
    expect(user.passwordHash).toBeDefined();
    expect(await bcrypt.compare("Test1234!", user.passwordHash)).toBe(false);
  });

  test("logs in an existing email/password user without touching their password", async () => {
    const passwordHash = await bcrypt.hash("Test1234!", 10);
    await User.create({
      email: "existing@gmail.com",
      passwordHash,
      firstName: "Keep",
      lastName: "Me",
      emailVerified: true,
    });
    mockVerifySuccess({ ...profile, email: "existing@gmail.com" });

    const res = await request(app)
      .post("/api/auth/google")
      .send({ credential: "google-id-token" });

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe("existing@gmail.com");
    expect(res.body.data.user.firstName).toBe("Keep");
    expect(res.body.data.user.lastName).toBe("Me");
    expect(await User.countDocuments({ email: "existing@gmail.com" })).toBe(1);
    const user = await User.findOne({ email: "existing@gmail.com" });
    expect(user.passwordHash).toBe(passwordHash);
  });

  test("upgrades an existing unverified email account to verified after Google login", async () => {
    const passwordHash = await bcrypt.hash("Test1234!", 10);
    await User.create({
      email: "upgrade@gmail.com",
      passwordHash,
      emailVerified: false,
    });
    mockVerifySuccess({ ...profile, email: "upgrade@gmail.com" });

    const res = await request(app)
      .post("/api/auth/google")
      .send({ credential: "google-id-token" });

    expect(res.status).toBe(200);
    const user = await User.findOne({ email: "upgrade@gmail.com" });
    expect(user.emailVerified).toBe(true);
    expect(user.passwordHash).toBe(passwordHash);
  });

  test("does not resurrect a soft-deleted account", async () => {
    const passwordHash = await bcrypt.hash("Test1234!", 10);
    const deleted = await User.create({
      email: "deleted@gmail.com",
      passwordHash,
      emailVerified: true,
    });
    await User.findByIdAndUpdate(deleted._id, { isDeleted: true, deletedAt: new Date() });
    mockVerifySuccess({ ...profile, email: "deleted@gmail.com" });

    const res = await request(app)
      .post("/api/auth/google")
      .send({ credential: "google-id-token" });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/deleted/i);
    expect(await User.countDocuments({ email: "deleted@gmail.com" })).toBe(1);
    const stillDeleted = await User.findOne({ email: "deleted@gmail.com" });
    expect(stillDeleted.isDeleted).toBe(true);
  });

  test("rate-limits unauthenticated Google sign-in attempts per IP", async () => {
    mockVerifySuccess();

    let response;
    for (let i = 0; i < 21; i++) {
      response = await request(app)
        .post("/api/auth/google")
        .send({ credential: `token-${i}` });
    }

    expect(response.status).toBe(429);
    expect(response.body.success).toBe(false);
  });
});

// ───────────────────── google.service.verifyIdToken ─────────────

describe("google.service.verifyIdToken (OAuth2Client usage)", () => {
  test("verifies with the id token and the app client id as the audience", async () => {
    mockVerifySuccess(profile);

    const result = await googleService.verifyIdToken("google-id-token");

    expect(result).toEqual({
      email: "fresh@gmail.com",
      firstName: "New",
      lastName: "Google",
      avatar: "https://img.google/fresh.png",
    });
    expect(OAuth2Client).toHaveBeenCalledWith("test-client-id-google");
    expect(lastClient.verifyIdToken).toHaveBeenCalledWith({
      idToken: "google-id-token",
      audience: "test-client-id-google",
    });
  });

  test("normalizes the email to lowercase", async () => {
    mockVerifySuccess({ ...profile, email: "Mixed.Case@Gmail.com" });

    const result = await googleService.verifyIdToken("google-id-token");
    expect(result.email).toBe("mixed.case@gmail.com");
  });

  test("rejects a token whose email is not verified", async () => {
    mockVerifySuccess({ ...profile, email_verified: false });

    await expect(googleService.verifyIdToken("google-id-token")).rejects.toMatchObject({
      statusCode: 401,
      message: expect.stringMatching(/not verified/i),
    });
  });

  test("wraps google-auth-library failures as a clear 401", async () => {
    mockVerifyFailure(new Error("Invalid token signature: token signature does not match"));

    await expect(googleService.verifyIdToken("bad-token")).rejects.toMatchObject({
      statusCode: 401,
      message: expect.stringMatching(/invalid or expired/i),
    });
  });

  test("throws 503 when no GOOGLE_CLIENT_ID is configured", async () => {
    const originalClientId = config.googleClientId;
    config.googleClientId = undefined;
    try {
      await expect(googleService.verifyIdToken("google-id-token")).rejects.toMatchObject({
        statusCode: 503,
        message: expect.stringMatching(/not configured/i),
      });
    } finally {
      config.googleClientId = originalClientId;
    }
  });
});