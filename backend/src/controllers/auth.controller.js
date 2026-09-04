const {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateVerificationTicket,
  verifyVerificationTicket,
} = require("../core/security");
const User = require("../db/models/user.model");
const userRepo = require("../db/repositories/user.repository");
const otpRepo = require("../db/repositories/otp.repository");
const emailService = require("../services/email.service");
const activityService = require("../services/activity.service");
const logger = require("../core/logger");

const MAX_OTP_ATTEMPTS = 5;

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function register(req, res, next) {
  try {
    const { email, password, firstName, lastName, verificationTicket } = req.body;

    if (!email || !password) {
      const err = new Error("Invalid email or password");
      err.statusCode = 400;
      return next(err);
    }

    const normalizedEmail = normalizeEmail(email);

    if (!isValidEmail(normalizedEmail)) {
      const err = new Error("Invalid email or password");
      err.statusCode = 400;
      return next(err);
    }

    if (password.length < 8) {
      const err = new Error("Invalid email or password");
      err.statusCode = 400;
      return next(err);
    }

    const existing = await userRepo.emailExists(normalizedEmail);
    if (existing) {
      const err = new Error("Email already registered");
      err.statusCode = 409;
      return next(err);
    }

    // Optional email-verification ticket from POST /auth/register/verify-otp.
    // When present, the email has already been proven via OTP, so we create an
    // already-verified user and issue a real login token immediately (no OTP
    // round-trip after registration). When absent, we fall back to the original
    // flow: create an unverified user and auto-send an OTP.
    let emailVerified = false;
    if (verificationTicket) {
      const ticket = verifyVerificationTicket(verificationTicket);
      if (!ticket.email || normalizeEmail(ticket.email) !== normalizedEmail) {
        const err = new Error("Email verification expired or invalid — please verify your email again");
        err.statusCode = 400;
        return next(err);
      }
      emailVerified = true;
    }

    const passwordHash = await hashPassword(password);
    const user = await userRepo.createUser({
      email: normalizedEmail,
      passwordHash,
      firstName: typeof firstName === "string" ? firstName.trim() : "",
      lastName: typeof lastName === "string" ? lastName.trim() : "",
      emailVerified,
    });

    activityService.logActivity(
      user.id, "user_registered", null,
      `User registered`,
      { email: normalizedEmail }
    ).catch(() => {});

    if (!emailVerified) {
      // Backward-compatible fallback (no verification ticket): send OTP and
      // return the unverified user object, matching the original shape.
      const otp = emailService.generateOtp();
      const otpHash = emailService.hashOtp(otp);
      const expiresAt = Date.now() + emailService.OTP_EXPIRY_MS;
      await otpRepo.saveOtp(normalizedEmail, otpHash, expiresAt);

      try {
        await emailService.sendVerificationOtpEmail(normalizedEmail, otp);
      } catch (emailErr) {
        logger.error("Failed to send verification email", emailErr);
      }

      return res.status(201).json({
        success: true,
        message: "Registration successful. Verification code sent to your email.",
        data: {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName || "",
            lastName: user.lastName || "",
            emailVerified: false,
          },
        },
      });
    }

    // Email verified via ticket: issue the real login token immediately.
    const token = generateAccessToken({ userId: user.id });

    activityService.logActivity(
      user.id, "user_logged_in", null,
      `Email verified and logged in`,
      { email: normalizedEmail }
    ).catch(() => {});

    res.status(200).json({
      success: true,
      message: "Registration successful",
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName || "",
          lastName: user.lastName || "",
          emailVerified: true,
        },
        token,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      const err = new Error("Invalid email or password");
      err.statusCode = 401;
      return next(err);
    }

    const normalizedEmail = normalizeEmail(email);
    const user = await userRepo.findUserByEmail(normalizedEmail);

    if (!user) {
      const err = new Error("Invalid email or password");
      err.statusCode = 401;
      return next(err);
    }

    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      const err = new Error("Invalid email or password");
      err.statusCode = 401;
      return next(err);
    }

    if (!user.emailVerified) {
      const err = new Error("Please verify your email before logging in");
      err.statusCode = 403;
      return next(err);
    }

    const token = generateAccessToken({ userId: user.id });

    activityService.logActivity(
      user.id, "user_logged_in", null,
      `User logged in`,
      { email: normalizedEmail }
    ).catch(() => {});

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName || "",
          lastName: user.lastName || "",
          emailVerified: true,
        },
        token,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const user = await User.findOne({ _id: req.user.userId, isDeleted: { $ne: true } }).select("-passwordHash");
    if (!user) {
      const err = new Error("User not found");
      err.statusCode = 404;
      return next(err);
    }

    res.status(200).json({
      success: true,
      data: { user: user.toJSON() },
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

async function sendOtp(req, res, next) {
  try {
    const { email } = req.body;

    if (!email) {
      const err = new Error("Email is required");
      err.statusCode = 400;
      return next(err);
    }

    const normalizedEmail = normalizeEmail(email);

    if (!isValidEmail(normalizedEmail)) {
      const err = new Error("Invalid email format");
      err.statusCode = 400;
      return next(err);
    }

    const user = await userRepo.findUserByEmail(normalizedEmail);

    if (!user) {
      return res.status(200).json({
        success: true,
        message: "If the email is registered, a verification code has been sent",
      });
    }

    if (user.emailVerified) {
      const err = new Error("Email is already verified");
      err.statusCode = 400;
      return next(err);
    }

    const otp = emailService.generateOtp();
    const otpHash = emailService.hashOtp(otp);
    const expiresAt = Date.now() + emailService.OTP_EXPIRY_MS;
    await otpRepo.saveOtp(normalizedEmail, otpHash, expiresAt);

    try {
      await emailService.sendVerificationOtpEmail(normalizedEmail, otp);
    } catch (emailErr) {
      logger.error("Failed to send OTP email", emailErr);
    }

    res.status(200).json({
      success: true,
      message: "Verification code sent to your email",
    });
  } catch (err) {
    next(err);
  }
}

async function verifyOtp(req, res, next) {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      const err = new Error("Email and verification code are required");
      err.statusCode = 400;
      return next(err);
    }

    const normalizedEmail = normalizeEmail(email);

    const user = await userRepo.findUserByEmail(normalizedEmail);
    if (!user) {
      const err = new Error("Invalid verification code");
      err.statusCode = 400;
      return next(err);
    }

    const stored = await otpRepo.findOtp(normalizedEmail);
    if (!stored) {
      const err = new Error("OTP expired or not found. Request a new verification code.");
      err.statusCode = 400;
      return next(err);
    }

    if (Date.now() > stored.expiresAt) {
      await otpRepo.deleteOtp(normalizedEmail);
      const err = new Error("OTP expired");
      err.statusCode = 400;
      return next(err);
    }

    if (stored.attempts >= MAX_OTP_ATTEMPTS) {
      await otpRepo.deleteOtp(normalizedEmail);
      const err = new Error("Too many invalid attempts. Request a new verification code.");
      err.statusCode = 400;
      return next(err);
    }

    const otpHash = emailService.hashOtp(otp);
    if (otpHash !== stored.otpHash) {
      await otpRepo.incrementAttempts(normalizedEmail);
      const updated = await otpRepo.findOtp(normalizedEmail);
      if (updated && updated.attempts >= MAX_OTP_ATTEMPTS) {
        await otpRepo.deleteOtp(normalizedEmail);
        const err = new Error("Too many invalid attempts. Request a new verification code.");
        err.statusCode = 400;
        return next(err);
      }
      const err = new Error("Invalid verification code");
      err.statusCode = 400;
      return next(err);
    }

    await userRepo.markEmailVerified(user.id);
    await otpRepo.deleteOtp(normalizedEmail);

    activityService.logActivity(
      user.id, "user_logged_in", null,
      `Email verified and logged in`,
      { email: normalizedEmail }
    ).catch(() => {});

    const token = generateAccessToken({ userId: user.id });

    res.status(200).json({
      success: true,
      message: "Email verified successfully",
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName || "",
          lastName: user.lastName || "",
          emailVerified: true,
        },
        token,
      },
    });
  } catch (err) {
    next(err);
  }
}

