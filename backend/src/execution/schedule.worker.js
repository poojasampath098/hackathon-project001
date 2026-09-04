const scheduleRepo = require("../db/repositories/schedule.repository");
const executionManager = require("./manager");
const executionRepo = require("../db/repositories/execution.repository");
const taskRepo = require("../db/repositories/task.repository");
const activityService = require("../services/activity.service");
const { computeNextRun } = require("../services/schedule.service");
const approvalService = require("../services/approval.service");
const logger = require("../core/logger");

const POLL_INTERVAL_MS = 30000;
let timer = null;
let running = false;

async function hasApprovedApproval(task, userId, execution) {
  if (!task.requiresApproval) return { ok: true };

  const approval = await approvalService.getApprovalByExecutionId(execution.id || execution._id);
  if (!approval || approval.status === "pending") {
    return {
      ok: false,
      deferred: true,
    };
  }
  if (approval.status === "approved") {
    return { ok: true };
  }
  return {
    ok: false,
    deferred: false,
    error: "Task requires approved approval before execution",
  };
}

async function processDueSchedules() {
  if (running) return;
  running = true;

  try {
    const dueSchedules = await scheduleRepo.findDueSchedules();

    for (const schedule of dueSchedules) {
      try {
        const task = await taskRepo.findTaskByIdAndUserId(schedule.taskId, schedule.userId);
        if (!task) {
          logger.warn("Schedule references missing task, disabling", { scheduleId: schedule.id, taskId: schedule.taskId });
          await scheduleRepo.updateSchedule(schedule.id, schedule.userId, { enabled: false });
          continue;
        }

        const existing = await executionRepo.findExecutionsByTaskId(schedule.taskId, schedule.userId);
        if (existing.some((e) => e.status === "pending" || e.status === "running")) {
          continue;
        }

        const execution = await executionManager.startExecution(schedule.taskId, schedule.userId, {});

        if (task.requiresApproval) {
          await approvalService.requestApproval(task.id, execution.id, schedule.userId).catch((err) => {
            logger.warn("Failed to create approval request for scheduled execution", {
              scheduleId: schedule.id, executionId: execution.id, error: err.message,
            });
          });
        }

        const approvalCheck = await hasApprovedApproval(task, schedule.userId, execution);

        if (approvalCheck.ok) {
          await executionManager.runExecution(execution.id, schedule.userId, task).catch((err) => {
            logger.warn("Scheduled execution failed", { scheduleId: schedule.id, executionId: execution.id, error: err.message });
          });
        } else if (!approvalCheck.deferred) {
          await executionRepo.updateExecutionStatus(
            execution.id,
            schedule.userId,
            "failed",
            {
              error: approvalCheck.error,
              completedAt: new Date(),
            }
          ).catch((err) => {
            logger.warn("Failed to mark blocked scheduled execution", { scheduleId: schedule.id, error: err.message });
          });
          logger.warn("Scheduled execution blocked: approval required", {
            scheduleId: schedule.id, executionId: execution.id, taskId: schedule.taskId,
          });
          activityService.logActivity(
            schedule.userId, "execution_failed", schedule.taskId,
            "Scheduled execution blocked: task requires approved approval",
            { scheduleId: schedule.id, executionId: execution.id }
          ).catch(() => {});
        }

        const updates = { lastRunAt: new Date() };

        if (schedule.frequency === "once") {
          updates.enabled = false;
        } else {
          updates.nextRunAt = computeNextRun(schedule.frequency, new Date());
        }

        await scheduleRepo.updateSchedule(schedule.id, schedule.userId, updates);

        activityService.logActivity(
          schedule.userId, "execution_started", schedule.taskId,
          `Scheduled execution triggered`,
          { scheduleId: schedule.id, executionId: execution.id, frequency: schedule.frequency }
        ).catch(() => {});

      } catch (err) {
        logger.error("Failed to process schedule", { scheduleId: schedule.id, error: err.message });
      }
    }
  } catch (err) {
    logger.error("Schedule worker poll failed", { error: err.message });
  } finally {
    running = false;
  }
}

function start() {
  if (timer) return;
  logger.info("Schedule worker started", { pollIntervalMs: POLL_INTERVAL_MS });
  timer = setInterval(processDueSchedules, POLL_INTERVAL_MS);
  if (timer.unref) timer.unref();
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    logger.info("Schedule worker stopped");
  }
}

module.exports = { start, stop, processDueSchedules, POLL_INTERVAL_MS };
