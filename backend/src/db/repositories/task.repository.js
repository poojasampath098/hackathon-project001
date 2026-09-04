const Task = require("../models/task.model");

async function createTask(data) {
  const task = await Task.create({
    title: data.title,
    description: data.description || "",
    priority: data.priority || "medium",
    userId: data.userId,
    requiresApproval: data.requiresApproval || false,
    agent: data.agent || "",
    scheduledTime: data.scheduledTime || "",
    scheduleType: data.scheduleType || "once",
  });
  return task.toObject();
}

async function findTasksByUserId(userId, filter) {
  const query = { userId };
  if (filter && filter.status) {
    query.status = filter.status;
  }
  const tasks = await Task.find(query).sort({ createdAt: -1 });
  return tasks.map((t) => t.toObject());
}

async function findTaskByIdAndUserId(taskId, userId) {
  const task = await Task.findOne({ _id: taskId, userId });
  return task ? task.toObject() : null;
}

async function updateTask(taskId, userId, updates) {
  const task = await Task.findOneAndUpdate(
    { _id: taskId, userId },
    { $set: updates },
    { returnDocument: "after" }
  );
  return task ? task.toObject() : null;
}

async function deleteTask(taskId, userId) {
  const task = await Task.findOneAndDelete({ _id: taskId, userId });
  return task ? task.toObject() : null;
}

module.exports = { createTask, findTasksByUserId, findTaskByIdAndUserId, updateTask, deleteTask };