// Pre-registration OTP: sends a verification code to an email address that has
// not yet had an account created. The OTP repo is keyed purely by email, so no
// user record is required. Duplicate/registered emails are rejected up front so
// the user can go log in instead of completing an OTP flow that will fail.
async function sendRegistrationOtp(req, res, next) {
  try {
    const { email } = req.body;

    if (!email || typeof email !== "string") {
      const err = new Error("Email is required");
      err.statusCode = 400;
      return next(err);
    }

    const normalizedEmail = normalizeEmail(email);

    if (!isValidEmail(normalizedEmail)) {
      const err = new Error("Invalid email format");
      err.statusCode = 400;
      return next(err);
    }

    const exists = await userRepo.emailExists(normalizedEmail);
    if (exists) {
      const err = new Error("Email already registered");
      err.statusCode = 409;
      return next(err);
    }

    const otp = emailService.generateOtp();
    const otpHash = emailService.hashOtp(otp);
    const expiresAt = Date.now() + emailService.OTP_EXPIRY_MS;
    await otpRepo.saveOtp(normalizedEmail, otpHash, expiresAt);

    try {
      await emailService.sendVerificationOtpEmail(normalizedEmail, otp);
    } catch (emailErr) {
      // Swallow + log, matching the existing sendOtp behavior so a transient
      // SMTP failure doesn't leak or break the anti-enumeration response shape.
      logger.error("Failed to send registration OTP email", emailErr);
    }

    res.status(200).json({
      success: true,
      message: "Verification code sent",
    });
  } catch (err) {
    next(err);
  }
}

