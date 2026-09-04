const executionRepo = require("../db/repositories/execution.repository");
const taskRepo = require("../db/repositories/task.repository");
const User = require("../db/models/user.model");
const engine = require("./engine");
const executionLogger = require("./logger");
const activityService = require("../services/activity.service");

const POLL_INTERVAL_MS = 30000;
const WORKER_TASK_STATUSES = ["pending", "in_progress"];

let timer = null;
let running = false;
let processing = new Set();

const RETRYABLE_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "ENETUNREACH",
  "EAI_AGAIN",
]);

function isRetryableError(err) {
  if (!err) return false;
  if (err.statusCode === 408) return true;
  if (err.code && RETRYABLE_ERROR_CODES.has(err.code)) return true;
  if (err.type === "system" || err.type === "transport") return true;
  if (
    err.message &&
    (err.message.includes("timeout") ||
      err.message.includes("socket hang up") ||
      err.message.includes("network"))
  )
    return true;
  return false;
}

async function findExecutableExecution() {
  const executions = await executionRepo.findPendingExecutions();

  for (const exec of executions) {
    if (processing.has(exec.id || exec._id)) continue;

    if (exec.status === "failed") {
      if (exec.retryCount >= exec.maxRetries) continue;
    }

    const task = await taskRepo.findTaskByIdAndUserId(exec.taskId, exec.userId);
    if (!task) continue;

    if (task.status === "completed" || task.status === "cancelled") continue;

    if (task.requiresApproval) {
      const approvalService = require("../services/approval.service");
      const approval = await approvalService.getApprovalByExecutionId(
        exec.id || exec._id
      );
      if (approval && approval.status === "pending") continue;
    }

    const user = await User.findOne({
      _id: exec.userId,
      isDeleted: { $ne: true },
    });
    if (!user) continue;

    return exec;
  }

  return null;
}

