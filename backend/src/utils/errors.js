class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode || 500;
    this.isOperational = true;
  }
}

class ValidationError extends AppError {
  constructor(message) {
    super(message, 400);
  }
}

class NotFoundError extends AppError {
  constructor(message) {
    super(message || "Resource not found", 404);
  }
}

class UnauthorizedError extends AppError {
  constructor(message) {
    super(message || "Unauthorized", 401);
  }
}

class ForbiddenError extends AppError {
  constructor(message) {
    super(message || "Forbidden", 403);
  }
}

class ConflictError extends AppError {
  constructor(message) {
    super(message || "Conflict", 409);
  }
}

module.exports = { AppError, ValidationError, NotFoundError, UnauthorizedError, ForbiddenError, ConflictError };
