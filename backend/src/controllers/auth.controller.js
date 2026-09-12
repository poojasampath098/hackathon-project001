const {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateVerificationTicket,
  verifyVerificationTicket,
  generatePasswordResetTicket,
  verifyPasswordResetTicket,
} = require("../core/security");
const User = require("../db/models/user.model");
const userRepo = require("../db/repositories/user.repository");
const otpRepo = require("../db/repositories/otp.repository");
const emailService = require("../services/email.service");
const activityService = require("../services/activity.service");
const logger = require("../core/logger");

const MAX_OTP_ATTEMPTS = 5;
const OTP_PURPOSE_EMAIL = "EMAIL_VERIFICATION";
const OTP_PURPOSE_RESET = "PASSWORD_RESET";

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
      await otpRepo.saveOtp(normalizedEmail, otpHash, expiresAt, OTP_PURPOSE_EMAIL);

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
    await otpRepo.saveOtp(normalizedEmail, otpHash, expiresAt, OTP_PURPOSE_EMAIL);

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

    const stored = await otpRepo.findOtp(normalizedEmail, OTP_PURPOSE_EMAIL);
    if (!stored) {
      const err = new Error("OTP expired or not found. Request a new verification code.");
      err.statusCode = 400;
      return next(err);
    }

    if (Date.now() > stored.expiresAt) {
      await otpRepo.deleteOtp(normalizedEmail, OTP_PURPOSE_EMAIL);
      const err = new Error("OTP expired");
      err.statusCode = 400;
      return next(err);
    }

    if (stored.attempts >= MAX_OTP_ATTEMPTS) {
      await otpRepo.deleteOtp(normalizedEmail, OTP_PURPOSE_EMAIL);
      const err = new Error("Too many invalid attempts. Request a new verification code.");
      err.statusCode = 400;
      return next(err);
    }

    const otpHash = emailService.hashOtp(otp);
    if (otpHash !== stored.otpHash) {
      await otpRepo.incrementAttempts(normalizedEmail, OTP_PURPOSE_EMAIL);
      const updated = await otpRepo.findOtp(normalizedEmail, OTP_PURPOSE_EMAIL);
      if (updated && updated.attempts >= MAX_OTP_ATTEMPTS) {
        await otpRepo.deleteOtp(normalizedEmail, OTP_PURPOSE_EMAIL);
        const err = new Error("Too many invalid attempts. Request a new verification code.");
        err.statusCode = 400;
        return next(err);
      }
      const err = new Error("Invalid verification code");
      err.statusCode = 400;
      return next(err);
    }

    await userRepo.markEmailVerified(user.id);
    await otpRepo.deleteOtp(normalizedEmail, OTP_PURPOSE_EMAIL);

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
    await otpRepo.saveOtp(normalizedEmail, otpHash, expiresAt, OTP_PURPOSE_EMAIL);

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

    const stored = await otpRepo.findOtp(normalizedEmail, OTP_PURPOSE_EMAIL);
    if (!stored) {
      const err = new Error("OTP expired or not found. Request a new verification code.");
      err.statusCode = 400;
      return next(err);
    }

    if (Date.now() > stored.expiresAt) {
      await otpRepo.deleteOtp(normalizedEmail, OTP_PURPOSE_EMAIL);
      const err = new Error("OTP expired");
      err.statusCode = 400;
      return next(err);
    }

    if (stored.attempts >= MAX_OTP_ATTEMPTS) {
      await otpRepo.deleteOtp(normalizedEmail, OTP_PURPOSE_EMAIL);
      const err = new Error("Too many invalid attempts. Request a new verification code.");
      err.statusCode = 400;
      return next(err);
    }

    const otpHash = emailService.hashOtp(otp);
    if (otpHash !== stored.otpHash) {
      await otpRepo.incrementAttempts(normalizedEmail, OTP_PURPOSE_EMAIL);
      const updated = await otpRepo.findOtp(normalizedEmail, OTP_PURPOSE_EMAIL);
      if (updated && updated.attempts >= MAX_OTP_ATTEMPTS) {
        await otpRepo.deleteOtp(normalizedEmail, OTP_PURPOSE_EMAIL);
        const err = new Error("Too many invalid attempts. Request a new verification code.");
        err.statusCode = 400;
        return next(err);
      }
      const err = new Error("Invalid verification code");
      err.statusCode = 400;
      return next(err);
    }

    await otpRepo.deleteOtp(normalizedEmail, OTP_PURPOSE_EMAIL);
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

// Forgot-password step 1: sends a PASSWORD_RESET OTP to the email. Responds
// identically whether or not the account exists so account existence is never
// revealed. The OTP is stored with purpose PASSWORD_RESET so it is isolated
// from email-verification codes and can never authorize a registration.
async function sendPasswordResetOtp(req, res, next) {
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

    // Never reveal whether the email belongs to an account; only send the OTP
    // when the account actually exists.
    const user = await userRepo.findUserByEmail(normalizedEmail);
    if (user) {
      const otp = emailService.generateOtp();
      const otpHash = emailService.hashOtp(otp);
      const expiresAt = Date.now() + emailService.OTP_EXPIRY_MS;
      await otpRepo.saveOtp(normalizedEmail, otpHash, expiresAt, OTP_PURPOSE_RESET);

      try {
        await emailService.sendPasswordResetOtpEmail(normalizedEmail, otp);
      } catch (emailErr) {
        // Swallow + log: a transient SMTP failure must not leak that the
        // account exists (or break the generic response shape).
        logger.error("Failed to send password reset OTP email", emailErr);
      }
    }

    res.status(200).json({
      success: true,
      message: "If an account exists for this email, a verification code has been sent.",
    });
  } catch (err) {
    next(err);
  }
}

