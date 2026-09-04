const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const config = require("./config");

const SALT_ROUNDS = 10;

function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

function comparePassword(password, hashedPassword) {
  return bcrypt.compare(password, hashedPassword);
}

function generateAccessToken(payload) {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

// Email-verification proof ticket issued before a user record exists. It is
// short-lived and single-purpose: it proves email ownership only and must
// never be used to access authenticated routes.
const VERIFICATION_TICKET_EXPIRY_S = 15 * 60; // 15 minutes
const VERIFICATION_TICKET_PURPOSE = "registration_email_verified";

function generateVerificationTicket(email) {
  return jwt.sign(
    { purpose: VERIFICATION_TICKET_PURPOSE, email },
    config.jwtSecret,
    { expiresIn: VERIFICATION_TICKET_EXPIRY_S }
  );
}

function verifyVerificationTicket(token) {
  let decoded;
  try {
    decoded = jwt.verify(token, config.jwtSecret);
  } catch {
    const err = new Error("Email verification expired or invalid — please verify your email again");
    err.statusCode = 400;
    throw err;
  }
  if (!decoded || decoded.purpose !== VERIFICATION_TICKET_PURPOSE) {
    const err = new Error("Email verification expired or invalid — please verify your email again");
    err.statusCode = 400;
    throw err;
  }
  return decoded;
}

module.exports = {
  hashPassword,
  comparePassword,
  generateAccessToken,
  verifyAccessToken,
  generateVerificationTicket,
  verifyVerificationTicket,
};
