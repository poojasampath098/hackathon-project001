const mongoose = require("mongoose");
const scheduleRepo = require("../db/repositories/schedule.repository");

const VALID_FREQUENCIES = ["once", "daily", "weekly", "monthly"];

function validateObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function computeNextRun(frequency, from) {
  const date = new Date(from);
  switch (frequency) {
    case "daily": date.setDate(date.getDate() + 1); break;
    case "weekly": date.setDate(date.getDate() + 7); break;
    case "monthly": date.setMonth(date.getMonth() + 1); break;
    default: break;
  }
  return date;
}

// Single validation entry point for schedule-creation inputs. Shared by the
// standalone POST /api/schedules endpoint and atomic task creation, so the
// wizard path validates exactly like the dedicated Schedules page. Always
// throws a 4xx (never a bare 500) on invalid input.
function validateScheduleInput(taskId, frequency, nextRunAt) {
  if (!taskId || !nextRunAt) {
    throw Object.assign(new Error("taskId and nextRunAt are required"), { statusCode: 400 });
  }
  if (!validateObjectId(taskId)) {
    throw Object.assign(new Error("Invalid task ID"), { statusCode: 400 });
  }
  if (!VALID_FREQUENCIES.includes(frequency)) {
    throw Object.assign(
      new Error(`Frequency must be one of: ${VALID_FREQUENCIES.join(", ")}`),
      { statusCode: 400 }
    );
  }
  const date = new Date(nextRunAt);
  if (isNaN(date.getTime())) {
    throw Object.assign(new Error("Invalid nextRunAt date"), { statusCode: 400 });
  }
  return date;
}

async function createSchedule(taskId, userId, frequency, nextRunAt) {
  const nextRun = validateScheduleInput(taskId, frequency, nextRunAt);
  return await scheduleRepo.createSchedule({ taskId, userId, frequency, nextRunAt: nextRun });
}

async function getSchedule(scheduleId, userId) {
  if (!validateObjectId(scheduleId)) {
    throw Object.assign(new Error("Invalid schedule ID"), { statusCode: 400 });
  }

  const schedule = await scheduleRepo.findScheduleByIdAndUserId(scheduleId, userId);
  if (!schedule) throw Object.assign(new Error("Schedule not found"), { statusCode: 404 });
  return schedule;
}

async function listUserSchedules(userId) {
  return await scheduleRepo.findSchedulesByUserId(userId);
}

async function toggleSchedule(scheduleId, userId, enabled) {
  if (!validateObjectId(scheduleId)) {
    throw Object.assign(new Error("Invalid schedule ID"), { statusCode: 400 });
  }

  const result = await scheduleRepo.updateSchedule(scheduleId, userId, { enabled });
  if (!result) throw Object.assign(new Error("Schedule not found"), { statusCode: 404 });
  return result;
}

async function updateScheduleById(scheduleId, userId, body) {
  if (!validateObjectId(scheduleId)) {
    throw Object.assign(new Error("Invalid schedule ID"), { statusCode: 400 });
  }

  const allowed = {};

  if (body.frequency !== undefined) {
    if (!VALID_FREQUENCIES.includes(body.frequency)) {
      throw Object.assign(
        new Error(`Frequency must be one of: ${VALID_FREQUENCIES.join(", ")}`),
        { statusCode: 400 }
      );
    }
    allowed.frequency = body.frequency;
  }

  if (body.nextRunAt !== undefined) {
    const date = new Date(body.nextRunAt);
    if (isNaN(date.getTime())) {
      throw Object.assign(new Error("Invalid nextRunAt date"), { statusCode: 400 });
    }
    allowed.nextRunAt = date;
  }

  if (body.taskId !== undefined) {
    if (!validateObjectId(body.taskId)) {
      throw Object.assign(new Error("Invalid task ID"), { statusCode: 400 });
    }
    allowed.taskId = body.taskId;
  }

  if (body.enabled !== undefined) {
    allowed.enabled = !!body.enabled;
  }

  if (Object.keys(allowed).length === 0) {
    throw Object.assign(new Error("No valid fields to update"), { statusCode: 400 });
  }

  const result = await scheduleRepo.updateSchedule(scheduleId, userId, allowed);
  if (!result) throw Object.assign(new Error("Schedule not found"), { statusCode: 404 });
  return result;
}

async function deleteSchedule(scheduleId, userId) {
  if (!validateObjectId(scheduleId)) {
    throw Object.assign(new Error("Invalid schedule ID"), { statusCode: 400 });
  }

  const result = await scheduleRepo.deleteSchedule(scheduleId, userId);
  if (!result) throw Object.assign(new Error("Schedule not found"), { statusCode: 404 });
  return result;
}

module.exports = { createSchedule, getSchedule, listUserSchedules, toggleSchedule, updateScheduleById, deleteSchedule, computeNextRun, validateScheduleInput, VALID_FREQUENCIES };
