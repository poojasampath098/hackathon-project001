const Schedule = require("../models/schedule.model");

async function createSchedule(data) {
  const schedule = await Schedule.create({
    taskId: data.taskId,
    userId: data.userId,
    frequency: data.frequency || "once",
    nextRunAt: data.nextRunAt,
  });
  return schedule.toObject();
}

async function findScheduleByIdAndUserId(scheduleId, userId) {
  const schedule = await Schedule.findOne({ _id: scheduleId, userId });
  return schedule ? schedule.toObject() : null;
}

async function findSchedulesByUserId(userId) {
  const schedules = await Schedule.find({ userId }).sort({ nextRunAt: 1 });
  return schedules.map((s) => s.toObject());
}

async function findDueSchedules() {
  const now = new Date();
  const schedules = await Schedule.find({ enabled: true, nextRunAt: { $lte: now } });
  return schedules.map((s) => s.toObject());
}

async function updateSchedule(scheduleId, userId, updates) {
  const schedule = await Schedule.findOneAndUpdate(
    { _id: scheduleId, userId },
    { $set: updates },
    { returnDocument: "after" }
  );
  return schedule ? schedule.toObject() : null;
}

async function deleteSchedule(scheduleId, userId) {
  const schedule = await Schedule.findOneAndDelete({ _id: scheduleId, userId });
  return schedule ? schedule.toObject() : null;
}

module.exports = { createSchedule, findScheduleByIdAndUserId, findSchedulesByUserId, findDueSchedules, updateSchedule, deleteSchedule };
