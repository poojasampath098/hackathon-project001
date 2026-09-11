const dotenv = require("dotenv");

dotenv.config();

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error("JWT_SECRET is not set in environment variables");
}

const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || "development",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  smtpHost: process.env.SMTP_HOST || "smtp.gmail.com",
  smtpPort: parseInt(process.env.SMTP_PORT, 10) || 465,
  smtpSecure: process.env.SMTP_SECURE === "true",
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
  emailFrom: process.env.EMAIL_FROM,
  mongodbUri: process.env.MONGODB_URI,
  nvidiaApiKey: process.env.NVIDIA_API_KEY,
  nvidiaBaseUrl: process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1",
  aiModel: process.env.AI_MODEL || "deepseek-ai/deepseek-v4-pro",
  aiTimeoutMs: parseInt(process.env.AI_TIMEOUT_MS, 10) || 90000,
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME,
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY,
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  // Optional. ID-token sign-in (POST /api/auth/google) verifies Google tokens
  // with only GOOGLE_CLIENT_ID; the secret is never sent to the browser and only
  // needed if an authorization-code exchange is added later.
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
};

module.exports = config;
