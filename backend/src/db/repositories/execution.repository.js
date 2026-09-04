const Execution = require("../models/execution.model");

async function createExecution(data) {
  const exec = await Execution.create({
    taskId: data.taskId,
    userId: data.userId,
    input: data.input || {},
    steps: data.steps || [],
    timeout: data.timeout || 30000,
    maxRetries: data.maxRetries || 0,
  });
  return exec.toObject();
}

async function findExecutionByIdAndUserId(executionId, userId) {
  const exec = await Execution.findOne({ _id: executionId, userId });
  return exec ? exec.toObject() : null;
}

async function findExecutionsByTaskId(taskId, userId) {
  const execs = await Execution.find({ taskId, userId }).sort({ createdAt: -1 });
  return execs.map((e) => e.toObject());
}

async function findExecutionsByUserId(userId, limit) {
  const query = Execution.find({ userId }).sort({ createdAt: -1 });
  if (limit) query.limit(limit);
  const execs = await query;
  return execs.map((e) => e.toObject());
}

async function findRunningByUserId(userId) {
  const execs = await Execution.find({ userId, status: "running" });
  return execs.map((e) => e.toObject());
}

async function findStaleExecutions(timeoutMs) {
  const cutoff = new Date(Date.now() - timeoutMs);
  const execs = await Execution.find({
    status: "running",
    startedAt: { $lte: cutoff },
  });
  return execs.map((e) => e.toObject());
}

async function updateExecution(executionId, userId, updates) {
  const exec = await Execution.findOneAndUpdate(
    { _id: executionId, userId },
    { $set: updates },
    { returnDocument: "after" }
  );
  return exec ? exec.toObject() : null;
}

async function updateExecutionStatus(executionId, userId, newStatus, extra) {
  const execution = await Execution.findOne({ _id: executionId, userId });
  if (!execution) return null;

  const { canTransition } = require("../models/execution.model");
  if (!canTransition(execution.status, newStatus)) {
    return { error: `Cannot transition from ${execution.status} to ${newStatus}` };
  }

  const updates = { status: newStatus, ...extra };
  const exec = await Execution.findOneAndUpdate(
    { _id: executionId, userId, status: execution.status },
    { $set: updates },
    { returnDocument: "after" }
  );
  return exec ? exec.toObject() : null;
}

async function countExecutionsByUserId(userId) {
  return await Execution.countDocuments({ userId });
}

async function deleteExecution(executionId, userId) {
  const exec = await Execution.findOneAndDelete({ _id: executionId, userId });
  return exec ? exec.toObject() : null;
}

async function findPendingExecutions() {
  const execs = await Execution.find({
    $or: [
      { status: "pending" },
      { status: "failed", $expr: { $lt: ["$retryCount", "$maxRetries"] } },
    ],
  }).sort({ createdAt: 1 });
  return execs.map((e) => e.toObject());
}

async function resetForRetry(executionId, retryCount) {
  const exec = await Execution.findOneAndUpdate(
    { _id: executionId },
    {
      $set: {
        status: "pending",
        error: null,
        startedAt: null,
        completedAt: null,
        duration: null,
        retryCount,
      },
    },
    { returnDocument: "after" }
  );
  return exec ? exec.toObject() : null;
}

module.exports = {
  createExecution,
  findExecutionByIdAndUserId,
  findExecutionsByTaskId,
  findExecutionsByUserId,
  findRunningByUserId,
  findStaleExecutions,
  updateExecution,
  updateExecutionStatus,
  countExecutionsByUserId,
  deleteExecution,
  findPendingExecutions,
  resetForRetry,
};
