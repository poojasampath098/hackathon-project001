const Otp = require("../models/otp.model");

const DEFAULT_PURPOSE = "EMAIL_VERIFICATION";

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

// saveOtp supersedes any previous code for the same email + purpose, so a new
// OTP always invalidates the old one within a flow. Email-verification codes
// and password-reset codes live alongside each other without clobbering.
async function saveOtp(email, otpHash, expiresAt, purpose = DEFAULT_PURPOSE) {
  const normalized = normalizeEmail(email);
  await Otp.deleteMany({ email: normalized, purpose });
  const doc = await Otp.create({
    email: normalized,
    purpose,
    otpHash,
    expiresAt: new Date(expiresAt),
  });
  return doc.toObject();
}

async function findOtp(email, purpose = DEFAULT_PURPOSE) {
  const normalized = normalizeEmail(email);
  const doc = await Otp.findOne({ email: normalized, purpose });
  return doc ? doc.toObject() : null;
}

async function deleteOtp(email, purpose = DEFAULT_PURPOSE) {
  const normalized = normalizeEmail(email);
  await Otp.deleteMany({ email: normalized, purpose });
}

// Deletes every OTP record for an email regardless of purpose — used after a
// password reset so no outstanding reset/verification code can outlive it.
async function deleteOtpByEmail(email) {
  const normalized = normalizeEmail(email);
  await Otp.deleteMany({ email: normalized });
}

async function incrementAttempts(email, purpose = DEFAULT_PURPOSE) {
  const normalized = normalizeEmail(email);
  const doc = await Otp.findOneAndUpdate(
    { email: normalized, purpose },
    { $inc: { attempts: 1 } },
    { returnDocument: "after" }
  );
  return doc ? doc.toObject() : null;
}

module.exports = { saveOtp, findOtp, deleteOtp, deleteOtpByEmail, incrementAttempts };