async function processExecution(execution) {
  const executionId = execution.id || execution._id;
  processing.add(executionId);

  try {
    const taskBefore = await taskRepo.findTaskByIdAndUserId(
      execution.taskId,
      execution.userId
    );

    if (taskBefore && taskBefore.requiresApproval) {
      const approvalService = require("../services/approval.service");
      const approval = await approvalService.getApprovalByExecutionId(
        executionId
      );

      if (approval && approval.status === "pending") {
        return;
      }

      if (!approval || approval.status === "rejected") {
        await executionRepo.updateExecutionStatus(
          executionId,
          execution.userId,
          "failed",
          {
            error: "Task requires approved approval before execution",
            completedAt: new Date(),
          }
        );
        await taskRepo.updateTask(execution.taskId, execution.userId, {
          status: "pending",
        });
        activityService
          .logActivity(
            execution.userId,
            "execution_failed",
            execution.taskId,
            "Execution blocked: task requires approval",
            { executionId },
            executionId
          )
          .catch(() => {});
        return;
      }
    }

    const acquired = await executionRepo.updateExecutionStatus(
      executionId,
      execution.userId,
      "running",
      { startedAt: new Date() }
    );

    if (!acquired || acquired.error) {
      return;
    }

    await taskRepo.updateTask(execution.taskId, execution.userId, {
      status: "in_progress",
    });

    const task = await taskRepo.findTaskByIdAndUserId(
      execution.taskId,
      execution.userId
    );
    if (!task) {
      await executionRepo.updateExecutionStatus(
        executionId,
        execution.userId,
        "failed",
        { error: "Task not found", completedAt: new Date() }
      );
      return;
    }

    if (task.requiresApproval) {
      const approvalService = require("../services/approval.service");
      const approval = await approvalService.getApprovalByExecutionId(
        executionId
      );
      if (!approval || approval.status !== "approved") {
        await executionRepo.updateExecutionStatus(
          executionId,
          execution.userId,
          "failed",
          {
            error: "Task requires approved approval before execution",
            completedAt: new Date(),
          }
        );
        await taskRepo.updateTask(execution.taskId, execution.userId, {
          status: "pending",
        });
        activityService
          .logActivity(
            execution.userId,
            "execution_failed",
            execution.taskId,
            "Execution blocked: task requires approval",
            { executionId },
            executionId
          )
          .catch(() => {});
        return;
      }
    }

    const startTime = Date.now();
    let result;
    try {
      result = await engine.execute(acquired, task, execution.userId);
    } catch (execErr) {
      const duration = Date.now() - startTime;
      const retryCount = execution.retryCount || 0;
      const maxRetries = execution.maxRetries || 0;
      const canRetry = isRetryableError(execErr) && retryCount < maxRetries;

      if (canRetry) {
        await executionRepo.resetForRetry(executionId, retryCount + 1);
        await taskRepo.updateTask(execution.taskId, execution.userId, {
          status: "pending",
        });
        activityService
          .logActivity(
            execution.userId,
            "execution_failed",
            execution.taskId,
            `Execution failed (attempt ${retryCount + 1}/${maxRetries + 1}), retry scheduled`,
            { executionId, error: execErr.message, retryCount: retryCount + 1 },
            executionId
          )
          .catch(() => {});
      } else {
        await executionRepo.updateExecutionStatus(
          executionId,
          execution.userId,
          "failed",
          {
            error: execErr.message,
            completedAt: new Date(),
            duration,
          }
        );
        await taskRepo.updateTask(execution.taskId, execution.userId, {
          status: "failed",
        });
        activityService
          .logActivity(
            execution.userId,
            "execution_failed",
            execution.taskId,
            "Execution permanently failed",
            { executionId, error: execErr.message },
            executionId
          )
          .catch(() => {});
      }
      return;
    }

    const duration = Date.now() - startTime;
    const updateData = {
      status: "completed",
      output: result.output,
      completedAt: new Date(),
      duration: result.duration || duration,
    };
    if (result.steps && result.steps.length > 0) {
      updateData.steps = result.steps;
    }

    await executionRepo.updateExecutionStatus(
      executionId,
      execution.userId,
      "completed",
      updateData
    );

    await taskRepo.updateTask(execution.taskId, execution.userId, {
      status: "completed",
    });

    const artifactService = require("../services/artifact.service");
    artifactService
      .createArtifact(
        execution.userId,
        "execution_output",
        `Execution ${executionId} output`,
        {
          output: result.output,
          duration: result.duration || duration,
          steps: result.steps || [],
        },
        execution.taskId,
        executionId,
        { completedAt: new Date().toISOString() }
      )
      .catch(() => {});

    activityService
      .logActivity(
        execution.userId,
        "execution_completed",
        execution.taskId,
        "Execution completed successfully",
        { executionId, duration: result.duration || duration },
        executionId
      )
      .catch(() => {});
  } catch (err) {
    executionLogger.logExecutionFailed(executionId, execution.taskId, err);
    try {
      await executionRepo.updateExecutionStatus(
        executionId,
        execution.userId,
        "failed",
        { error: err.message, completedAt: new Date() }
      );
      await taskRepo.updateTask(execution.taskId, execution.userId, {
        status: "failed",
      });
    } catch (_) {}
  } finally {
    processing.delete(executionId);
  }
}

async function poll() {
  if (running) return;
  running = true;

  try {
    const execution = await findExecutableExecution();
    if (execution) {
      await processExecution(execution);
    }
  } catch (err) {
    executionLogger.logExecutionFailed("worker", "poll", err);
  } finally {
    running = false;
  }
}

function startTaskWorker() {
  if (timer) return;
  timer = setInterval(poll, POLL_INTERVAL_MS);
  if (timer.unref) timer.unref();
}

function stopTaskWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  running = false;
}

module.exports = {
  startTaskWorker,
  stopTaskWorker,
  poll,
  processExecution,
  findExecutableExecution,
  isRetryableError,
  POLL_INTERVAL_MS,
};
