const Activity = require("../models/activity.model");

async function createActivity(data) {
  const activity = await Activity.create({
    userId: data.userId,
    type: data.type,
    taskId: data.taskId || null,
    executionId: data.executionId || null,
    message: data.message || "",
    metadata: data.metadata || {},
  });
  return activity.toObject();
}

async function findActivitiesByUserId(userId, limit, offset) {
  const query = Activity.find({ userId }).sort({ createdAt: -1 });
  if (offset) query.skip(offset);
  if (limit) query.limit(limit);
  const activities = await query;
  return activities.map((a) => a.toObject());
}

async function findActivitiesByTaskId(taskId, userId) {
  const activities = await Activity.find({ taskId, userId }).sort({ createdAt: -1 });
  return activities.map((a) => a.toObject());
}

async function findActivitiesByExecutionId(executionId, userId) {
  const activities = await Activity.find({ executionId, userId }).sort({ createdAt: -1 });
  return activities.map((a) => a.toObject());
}

async function deleteActivity(activityId, userId) {
  const activity = await Activity.findOneAndDelete({ _id: activityId, userId });
  return activity ? activity.toObject() : null;
}

// Marks a single activity as read. The userId is scoped into the query so a
// user can only ever mark their own activities — another user's activity id
// resolves to null (no update, no leak).
async function markActivityRead(activityId, userId) {
  const activity = await Activity.findOneAndUpdate(
    { _id: activityId, userId },
    { $set: { read: true } },
    { returnDocument: "after" }
  );
  return activity ? activity.toObject() : null;
}

// Marks every unread activity of a single user as read. Always scoped to the
// authenticated user; never touches other users' activities.
async function markAllActivitiesRead(userId) {
  const result = await Activity.updateMany(
    { userId, read: { $ne: true } },
    { $set: { read: true } }
  );
  return result.modifiedCount || 0;
}

module.exports = {
  createActivity,
  findActivitiesByUserId,
  findActivitiesByTaskId,
  findActivitiesByExecutionId,
  deleteActivity,
  markActivityRead,
  markAllActivitiesRead,
};
