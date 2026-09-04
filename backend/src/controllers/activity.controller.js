const activityService = require("../services/activity.service");
const mongoose = require("mongoose");

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

async function listActivities(req, res, next) {
  try {
    const userId = req.user.userId;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;

    const activities = await activityService.getUserActivities(userId, limit, offset);

    res.status(200).json({
      success: true,
      data: { activities },
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

async function getTaskActivity(req, res, next) {
  try {
    const { taskId } = req.params;
    const userId = req.user.userId;

    if (!isValidObjectId(taskId)) {
      const err = new Error("Invalid task ID");
      err.statusCode = 400;
      return next(err);
    }

    const activities = await activityService.getTaskActivities(taskId, userId);

    res.status(200).json({
      success: true,
      data: { activities },
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

async function getExecutionActivity(req, res, next) {
  try {
    const { executionId } = req.params;
    const userId = req.user.userId;

    if (!isValidObjectId(executionId)) {
      const err = new Error("Invalid execution ID");
      err.statusCode = 400;
      return next(err);
    }

    const activities = await activityService.getExecutionActivities(executionId, userId);

    res.status(200).json({
      success: true,
      data: { activities },
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

async function deleteActivity(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    if (!isValidObjectId(id)) {
      const err = new Error("Invalid activity ID");
      err.statusCode = 400;
      return next(err);
    }

    const deleted = await activityService.deleteActivity(id, userId);
    if (!deleted) {
      const err = new Error("Activity not found");
      err.statusCode = 404;
      return next(err);
    }

    res.status(200).json({
      success: true,
      message: "Activity deleted",
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

async function markActivityRead(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    if (!isValidObjectId(id)) {
      const err = new Error("Invalid activity ID");
      err.statusCode = 400;
      return next(err);
    }

    const activity = await activityService.markActivityRead(id, userId);
    if (!activity) {
      const err = new Error("Activity not found");
      err.statusCode = 404;
      return next(err);
    }

    res.status(200).json({
      success: true,
      data: { activity },
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

async function markAllActivitiesRead(req, res, next) {
  try {
    const userId = req.user.userId;
    const modifiedCount = await activityService.markAllActivitiesRead(userId);

    res.status(200).json({
      success: true,
      data: { modifiedCount },
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

module.exports = { listActivities, getTaskActivity, getExecutionActivity, deleteActivity, markActivityRead, markAllActivitiesRead };
