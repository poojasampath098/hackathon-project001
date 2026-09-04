const scheduleService = require("../services/schedule.service");
const activityService = require("../services/activity.service");

async function createSchedule(req, res, next) {
  try {
    const { taskId, frequency, nextRunAt } = req.body;
    const userId = req.user.userId;

    if (!taskId || !nextRunAt) {
      const err = new Error("taskId and nextRunAt are required");
      err.statusCode = 400;
      return next(err);
    }

    const schedule = await scheduleService.createSchedule(taskId, userId, frequency || "once", nextRunAt);

    activityService.logActivity(
      userId, "schedule_created", taskId,
      `Schedule created`,
      { scheduleId: schedule.id, frequency: frequency || "once", nextRunAt }
    ).catch(() => {});

    res.status(201).json({
      success: true,
      message: "Schedule created",
      data: { schedule },
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

async function getSchedule(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const schedule = await scheduleService.getSchedule(id, userId);

    res.status(200).json({
      success: true,
      data: { schedule },
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

async function listSchedules(req, res, next) {
  try {
    const userId = req.user.userId;
    const schedules = await scheduleService.listUserSchedules(userId);

    res.status(200).json({
      success: true,
      data: { schedules },
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

async function toggleSchedule(req, res, next) {
  try {
    const { id } = req.params;
    const { enabled } = req.body;
    const userId = req.user.userId;

    const schedule = await scheduleService.toggleSchedule(id, userId, enabled !== false);

    activityService.logActivity(
      userId, "schedule_toggled", schedule.taskId,
      `Schedule ${enabled !== false ? "enabled" : "disabled"}`,
      { scheduleId: id, enabled: enabled !== false }
    ).catch(() => {});

    res.status(200).json({
      success: true,
      message: `Schedule ${enabled !== false ? "enabled" : "disabled"}`,
      data: { schedule },
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

async function updateSchedule(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const schedule = await scheduleService.updateScheduleById(id, userId, req.body);

    activityService.logActivity(
      userId, "schedule_toggled", schedule.taskId,
      `Schedule updated`,
      { scheduleId: id, updates: Object.keys(req.body) }
    ).catch(() => {});

    res.status(200).json({
      success: true,
      message: "Schedule updated",
      data: { schedule },
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

async function deleteSchedule(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const schedule = await scheduleService.getSchedule(id, userId);

    await scheduleService.deleteSchedule(id, userId);

    activityService.logActivity(
      userId, "schedule_deleted", schedule ? schedule.taskId : null,
      `Schedule deleted`,
      { scheduleId: id }
    ).catch(() => {});

    res.status(200).json({
      success: true,
      message: "Schedule deleted",
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

module.exports = { createSchedule, getSchedule, listSchedules, toggleSchedule, updateSchedule, deleteSchedule };
