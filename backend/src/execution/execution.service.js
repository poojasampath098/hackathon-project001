const mongoose = require("mongoose");
const executionManager = require("./manager");
const executionRepo = require("../db/repositories/execution.repository");
const taskRepo = require("../db/repositories/task.repository");
const approvalService = require("../services/approval.service");

const VALID_STATUSES = ["pending", "running", "completed", "failed", "cancelled"];
const VALID_PRIORITIES = ["low", "medium", "high"];
const MAX_INPUT_SIZE = 1024 * 100;
const MAX_STEPS = 20;
const VALID_TIMEOUTS = { min: 1000, max: 300000 };

function validateObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function validateInput(input) {
  if (input === undefined || input === null) return { valid: true, value: {} };
  if (typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, error: "input must be an object" };
  }
  const str = JSON.stringify(input);
  if (str.length > MAX_INPUT_SIZE) {
    return { valid: false, error: "input is too large (max 100KB)" };
  }
  return { valid: true, value: input };
}

function validateTimeout(timeout) {
  if (timeout === undefined || timeout === null) return { valid: true, value: 120000 };
  if (typeof timeout !== "number" || !Number.isFinite(timeout)) {
    return { valid: false, error: "timeout must be a number" };
  }
  if (timeout < VALID_TIMEOUTS.min || timeout > VALID_TIMEOUTS.max) {
    return { valid: false, error: `timeout must be between ${VALID_TIMEOUTS.min}ms and ${VALID_TIMEOUTS.max}ms` };
  }
  return { valid: true, value: timeout };
}

function validateSteps(steps) {
  if (steps === undefined || steps === null) return { valid: true, value: [] };
  if (!Array.isArray(steps)) {
    return { valid: false, error: "steps must be an array" };
  }
  if (steps.length > MAX_STEPS) {
    return { valid: false, error: `steps must not exceed ${MAX_STEPS} items` };
  }
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step || typeof step !== "object") {
      return { valid: false, error: `step ${i} must be an object` };
    }
    if (!step.name || typeof step.name !== "string" || step.name.trim().length === 0) {
      return { valid: false, error: `step ${i} must have a non-empty name` };
    }
  }
  return { valid: true, value: steps };
}

async function startTaskExecution(taskId, userId, input, options) {
  if (!validateObjectId(taskId)) {
    throw Object.assign(new Error("Invalid task ID"), { statusCode: 400 });
  }

  const task = await taskRepo.findTaskByIdAndUserId(taskId, userId);
  if (!task) {
    throw Object.assign(new Error("Task not found"), { statusCode: 404 });
  }

  const inputCheck = validateInput(input);
  if (!inputCheck.valid) {
    throw Object.assign(new Error(inputCheck.error), { statusCode: 400 });
  }

  const timeoutCheck = validateTimeout(options && options.timeout);
  if (!timeoutCheck.valid) {
    throw Object.assign(new Error(timeoutCheck.error), { statusCode: 400 });
  }

  const stepsCheck = validateSteps(options && options.steps);
  if (!stepsCheck.valid) {
    throw Object.assign(new Error(stepsCheck.error), { statusCode: 400 });
  }

  const execution = await executionManager.startExecution(taskId, userId, inputCheck.value);

  if (stepsCheck.value.length > 0) {
    await executionRepo.updateExecution(execution.id, userId, {
      steps: stepsCheck.value.map((s) => ({
        name: s.name,
        status: "pending",
        input: s.input || null,
      })),
      timeout: timeoutCheck.value,
    });
  } else {
    await executionRepo.updateExecution(execution.id, userId, {
      timeout: timeoutCheck.value,
    });
  }

  return await executionRepo.findExecutionByIdAndUserId(execution.id, userId);
}

async function runTaskExecution(executionId, userId, taskId) {
  if (!validateObjectId(executionId)) {
    throw Object.assign(new Error("Invalid execution ID"), { statusCode: 400 });
  }
  if (!validateObjectId(taskId)) {
    throw Object.assign(new Error("Invalid task ID"), { statusCode: 400 });
  }

  const task = await taskRepo.findTaskByIdAndUserId(taskId, userId);
  if (!task) {
    throw Object.assign(new Error("Task not found"), { statusCode: 404 });
  }

  if (task.requiresApproval) {
    const approval = await approvalService.getApprovalByExecutionId(executionId);
    if (!approval || approval.status !== "approved") {
      throw Object.assign(
        new Error("Task requires approval. Request approval before running this execution."),
        { statusCode: 403 }
      );
    }
  }

  const result = await executionManager.runExecution(executionId, userId, task);
  return result;
}

async function cancelTaskExecution(executionId, userId) {
  if (!validateObjectId(executionId)) {
    throw Object.assign(new Error("Invalid execution ID"), { statusCode: 400 });
  }

  const result = await executionManager.cancelExecution(executionId, userId);
  if (!result) {
    throw Object.assign(new Error("Execution not found"), { statusCode: 404 });
  }
  return result;
}

async function getExecutionById(executionId, userId) {
  if (!validateObjectId(executionId)) {
    throw Object.assign(new Error("Invalid execution ID"), { statusCode: 400 });
  }

  const execution = await executionManager.getExecution(executionId, userId);
  if (!execution) {
    throw Object.assign(new Error("Execution not found"), { statusCode: 404 });
  }
  return execution;
}

async function listExecutionsByTask(taskId, userId) {
  if (!validateObjectId(taskId)) {
    throw Object.assign(new Error("Invalid task ID"), { statusCode: 400 });
  }

  return await executionManager.getExecutionsByTask(taskId, userId);
}

async function listUserExecutions(userId) {
  return await executionManager.getUserExecutions(userId, 50);
}

async function recoverStale() {
  return await executionManager.recoverStaleExecutions(60000);
}

module.exports = {
  startTaskExecution,
  runTaskExecution,
  cancelTaskExecution,
  getExecutionById,
  listExecutionsByTask,
  listUserExecutions,
  recoverStale,
};
