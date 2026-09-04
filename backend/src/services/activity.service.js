const activityRepo = require("../db/repositories/activity.repository");
const eventBus = require("../core/eventBus");

async function logActivity(userId, type, taskId, message, metadata, executionId) {
  const activity = await activityRepo.createActivity({
    userId,
    type,
    taskId: taskId || null,
    executionId: executionId || null,
    message: message || "",
    metadata: metadata || {},
  });

  try {
    eventBus.emitActivity(activity);
  } catch (_) {}

  return activity;
}

async function getUserActivities(userId, limit, offset) {
  return await activityRepo.findActivitiesByUserId(userId, limit || 50, offset || 0);
}

async function getTaskActivities(taskId, userId) {
  return await activityRepo.findActivitiesByTaskId(taskId, userId);
}

async function getExecutionActivities(executionId, userId) {
  return await activityRepo.findActivitiesByExecutionId(executionId, userId);
}

async function deleteActivity(activityId, userId) {
  return await activityRepo.deleteActivity(activityId, userId);
}

async function markActivityRead(activityId, userId) {
  return await activityRepo.markActivityRead(activityId, userId);
}

async function markAllActivitiesRead(userId) {
  return await activityRepo.markAllActivitiesRead(userId);
}

module.exports = {
  logActivity,
  getUserActivities,
  getTaskActivities,
  getExecutionActivities,
  deleteActivity,
  markActivityRead,
  markAllActivitiesRead,
};
