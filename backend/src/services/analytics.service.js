const Task = require("../db/models/task.model");
const Execution = require("../db/models/execution.model");
const Approval = require("../db/models/approval.model");
const Activity = require("../db/models/activity.model");

async function getTaskStats(userId) {
  const pipeline = [
    { $match: { userId: new (require("mongoose").Types.ObjectId)(userId) } },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ];

  const results = await Task.aggregate(pipeline);
  const byStatus = {};
  let total = 0;

  for (const r of results) {
    byStatus[r._id] = r.count;
    total += r.count;
  }

  const priorityPipeline = [
    { $match: { userId: new (require("mongoose").Types.ObjectId)(userId) } },
    {
      $group: {
        _id: "$priority",
        count: { $sum: 1 },
      },
    },
  ];

  const priorityResults = await Task.aggregate(priorityPipeline);
  const byPriority = {};
  for (const r of priorityResults) {
    byPriority[r._id] = r.count;
  }

  return {
    total,
    byStatus,
    byPriority,
    completionRate: total > 0 ? Math.round(((byStatus.completed || 0) / total) * 100) : 0,
  };
}

async function getExecutionStats(userId) {
  const pipeline = [
    { $match: { userId: new (require("mongoose").Types.ObjectId)(userId) } },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalDuration: { $sum: { $ifNull: ["$duration", 0] } },
        durationCount: {
          $sum: {
            $cond: [{ $gt: ["$duration", null] }, 1, 0],
          },
        },
      },
    },
  ];

  const results = await Execution.aggregate(pipeline);
  const byStatus = {};
  let total = 0;
  let totalDuration = 0;
  let durationCount = 0;

  for (const r of results) {
    byStatus[r._id] = r.count;
    total += r.count;
    totalDuration += r.totalDuration;
    durationCount += r.durationCount;
  }

  return {
    total,
    byStatus,
    avgDuration: durationCount > 0 ? Math.round(totalDuration / durationCount) : 0,
  };
}

async function getActivityStats(userId) {
  const pipeline = [
    { $match: { userId: new (require("mongoose").Types.ObjectId)(userId) } },
    {
      $group: {
        _id: "$type",
        count: { $sum: 1 },
      },
    },
  ];

  const results = await Activity.aggregate(pipeline);
  const byType = {};
  let total = 0;

  for (const r of results) {
    byType[r._id] = r.count;
    total += r.count;
  }

  return {
    total,
    byType,
  };
}

async function getApprovalStats(userId) {
  const pipeline = [
    { $match: { userId: new (require("mongoose").Types.ObjectId)(userId) } },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ];

  const results = await Approval.aggregate(pipeline);
  const byStatus = {};
  let total = 0;

  for (const r of results) {
    byStatus[r._id] = r.count;
    total += r.count;
  }

  return {
    total,
    byStatus,
  };
}

async function getUserAnalytics(userId) {
  const [taskStats, executionStats, activityStats, approvalStats] = await Promise.all([
    getTaskStats(userId),
    getExecutionStats(userId),
    getActivityStats(userId),
    getApprovalStats(userId),
  ]);

  return { taskStats, executionStats, activityStats, approvalStats };
}

module.exports = { getUserAnalytics, getTaskStats, getExecutionStats, getActivityStats, getApprovalStats };
