const logger = require("../core/logger");
const config = require("../core/config");

function errorHandler(err, req, res, next) {
  logger.error(`[${req.method} ${req.originalUrl}] ${err.message}`, err);

  const statusCode = err.statusCode || 500;
  const message =
    statusCode === 500 && config.nodeEnv === "production"
      ? "Internal server error"
      : err.message;

  res.status(statusCode).json({
    success: false,
    message,
  });
}

module.exports = errorHandler;
