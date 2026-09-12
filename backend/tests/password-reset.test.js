const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const express = require("express");
const request = require("supertest");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const errorHandler = require("../src/middleware/error.middleware");
const resetRateLimits = require("../src/middleware/rateLimit.middleware").resetRateLimits;

// Keep generateOtp/hashOtp real but stub the actual SMTP send so OTP requests
// never attempt a real network connection during tests.
jest.mock("../src/services/email.service", () => {
  const actual = jest.requireActual("../src/services/email.service");
  return {
    ...actual,
    sendVerificationOtpEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetOtpEmail: jest.fn().mockResolvedValue(undefined),
  };
});

const OTP_PURPOSE_EMAIL = "EMAIL_VERIFICATION";
const OTP_PURPOSE_RESET = "PASSWORD_RESET";

let mongoServer;
let app;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);

  app = express();
  app.use(express.json());

  const authRoutes = require("../src/routes/auth.routes");
  app.use("/api/auth", authRoutes);

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
  resetRateLimits();
});

async function createVerifiedUser(email = "reset@example.com", password = "OldPass123!") {
  const User = require("../src/db/models/user.model");
  const passwordHash = await bcrypt.hash(password, 10);
  return User.create({ email, passwordHash, emailVerified: true });
}

function seedOtp(email, otp, purpose, expiresInMs = 10 * 60 * 1000) {
  const emailService = require("../src/services/email.service");
  const otpRepo = require("../src/db/repositories/otp.repository");
  return otpRepo.saveOtp(email, emailService.hashOtp(otp), Date.now() + expiresInMs, purpose);
}

// ───────────────────── REQUEST OTP ────────────────────────────────

