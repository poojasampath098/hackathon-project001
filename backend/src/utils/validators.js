const VALID_STATUSES = ["pending", "in_progress", "completed", "failed", "cancelled"];
const VALID_PRIORITIES = ["low", "medium", "high"];

function validateObjectId(id) {
  const mongoose = require("mongoose");
  return mongoose.Types.ObjectId.isValid(id);
}

function validateTaskCreate({ title, description, priority }) {
  const errors = [];

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    errors.push("Title is required");
  } else if (title.trim().length > 200) {
    errors.push("Title must not exceed 200 characters");
  }

  if (description !== undefined && description !== null) {
    if (typeof description !== "string") {
      errors.push("Description must be a string");
    } else if (description.length > 2000) {
      errors.push("Description must not exceed 2000 characters");
    }
  }

  if (priority !== undefined && !VALID_PRIORITIES.includes(priority)) {
    errors.push(`Priority must be one of: ${VALID_PRIORITIES.join(", ")}`);
  }

  return errors;
}

function validateTaskUpdate(body) {
  const errors = [];
  const allowed = {};

  if (body.title !== undefined) {
    if (typeof body.title !== "string" || body.title.trim().length === 0) {
      errors.push("Title must be a non-empty string");
    } else if (body.title.trim().length > 200) {
      errors.push("Title must not exceed 200 characters");
    } else {
      allowed.title = body.title.trim();
    }
  }

  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== "string") {
      errors.push("Description must be a string");
    } else if (body.description && body.description.length > 2000) {
      errors.push("Description must not exceed 2000 characters");
    } else {
      allowed.description = body.description || "";
    }
  }

  if (body.priority !== undefined) {
    if (!VALID_PRIORITIES.includes(body.priority)) {
      errors.push(`Priority must be one of: ${VALID_PRIORITIES.join(", ")}`);
    } else {
      allowed.priority = body.priority;
    }
  }

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      errors.push(`Status must be one of: ${VALID_STATUSES.join(", ")}`);
    } else {
      allowed.status = body.status;
    }
  }

  return { errors, allowed };
}

module.exports = {
  VALID_STATUSES,
  VALID_PRIORITIES,
  validateObjectId,
  validateTaskCreate,
  validateTaskUpdate,
};
