const mongoose = require("mongoose");
const taskRepo = require("../db/repositories/task.repository");
const scheduleService = require("./schedule.service");

const VALID_STATUSES = ["pending", "in_progress", "completed", "failed", "cancelled"];
const VALID_PRIORITIES = ["low", "medium", "high"];
const VALID_SCHEDULE_TYPES = ["once", "recurring"];
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function normalizeTaskInput(body) {
  const title = body.name || body.title;
  const scheduleType = body.scheduleType || "once";
  const time = body.time || body.scheduledTime || "";
  return { title, scheduleType, scheduledTime: time, agent: body.agent || "" };
}

function formatTaskResponse(task) {
  const status = task.status;
  let badge, badgeVariant;
  if (status === "completed") {
    badge = "Completed";
    badgeVariant = "green";
  } else if (status === "failed") {
    badge = "Failed";
    badgeVariant = "red";
  } else if (status === "in_progress") {
    badge = "Running";
    badgeVariant = "blue";
  } else if (status === "cancelled") {
    badge = "Cancelled";
    badgeVariant = "gray";
  } else {
    badge = task.scheduleType === "recurring" ? "Recurring" : "Scheduled";
    badgeVariant = task.scheduleType === "recurring" ? "purple" : "blue";
  }
  return {
    id: task.id,
    name: task.title,
    title: task.title,
    description: task.description || "",
    priority: task.priority || "medium",
    status: task.status,
    agent: task.agent || "",
    time: task.scheduledTime || "",
    scheduledTime: task.scheduledTime || "",
    scheduleType: task.scheduleType || "once",
    requiresApproval: task.requiresApproval || false,
    badge,
    badgeVariant,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

function validateCreateInput(body) {
  const errors = [];
  const { title, scheduleType, agent } = normalizeTaskInput(body);

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    errors.push("Title (or name) is required");
  } else if (title.trim().length > MAX_TITLE_LENGTH) {
    errors.push(`Title must not exceed ${MAX_TITLE_LENGTH} characters`);
  }

  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== "string") {
      errors.push("Description must be a string");
    } else if (body.description.length > MAX_DESCRIPTION_LENGTH) {
      errors.push(`Description must not exceed ${MAX_DESCRIPTION_LENGTH} characters`);
    }
  }

  if (body.priority !== undefined && body.priority !== null) {
    if (!VALID_PRIORITIES.includes(body.priority)) {
      errors.push(`Priority must be one of: ${VALID_PRIORITIES.join(", ")}`);
    }
  }

  if (scheduleType && !VALID_SCHEDULE_TYPES.includes(scheduleType)) {
    errors.push(`scheduleType must be one of: ${VALID_SCHEDULE_TYPES.join(", ")}`);
  }

  if (agent && typeof agent !== "string") {
    errors.push("Agent must be a string");
  }

  if (body.time && typeof body.time !== "string") {
    errors.push("Time must be a string");
  }

  return errors;
}

function validateUpdateInput(body) {
  const errors = [];
  const allowed = {};

  const { title } = normalizeTaskInput(body);

  if (title !== undefined) {
    if (typeof title !== "string" || title.trim().length === 0) {
      errors.push("Title must be a non-empty string");
    } else if (title.trim().length > MAX_TITLE_LENGTH) {
      errors.push(`Title must not exceed ${MAX_TITLE_LENGTH} characters`);
    } else {
      allowed.title = title.trim();
    }
  }

  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== "string") {
      errors.push("Description must be a string");
    } else if (body.description && body.description.length > MAX_DESCRIPTION_LENGTH) {
      errors.push(`Description must not exceed ${MAX_DESCRIPTION_LENGTH} characters`);
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

  if (body.agent !== undefined) {
    if (typeof body.agent !== "string") {
      errors.push("Agent must be a string");
    } else {
      allowed.agent = body.agent;
    }
  }

  if (body.time !== undefined || body.scheduledTime !== undefined) {
    const timeVal = body.time || body.scheduledTime;
    if (typeof timeVal !== "string") {
      errors.push("Time must be a string");
    } else {
      allowed.scheduledTime = timeVal;
    }
  }

  if (body.scheduleType !== undefined) {
    if (!VALID_SCHEDULE_TYPES.includes(body.scheduleType)) {
      errors.push(`scheduleType must be one of: ${VALID_SCHEDULE_TYPES.join(", ")}`);
    } else {
      allowed.scheduleType = body.scheduleType;
    }
  }

  return { errors, allowed };
}

async function createTask(data, userId) {
  const { title, scheduleType, scheduledTime, agent } = normalizeTaskInput(data);
  const task = await taskRepo.createTask({
    title: title.trim(),
    description: (data.description || "").trim(),
    priority: data.priority || "medium",
    userId,
    requiresApproval: !!data.requiresApproval,
    agent,
    scheduledTime,
    scheduleType,
  });

  // Atomic scheduling: when the wizard supplies a first/only run
  // (nextRunAt), the schedule is created in the same request via the existing
  // scheduleService so the task and its schedule succeed or fail together.
  // If the schedule cannot be created, roll the just-created task back and
  // surface the scheduling error — the user is never left with an unscheduled
  // task they believed was scheduled.
  let schedule = null;
  if (data.nextRunAt) {
    try {
      schedule = await scheduleService.createSchedule(task.id, userId, data.frequency || "once", data.nextRunAt);
    } catch (err) {
      await taskRepo.deleteTask(task.id, userId).catch(() => {});
      err.message = `Scheduling failed: ${err.message}`;
      throw err;
    }
  }

  return { task, schedule };
}

async function getUserTasks(userId, filter) {
  return await taskRepo.findTasksByUserId(userId, filter);
}

async function getTaskById(taskId, userId) {
  return await taskRepo.findTaskByIdAndUserId(taskId, userId);
}

async function updateTaskById(taskId, userId, updates) {
  return await taskRepo.updateTask(taskId, userId, updates);
}

async function deleteTaskById(taskId, userId) {
  return await taskRepo.deleteTask(taskId, userId);
}

module.exports = {
  VALID_STATUSES,
  VALID_PRIORITIES,
  VALID_SCHEDULE_TYPES,
  isValidObjectId,
  normalizeTaskInput,
  formatTaskResponse,
  validateCreateInput,
  validateUpdateInput,
  createTask,
  getUserTasks,
  getTaskById,
  updateTaskById,
  deleteTaskById,
};
