const User = require("../models/user.model");

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

async function findUserByEmail(email) {
  const normalized = normalizeEmail(email);
  const user = await User.findOne({ email: normalized, isDeleted: { $ne: true } });
  return user ? user.toObject() : null;
}

async function findUserById(userId) {
  const user = await User.findOne({ _id: userId, isDeleted: { $ne: true } });
  return user ? user.toObject() : null;
}

async function createUser(userData) {
  const user = await User.create({
    email: normalizeEmail(userData.email),
    passwordHash: userData.passwordHash,
    firstName: userData.firstName || "",
    lastName: userData.lastName || "",
    avatar: userData.avatar || null,
    emailVerified: userData.emailVerified === true,
  });
  return user.toObject();
}

async function markEmailVerified(userId) {
  const user = await User.findByIdAndUpdate(
    userId,
    { emailVerified: true },
    { returnDocument: "after" }
  );
  return user ? user.toObject() : null;
}

async function softDeleteUser(userId) {
  const user = await User.findOne({ _id: userId, isDeleted: false });
  if (!user) return null;
  user.isDeleted = true;
  user.deletedAt = new Date();
  await user.save();
  return user.toObject();
}

async function emailExists(email) {
  const normalized = normalizeEmail(email);
  const user = await User.findOne({ email: normalized }).select("_id");
  return !!user;
}

module.exports = { findUserByEmail, findUserById, createUser, markEmailVerified, softDeleteUser, emailExists };
