const logger = require("../core/logger");
const config = require("../core/config");

const SECRET_PATTERNS = [
  /nvapi-[A-Za-z0-9]+/gi,
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /passwordhash[:\s]*["']?[A-Za-z0-9$./]+["']?/gi,
];

function sanitizeMessage(msg) {
  if (typeof msg !== "string") return msg;
  let sanitized = msg;
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }
  return sanitized;
}

function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const rawMessage = err.message || "Internal server error";

  logger.error(`[${req.method} ${req.originalUrl}] ${rawMessage}`, {
    statusCode,
    category: err.aiErrorCategory || null,
    stack: config.nodeEnv === "production" ? undefined : err.stack,
  });

  const message =
    statusCode === 500 && config.nodeEnv === "production"
      ? "Internal server error"
      : sanitizeMessage(rawMessage);

  res.status(statusCode).json({
    success: false,
    message,
  });
}

module.exports = errorHandler;
