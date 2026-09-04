const executionRepo = require("../db/repositories/execution.repository");
const taskRepo = require("../db/repositories/task.repository");
const engine = require("./engine");
const executionLogger = require("./logger");
const artifactService = require("../services/artifact.service");

const VALID_TRANSITIONS_FROM = {
  pending: ["running", "cancelled", "failed"],
  running: ["completed", "failed", "cancelled"],
};

async function markTaskStatus(task, userId, status) {
  if (!task) return;
  const taskId = task._id || task.id;
  if (!taskId) return;
  try {
    await taskRepo.updateTask(taskId, userId, { status });
  } catch (err) {
    executionLogger.logExecutionFailed("manager", taskId, err);
  }
}

async function startExecution(taskId, userId, input) {
  const existing = await executionRepo.findExecutionsByTaskId(taskId, userId);
  for (const exec of existing) {
    if (exec.status === "pending" || exec.status === "running") {
      throw Object.assign(
        new Error("An execution is already pending or running for this task"),
        { statusCode: 409 }
      );
    }
  }

  const execution = await executionRepo.createExecution({
    taskId,
    userId,
    input: input || {},
  });

  return execution;
}

async function runExecution(executionId, userId, task) {
  const execution = await executionRepo.findExecutionByIdAndUserId(executionId, userId);
  if (!execution) {
    throw Object.assign(new Error("Execution not found"), { statusCode: 404 });
  }

  if (execution.status !== "pending" && execution.status !== "running") {
    throw Object.assign(
      new Error(`Execution is ${execution.status} and cannot be run`),
      { statusCode: 409 }
    );
  }

  if (execution.status === "pending") {
    const updated = await executionRepo.updateExecutionStatus(executionId, userId, "running", {
      startedAt: new Date(),
    });
    if (updated && updated.error) {
      throw Object.assign(new Error(updated.error), { statusCode: 409 });
    }
  }

  const timeoutMs = execution.timeout || 30000;

  try {
    const result = await Promise.race([
      engine.execute(execution, task, userId),
      new Promise((_, reject) =>
        setTimeout(() => {
          executionLogger.logExecutionTimeout(executionId, task._id || task.id);
          reject(Object.assign(new Error("Execution timed out"), { statusCode: 408 }));
        }, timeoutMs)
      ),
    ]);

    const updateData = {
      status: "completed",
      output: result.output,
      completedAt: new Date(),
      duration: result.duration,
    };

    if (result.steps && result.steps.length > 0) {
      updateData.steps = result.steps;
    }

    const updated = await executionRepo.updateExecutionStatus(executionId, userId, "completed", updateData);
    if (updated && updated.error) {
      throw Object.assign(new Error(updated.error), { statusCode: 409 });
    }

    await markTaskStatus(task, userId, "completed");

    const executionRecord = await executionRepo.findExecutionByIdAndUserId(executionId, userId);

    artifactService.createArtifact(
      userId,
      "execution_output",
      `Execution ${executionId} output`,
      { output: result.output, duration: result.duration, steps: result.steps || [] },
      executionRecord ? executionRecord.taskId : null,
      executionId,
      { completedAt: new Date().toISOString() }
    ).catch(() => {});

    return await executionRepo.findExecutionByIdAndUserId(executionId, userId);
  } catch (err) {
    const duration = Date.now() - new Date(execution.startedAt || Date.now()).getTime();
    const errorUpdate = {
      error: err.message,
      completedAt: new Date(),
      duration,
    };

    await executionRepo.updateExecutionStatus(executionId, userId, "failed", errorUpdate);

    if (!err.statusCode || err.statusCode !== 409) {
      await markTaskStatus(task, userId, "failed");
    }

    throw err;
  }
}

async function cancelExecution(executionId, userId) {
  const execution = await executionRepo.findExecutionByIdAndUserId(executionId, userId);
  if (!execution) return null;

  if (execution.status !== "running" && execution.status !== "pending") {
    throw Object.assign(
      new Error(`Execution is ${execution.status} and cannot be cancelled`),
      { statusCode: 409 }
    );
  }

  executionLogger.logExecutionCancelled(executionId, execution.taskId);

  const updated = await executionRepo.updateExecutionStatus(executionId, userId, "cancelled", {
    completedAt: new Date(),
  });

  if (updated && updated.error) {
    throw Object.assign(new Error(updated.error), { statusCode: 409 });
  }

  const task = await taskRepo.findTaskByIdAndUserId(execution.taskId, userId);
  if (task && task.status === "in_progress") {
    await markTaskStatus(task, userId, "pending");
  }

  return updated;
}

async function recoverStaleExecutions(timeoutMs) {
  const stale = await executionRepo.findStaleExecutions(timeoutMs || 60000);

  for (const exec of stale) {
    executionLogger.logStaleExecutionRecovery(exec.id, exec.status);

    await executionRepo.updateExecutionStatus(exec.id, exec.userId, "failed", {
      error: "Execution timed out and was automatically recovered",
      completedAt: new Date(),
    });
  }

  return stale.length;
}

async function getExecution(executionId, userId) {
  return await executionRepo.findExecutionByIdAndUserId(executionId, userId);
}

async function getExecutionsByTask(taskId, userId) {
  return await executionRepo.findExecutionsByTaskId(taskId, userId);
}

async function getUserExecutions(userId, limit) {
  return await executionRepo.findExecutionsByUserId(userId, limit);
}

async function getExecutionCount(userId) {
  return await executionRepo.countExecutionsByUserId(userId);
}

module.exports = {
  startExecution,
  runExecution,
  cancelExecution,
  recoverStaleExecutions,
  getExecution,
  getExecutionsByTask,
  getUserExecutions,
  getExecutionCount,
};
