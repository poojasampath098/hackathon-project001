const logger = require("../core/logger");

function logExecutionStart(executionId, taskId) {
  logger.info("Execution started", { executionId, taskId });
}

function logExecutionStepStart(executionId, stepName) {
  logger.info("Execution step started", { executionId, step: stepName });
}

function logExecutionStepComplete(executionId, stepName, duration) {
  logger.info("Execution step completed", { executionId, step: stepName, duration });
}

function logExecutionStepFailed(executionId, stepName, error) {
  logger.error("Execution step failed", { executionId, step: stepName, error: error.message || error });
}

function logExecutionComplete(executionId, taskId, duration) {
  logger.info("Execution completed", { executionId, taskId, duration });
}

function logExecutionFailed(executionId, taskId, error) {
  logger.error("Execution failed", { executionId, taskId, error: error.message || error });
}

function logExecutionCancelled(executionId, taskId) {
  logger.info("Execution cancelled", { executionId, taskId });
}

function logExecutionTimeout(executionId, taskId) {
  logger.warn("Execution timed out", { executionId, taskId });
}

function logStaleExecutionRecovery(executionId, oldStatus) {
  logger.warn("Stale execution recovered", { executionId, oldStatus });
}

module.exports = {
  logExecutionStart,
  logExecutionStepStart,
  logExecutionStepComplete,
  logExecutionStepFailed,
  logExecutionComplete,
  logExecutionFailed,
  logExecutionCancelled,
  logExecutionTimeout,
  logStaleExecutionRecovery,
};