// Forgot-password step 2: verifies a PASSWORD_RESET OTP and issues a
// short-lived, single-use password-reset authorization ticket. The ticket is
// NOT a login token and only authorizes the subsequent password change.
async function verifyPasswordResetOtp(req, res, next) {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      const err = new Error("Email and verification code are required");
      err.statusCode = 400;
      return next(err);
    }

    const normalizedEmail = normalizeEmail(email);
    const inputOtp = typeof otp === "string" ? otp.trim() : "";

    if (!inputOtp || !/^\d{6}$/.test(inputOtp)) {
      const err = new Error("Invalid verification code");
      err.statusCode = 400;
      return next(err);
    }

    const stored = await otpRepo.findOtp(normalizedEmail, OTP_PURPOSE_RESET);
    if (!stored) {
      const err = new Error("OTP expired or not found. Request a new verification code.");
      err.statusCode = 400;
      return next(err);
    }

    if (Date.now() > stored.expiresAt) {
      await otpRepo.deleteOtp(normalizedEmail, OTP_PURPOSE_RESET);
      const err = new Error("OTP expired");
      err.statusCode = 400;
      return next(err);
    }

    if (stored.attempts >= MAX_OTP_ATTEMPTS) {
      await otpRepo.deleteOtp(normalizedEmail, OTP_PURPOSE_RESET);
      const err = new Error("Too many invalid attempts. Request a new verification code.");
      err.statusCode = 400;
      return next(err);
    }

    const otpHash = emailService.hashOtp(inputOtp);
    if (otpHash !== stored.otpHash) {
      await otpRepo.incrementAttempts(normalizedEmail, OTP_PURPOSE_RESET);
      const updated = await otpRepo.findOtp(normalizedEmail, OTP_PURPOSE_RESET);
      if (updated && updated.attempts >= MAX_OTP_ATTEMPTS) {
        await otpRepo.deleteOtp(normalizedEmail, OTP_PURPOSE_RESET);
        const err = new Error("Too many invalid attempts. Request a new verification code.");
        err.statusCode = 400;
        return next(err);
      }
      const err = new Error("Invalid verification code");
      err.statusCode = 400;
      return next(err);
    }

    // OTP proven server-side: consume it and issue the reset authorization.
    await otpRepo.deleteOtp(normalizedEmail, OTP_PURPOSE_RESET);

    const user = await userRepo.findUserByEmail(normalizedEmail);
    if (!user) {
      const err = new Error("Invalid verification code");
      err.statusCode = 400;
      return next(err);
    }

    const resetTicket = generatePasswordResetTicket(user.id, user.email);

    res.status(200).json({
      success: true,
      message: "Verification successful",
      data: { resetTicket },
    });
  } catch (err) {
    next(err);
  }
}

// Forgot-password step 3: changes the password only when a valid, unused
// password-reset authorization ticket proves the email was verified. The
// ticket is single-use (enforced via user.passwordChangedAt), so it can never
// be replayed to reset the password again.
async function resetPassword(req, res, next) {
  try {
    const { email, resetTicket, newPassword, confirmPassword } = req.body;

    if (!email || !resetTicket || !newPassword) {
      const err = new Error("Email, reset session, and new password are required");
      err.statusCode = 400;
      return next(err);
    }
    if (typeof newPassword !== "string" || newPassword.length < 8) {
      const err = new Error("Password must be at least 8 characters");
      err.statusCode = 400;
      return next(err);
    }
    if (newPassword !== confirmPassword) {
      const err = new Error("Passwords do not match");
      err.statusCode = 400;
      return next(err);
    }

    const normalizedEmail = normalizeEmail(email);

    // Cryptographic proof that this email went through OTP verification. Any
    // tampered/expired/foreign ticket is rejected before touching the password.
    let ticket;
    try {
      ticket = verifyPasswordResetTicket(resetTicket);
    } catch (ticketErr) {
      return next(ticketErr);
    }

    if (!ticket.email || normalizeEmail(ticket.email) !== normalizedEmail) {
      const err = new Error("Password reset session expired or invalid — please start over");
      err.statusCode = 400;
      return next(err);
    }

    const user = await userRepo.findUserById(ticket.userId);
    if (!user || user.email !== normalizedEmail) {
      const err = new Error("Password reset session expired or invalid — please start over");
      err.statusCode = 400;
      return next(err);
    }

    // Single-use enforcement: a ticket issued before a prior successful reset
    // is already consumed, so replaying it cannot change the password twice.
    if (user.passwordChangedAt && new Date(user.passwordChangedAt).getTime() > ticket.iat * 1000) {
      const err = new Error("Password reset session expired or invalid — please start over");
      err.statusCode = 400;
      return next(err);
    }

    const passwordHash = await hashPassword(newPassword);
    await User.findByIdAndUpdate(user.id, {
      passwordHash,
      passwordChangedAt: new Date(),
    });

    // Invalidate every outstanding OTP for this email (any purpose).
    await otpRepo.deleteOtpByEmail(normalizedEmail);

    try {
      await activityService.logActivity(
        user.id, "user_password_reset", null,
        `Password reset`,
        { email: normalizedEmail }
      );
    } catch (activityErr) {
      logger.warn("Failed to log password reset activity", activityErr);
    }

    res.status(200).json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  login,
  logout,
  me,
  sendOtp,
  verifyOtp,
  sendRegistrationOtp,
  verifyRegistrationOtp,
  sendPasswordResetOtp,
  verifyPasswordResetOtp,
  resetPassword,
};