describe("POST /api/auth/password-reset/request-otp", () => {
  test("sends a PASSWORD_RESET OTP for a registered email (no enumeration leak)", async () => {
    await createVerifiedUser("req@example.com");

    const res = await request(app)
      .post("/api/auth/password-reset/request-otp")
      .send({ email: "req@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Generic response — does not confirm the account exists explicitly.
    expect(res.body.message).toMatch(/if an account exists/i);

    const otpRepo = require("../src/db/repositories/otp.repository");
    const stored = await otpRepo.findOtp("req@example.com", OTP_PURPOSE_RESET);
    expect(stored).toBeTruthy();
    expect(stored.otpHash).toBeDefined();
    expect(stored.purpose).toBe(OTP_PURPOSE_RESET);
  });

  test("returns the same generic message for an unknown email and stores nothing", async () => {
    const res = await request(app)
      .post("/api/auth/password-reset/request-otp")
      .send({ email: "ghost@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/if an account exists/i);

    const otpRepo = require("../src/db/repositories/otp.repository");
    expect(await otpRepo.findOtp("ghost@example.com", OTP_PURPOSE_RESET)).toBeNull();
  });

  test("does not reveal the OTP in the response body", async () => {
    await createVerifiedUser("nosecret@example.com");
    const emailService = require("../src/services/email.service");
    const spy = jest
      .spyOn(emailService, "generateOtp")
      .mockReturnValueOnce("123456");

    const res = await request(app)
      .post("/api/auth/password-reset/request-otp")
      .send({ email: "nosecret@example.com" });

    spy.mockRestore();
    expect(String(JSON.stringify(res.body))).not.toContain("123456");
  });

  test("rejects missing email", async () => {
    const res = await request(app)
      .post("/api/auth/password-reset/request-otp")
      .send({});
    expect(res.status).toBe(400);
  });

  test("rejects invalid email format", async () => {
    const res = await request(app)
      .post("/api/auth/password-reset/request-otp")
      .send({ email: "not-an-email" });
    expect(res.status).toBe(400);
  });

  test("rate limits repeated requests for the same email", async () => {
    const email = "ratepw@example.com";
    await createVerifiedUser(email);
    let last = null;
    // Max is 4 per window; request 5 is throttled with 429.
    for (let i = 0; i < 5; i++) {
      last = await request(app)
        .post("/api/auth/password-reset/request-otp")
        .send({ email });
    }
    expect(last.status).toBe(429);
    expect(last.body.success).toBe(false);
  });
});

// ───────────────────── VERIFY OTP ────────────────────────────────

describe("POST /api/auth/password-reset/verify-otp", () => {
  test("verifies correct OTP and returns a reset authorization ticket", async () => {
    await createVerifiedUser("verifypw@example.com");
    await seedOtp("verifypw@example.com", "654321", OTP_PURPOSE_RESET);

    const res = await request(app)
      .post("/api/auth/password-reset/verify-otp")
      .send({ email: "verifypw@example.com", otp: "654321" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.resetTicket).toBeDefined();
    expect(typeof res.body.data.resetTicket).toBe("string");

    // OTP is consumed (single-use).
    const otpRepo = require("../src/db/repositories/otp.repository");
    expect(await otpRepo.findOtp("verifypw@example.com", OTP_PURPOSE_RESET)).toBeNull();
  });

  test("rejects an incorrect OTP", async () => {
    await createVerifiedUser("wrongpw@example.com");
    await seedOtp("wrongpw@example.com", "111111", OTP_PURPOSE_RESET);

    const res = await request(app)
      .post("/api/auth/password-reset/verify-otp")
      .send({ email: "wrongpw@example.com", otp: "999999" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid verification code/i);
  });

  test("rejects an expired OTP", async () => {
    await createVerifiedUser("exppw@example.com");
    await seedOtp("exppw@example.com", "222222", OTP_PURPOSE_RESET, -1000);

    const res = await request(app)
      .post("/api/auth/password-reset/verify-otp")
      .send({ email: "exppw@example.com", otp: "222222" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/otp expired/i);
  });

  test("cannot reuse an already-used OTP", async () => {
    await createVerifiedUser("reusepw@example.com");
    await seedOtp("reusepw@example.com", "333333", OTP_PURPOSE_RESET);

    const first = await request(app)
      .post("/api/auth/password-reset/verify-otp")
      .send({ email: "reusepw@example.com", otp: "333333" });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post("/api/auth/password-reset/verify-otp")
      .send({ email: "reusepw@example.com", otp: "333333" });
    expect(second.status).toBe(400);
  });

  test("a new OTP invalidates the previous one (resend behavior)", async () => {
    await createVerifiedUser("resendpw@example.com");
    await seedOtp("resendpw@example.com", "444444", OTP_PURPOSE_RESET);
    // Simulate a resend: saving a new OTP for the same email+purpose.
    await seedOtp("resendpw@example.com", "555555", OTP_PURPOSE_RESET);

    const old = await request(app)
      .post("/api/auth/password-reset/verify-otp")
      .send({ email: "resendpw@example.com", otp: "444444" });
    expect(old.status).toBe(400);

    const latest = await request(app)
      .post("/api/auth/password-reset/verify-otp")
      .send({ email: "resendpw@example.com", otp: "555555" });
    expect(latest.status).toBe(200);
  });

  test("rejects a registration OTP used as a password-reset OTP (purpose isolation)", async () => {
    await createVerifiedUser("isolated@example.com");
    // Only an EMAIL_VERIFICATION code exists (as registration would create).
    await seedOtp("isolated@example.com", "777777", OTP_PURPOSE_EMAIL);

    const res = await request(app)
      .post("/api/auth/password-reset/verify-otp")
      .send({ email: "isolated@example.com", otp: "777777" });

    expect(res.status).toBe(400);
  });

  test("rejects malformed or missing OTP fields", async () => {
    await createVerifiedUser("malformed@example.com");
    const missing = await request(app)
      .post("/api/auth/password-reset/verify-otp")
      .send({ email: "malformed@example.com" });
    expect(missing.status).toBe(400);

    const short = await request(app)
      .post("/api/auth/password-reset/verify-otp")
      .send({ email: "malformed@example.com", otp: "123" });
    expect(short.status).toBe(400);
  });

  test("locks after too many invalid attempts", async () => {
    await createVerifiedUser("lockpw@example.com");
    await seedOtp("lockpw@example.com", "888888", OTP_PURPOSE_RESET);

    let last = null;
    for (let i = 0; i < 5; i++) {
      last = await request(app)
        .post("/api/auth/password-reset/verify-otp")
        .send({ email: "lockpw@example.com", otp: "000000" });
    }
    expect(last.status).toBe(400);
    expect(last.body.message).toMatch(/too many invalid attempts/i);

    // OTP is consumed once the attempt ceiling is hit.
    const otpRepo = require("../src/db/repositories/otp.repository");
    expect(await otpRepo.findOtp("lockpw@example.com", OTP_PURPOSE_RESET)).toBeNull();
  });
});

// ───────────────────── RESET PASSWORD ────────────────────────────

async function obtainTicket(email) {
  const verifyRes = await request(app)
    .post("/api/auth/password-reset/verify-otp")
    .send({ email, otp: "654321" });
  return verifyRes.status === 200 ? verifyRes.body.data.resetTicket : null;
}

describe("POST /api/auth/password-reset/reset", () => {
  test("resets password and allows login with the new password only", async () => {
    await createVerifiedUser("resetpw@example.com", "OldPass123!");
    await seedOtp("resetpw@example.com", "654321", OTP_PURPOSE_RESET);
    const ticket = await obtainTicket("resetpw@example.com");
    expect(ticket).toBeTruthy();

    const res = await request(app)
      .post("/api/auth/password-reset/reset")
      .send({ email: "resetpw@example.com", resetTicket: ticket, newPassword: "NewPass456!", confirmPassword: "NewPass456!" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const oldLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "resetpw@example.com", password: "OldPass123!" });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "resetpw@example.com", password: "NewPass456!" });
    expect(newLogin.status).toBe(200);
    expect(newLogin.body.data.token).toBeDefined();
  });

  test("rejects reset without a verified authorization (no ticket)", async () => {
    await createVerifiedUser("noticket@example.com");

    const res = await request(app)
      .post("/api/auth/password-reset/reset")
      .send({ email: "noticket@example.com", newPassword: "NewPass456!", confirmPassword: "NewPass456!" });

    expect(res.status).toBe(400);
  });

  test("rejects a tampered/garbage ticket", async () => {
    await createVerifiedUser("tampered@example.com");

    const res = await request(app)
      .post("/api/auth/password-reset/reset")
      .send({ email: "tampered@example.com", resetTicket: "not-a-real-ticket", newPassword: "NewPass456!", confirmPassword: "NewPass456!" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/session expired or invalid/i);
  });

  test("rejects an expired ticket", async () => {
    const config = require("../src/core/config");
    await createVerifiedUser("expiredticket@example.com");
    const expiredTicket = jwt.sign(
      { purpose: "password_reset", userId: "000000000000000000000001", email: "expiredticket@example.com" },
      config.jwtSecret,
      { expiresIn: "-1s" }
    );

    const res = await request(app)
      .post("/api/auth/password-reset/reset")
      .send({ email: "expiredticket@example.com", resetTicket: expiredTicket, newPassword: "NewPass456!", confirmPassword: "NewPass456!" });

    expect(res.status).toBe(400);
  });

  test("rejects a ticket bound to a different email", async () => {
    await createVerifiedUser("ownerpw@example.com");
    await createVerifiedUser("otherpw@example.com");
    await seedOtp("ownerpw@example.com", "654321", OTP_PURPOSE_RESET);
    const ticket = await obtainTicket("ownerpw@example.com");

    const res = await request(app)
      .post("/api/auth/password-reset/reset")
      .send({ email: "otherpw@example.com", resetTicket: ticket, newPassword: "NewPass456!", confirmPassword: "NewPass456!" });

    expect(res.status).toBe(400);
  });

  test("rejects mismatched confirm password", async () => {
    await createVerifiedUser("mismatchpw@example.com");
    await seedOtp("mismatchpw@example.com", "654321", OTP_PURPOSE_RESET);
    const ticket = await obtainTicket("mismatchpw@example.com");

    const res = await request(app)
      .post("/api/auth/password-reset/reset")
      .send({ email: "mismatchpw@example.com", resetTicket: ticket, newPassword: "NewPass456!", confirmPassword: "Different!" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/do not match/i);
  });

  test("rejects a weak (too short) new password", async () => {
    await createVerifiedUser("weakpw@example.com");
    await seedOtp("weakpw@example.com", "654321", OTP_PURPOSE_RESET);
    const ticket = await obtainTicket("weakpw@example.com");

    const res = await request(app)
      .post("/api/auth/password-reset/reset")
      .send({ email: "weakpw@example.com", resetTicket: ticket, newPassword: "short", confirmPassword: "short" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/at least 8 characters/i);
  });

  test("a reset ticket cannot be reused to reset the password twice", async () => {
    await createVerifiedUser("onetime@example.com");
    await seedOtp("onetime@example.com", "654321", OTP_PURPOSE_RESET);
    const ticket = await obtainTicket("onetime@example.com");

    const first = await request(app)
      .post("/api/auth/password-reset/reset")
      .send({ email: "onetime@example.com", resetTicket: ticket, newPassword: "NewPass456!", confirmPassword: "NewPass456!" });
    expect(first.status).toBe(200);

    const replay = await request(app)
      .post("/api/auth/password-reset/reset")
      .send({ email: "onetime@example.com", resetTicket: ticket, newPassword: "ThirdPass789!", confirmPassword: "ThirdPass789!" });
    expect(replay.status).toBe(400);

    // Password remains the first reset value (replay had no effect).
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "onetime@example.com", password: "NewPass456!" });
    expect(login.status).toBe(200);
  });

  test("does not expose password hashes or reset secrets in responses", async () => {
    await createVerifiedUser("nosecretpw@example.com");
    await seedOtp("nosecretpw@example.com", "654321", OTP_PURPOSE_RESET);
    const ticket = await obtainTicket("nosecretpw@example.com");

    const res = await request(app)
      .post("/api/auth/password-reset/reset")
      .send({ email: "nosecretpw@example.com", resetTicket: ticket, newPassword: "NewPass456!", confirmPassword: "NewPass456!" });

    const jsonStr = JSON.stringify(res.body);
    expect(jsonStr).not.toContain("passwordHash");
    expect(jsonStr).not.toContain("654321");
    expect(jsonStr).not.toContain("NewPass456!");
  });

  test("rate limits password reset attempts per IP", async () => {
    const User = require("../src/db/models/user.model");
    await createVerifiedUser("ratelimitpw@example.com");
    // Invalid ticket requests will be rejected by the controller; the limiter
    // trips on the 21st identical request.
    let last = null;
    for (let i = 0; i < 21; i++) {
      last = await request(app)
        .post("/api/auth/password-reset/reset")
        .send({ email: "ratelimitpw@example.com", resetTicket: "bad", newPassword: "NewPass456!", confirmPassword: "NewPass456!" });
    }
    expect(last.status).toBe(429);

    // Password was never changed by the brute-force attempts.
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "ratelimitpw@example.com", password: "OldPass123!" });
    expect(login.status).toBe(200);
  });
});