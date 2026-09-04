const executionService = require("./execution.service");
const activityService = require("../services/activity.service");

async function startExecution(req, res, next) {
  try {
    const { taskId, input, timeout, steps } = req.body;
    const userId = req.user.userId;

    if (!taskId || typeof taskId !== "string") {
      const err = new Error("taskId is required and must be a string");
      err.statusCode = 400;
      return next(err);
    }

    const execution = await executionService.startTaskExecution(taskId, userId, input, { timeout, steps });

    activityService.logActivity(
      userId, "execution_started", taskId,
      `Execution started for task`,
      { executionId: execution.id, taskId }
    ).catch(() => {});

    res.status(201).json({
      success: true,
      message: "Execution started",
      data: { execution },
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

async function runExecution(req, res, next) {
  try {
    const { id } = req.params;
    const { taskId } = req.body;
    const userId = req.user.userId;

    if (!id) {
      const err = new Error("Execution ID is required");
      err.statusCode = 400;
      return next(err);
    }

    if (!taskId || typeof taskId !== "string") {
      const err = new Error("taskId is required and must be a string");
      err.statusCode = 400;
      return next(err);
    }

    const execution = await executionService.runTaskExecution(id, userId, taskId);

    activityService.logActivity(
      userId, "execution_completed", taskId,
      `Execution ${id} completed`,
      { executionId: id, taskId }
    ).catch(() => {});

    res.status(200).json({
      success: true,
      message: "Execution completed",
      data: { execution },
    });
  } catch (err) {
    if (err.statusCode === 408 || err.statusCode === 409) {
      const { taskId } = req.body;
      activityService.logActivity(
        req.user.userId, "execution_failed", taskId,
        `Execution ${req.params.id} failed: ${err.message}`,
        { executionId: req.params.id, taskId, error: err.message }
      ).catch(() => {});
    }
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

async function cancelExecution(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    if (!id) {
      const err = new Error("Execution ID is required");
      err.statusCode = 400;
      return next(err);
    }

    const execution = await executionService.cancelTaskExecution(id, userId);

    activityService.logActivity(
      userId, "execution_cancelled", execution.taskId,
      `Execution ${id} cancelled`,
      { executionId: id, taskId: execution.taskId }
    ).catch(() => {});

    res.status(200).json({
      success: true,
      message: "Execution cancelled",
      data: { execution },
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

async function getExecution(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    if (!id) {
      const err = new Error("Execution ID is required");
      err.statusCode = 400;
      return next(err);
    }

    const execution = await executionService.getExecutionById(id, userId);

    res.status(200).json({
      success: true,
      data: { execution },
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

async function listByTask(req, res, next) {
  try {
    const { taskId } = req.query;
    const userId = req.user.userId;

    if (!taskId || typeof taskId !== "string") {
      const err = new Error("taskId query parameter is required");
      err.statusCode = 400;
      return next(err);
    }

    const executions = await executionService.listExecutionsByTask(taskId, userId);

    res.status(200).json({
      success: true,
      data: { executions },
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

async function listUserExecutions(req, res, next) {
  try {
    const userId = req.user.userId;
    const executions = await executionService.listUserExecutions(userId);

    res.status(200).json({
      success: true,
      data: { executions },
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

async function recoverStale(req, res, next) {
  try {
    const count = await executionService.recoverStale();

    res.status(200).json({
      success: true,
      message: `Recovered ${count} stale execution(s)`,
      data: { recovered: count },
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

module.exports = {
  startExecution,
  runExecution,
  cancelExecution,
  getExecution,
  listByTask,
  listUserExecutions,
  recoverStale,
};