// Verifies a pre-registration OTP (no user record expected to exist yet) and,
// on success, issues a short-lived, single-purpose email-verification ticket.
// This ticket proves email ownership only — it is not a login token.
async function verifyRegistrationOtp(req, res, next) {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      const err = new Error("Email and verification code are required");
      err.statusCode = 400;
      return next(err);
    }

    const normalizedEmail = normalizeEmail(email);

    const stored = await otpRepo.findOtp(normalizedEmail);
    if (!stored) {
      const err = new Error("OTP expired or not found. Request a new verification code.");
      err.statusCode = 400;
      return next(err);
    }

    if (Date.now() > stored.expiresAt) {
      await otpRepo.deleteOtp(normalizedEmail);
      const err = new Error("OTP expired");
      err.statusCode = 400;
      return next(err);
    }

    if (stored.attempts >= MAX_OTP_ATTEMPTS) {
      await otpRepo.deleteOtp(normalizedEmail);
      const err = new Error("Too many invalid attempts. Request a new verification code.");
      err.statusCode = 400;
      return next(err);
    }

    const otpHash = emailService.hashOtp(otp);
    if (otpHash !== stored.otpHash) {
      await otpRepo.incrementAttempts(normalizedEmail);
      const updated = await otpRepo.findOtp(normalizedEmail);
      if (updated && updated.attempts >= MAX_OTP_ATTEMPTS) {
        await otpRepo.deleteOtp(normalizedEmail);
        const err = new Error("Too many invalid attempts. Request a new verification code.");
        err.statusCode = 400;
        return next(err);
      }
      const err = new Error("Invalid verification code");
      err.statusCode = 400;
      return next(err);
    }

    await otpRepo.deleteOtp(normalizedEmail);
    const verificationTicket = generateVerificationTicket(normalizedEmail);

    res.status(200).json({
      success: true,
      message: "Email verified successfully",
      data: { verificationTicket },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, logout, me, sendOtp, verifyOtp, sendRegistrationOtp, verifyRegistrationOtp };
