const Otp = require("../models/otp.model");

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

async function saveOtp(email, otpHash, expiresAt) {
  const normalized = normalizeEmail(email);
  await Otp.deleteMany({ email: normalized });
  const doc = await Otp.create({
    email: normalized,
    otpHash,
    expiresAt: new Date(expiresAt),
  });
  return doc.toObject();
}

async function findOtp(email) {
  const normalized = normalizeEmail(email);
  const doc = await Otp.findOne({ email: normalized });
  return doc ? doc.toObject() : null;
}

async function deleteOtp(email) {
  const normalized = normalizeEmail(email);
  await Otp.deleteMany({ email: normalized });
}

async function incrementAttempts(email) {
  const normalized = normalizeEmail(email);
  const doc = await Otp.findOneAndUpdate(
    { email: normalized },
    { $inc: { attempts: 1 } },
    { returnDocument: "after" }
  );
  return doc ? doc.toObject() : null;
}

module.exports = { saveOtp, findOtp, deleteOtp, incrementAttempts };
