const crypto = require("crypto");

const config = require("../core/config");
const logger = require("../core/logger");

const OTP_EXPIRY_MS = 10 * 60 * 1000;
const OTP_LENGTH = 6;

function generateOtp() {
  const buffer = crypto.randomBytes(OTP_LENGTH);
  let otp = "";
  for (let i = 0; i < OTP_LENGTH; i++) {
    otp += buffer[i] % 10;
  }
  return otp;
}

function hashOtp(otp) {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

function getTransporter() {
  const nodemailer = require("nodemailer");
  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
  });
}

async function sendVerificationOtpEmail(email, otp) {
  if (!config.smtpUser || !config.smtpPass || !config.emailFrom) {
    throw new Error("SMTP credentials are not configured");
  }

  const transporter = getTransporter();

  try {
    await transporter.sendMail({
      from: config.emailFrom,
      to: email,
      subject: "Your SmartAuth verification code",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #333;">SmartAuth</h2>
          <p>Your verification code is:</p>
          <p style="font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #222; background: #f5f5f5; padding: 16px; text-align: center; border-radius: 8px;">${otp}</p>
          <p>This code expires in 10 minutes.</p>
          <p style="color: #666; font-size: 13px;">If you did not request this code, please ignore this email. Do not share this code with anyone.</p>
        </div>
      `,
    });
  } catch (err) {
    const safe = {
      code: err && typeof err.code === "string" ? err.code : undefined,
      errno: err && typeof err.errno === "number" ? err.errno : undefined,
      syscall: err && typeof err.syscall === "string" ? err.syscall : undefined,
      command: err && typeof err.command === "string" ? err.command : undefined,
      response: err && typeof err.response === "string" ? err.response : undefined,
      responseCode: err && typeof err.responseCode === "number" ? err.responseCode : undefined,
      name: err && typeof err.name === "string" ? err.name : undefined,
    };
    logger.error("SMTP email send failed", safe);
    throw new Error("Unable to send verification email");
  }
}

async function sendPasswordResetOtpEmail(email, otp) {
  if (!config.smtpUser || !config.smtpPass || !config.emailFrom) {
    throw new Error("SMTP credentials are not configured");
  }

  const transporter = getTransporter();

  try {
    await transporter.sendMail({
      from: config.emailFrom,
      to: email,
      subject: "Your SmartAuth password reset code",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #333;">SmartAuth</h2>
          <p>You requested a password reset. Your code is:</p>
          <p style="font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #222; background: #f5f5f5; padding: 16px; text-align: center; border-radius: 8px;">${otp}</p>
          <p>This code expires in 10 minutes.</p>
          <p style="color: #666; font-size: 13px;">If you did not request a password reset, please ignore this email. Do not share this code with anyone.</p>
        </div>
      `,
    });
  } catch (err) {
    const safe = {
      code: err && typeof err.code === "string" ? err.code : undefined,
      errno: err && typeof err.errno === "number" ? err.errno : undefined,
      syscall: err && typeof err.syscall === "string" ? err.syscall : undefined,
      command: err && typeof err.command === "string" ? err.command : undefined,
      response: err && typeof err.response === "string" ? err.response : undefined,
      responseCode: err && typeof err.responseCode === "number" ? err.responseCode : undefined,
      name: err && typeof err.name === "string" ? err.name : undefined,
    };
    logger.error("SMTP password reset email send failed", safe);
    throw new Error("Unable to send verification email");
  }
}

module.exports = {
  generateOtp,
  hashOtp,
  OTP_EXPIRY_MS,
  sendVerificationOtpEmail,
  sendPasswordResetOtpEmail,
};
