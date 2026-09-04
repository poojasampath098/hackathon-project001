const { Router } = require("express");
const mongoose = require("mongoose");
const { verifyAccessToken } = require("../core/security");
const taskService = require("../services/task.service");
const eventBus = require("../core/eventBus");

const router = Router();

const HEARTBEAT_INTERVAL_MS = 30000;

const TASK_EVENT_TYPES = new Set([
  "task_created",
  "task_updated",
  "task_completed",
  "task_deleted",
]);
const EXECUTION_EVENT_TYPES = new Set([
  "execution_started",
  "execution_completed",
  "execution_failed",
  "execution_cancelled",
]);

function getSSEEventType(activityType) {
  if (TASK_EVENT_TYPES.has(activityType)) return "task";
  if (EXECUTION_EVENT_TYPES.has(activityType)) return "execution";
  return "activity";
}

router.get("/task/:taskId", async (req, res) => {
  const { taskId } = req.params;

  if (!taskId || !mongoose.Types.ObjectId.isValid(taskId)) {
    return res.status(400).json({ success: false, message: "Invalid task ID" });
  }

  let decoded;
  try {
    const token = req.query.token || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }
    decoded = verifyAccessToken(token);
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }

  const userId = decoded.userId;

  let task;
  try {
    task = await taskService.getTaskById(taskId, userId);
  } catch (_) {
    return res.status(500).json({ success: false, message: "Server error" });
  }

  if (!task) {
    return res.status(404).json({ success: false, message: "Task not found" });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  res.write(":\n\n");

  const taskData = taskService.formatTaskResponse(task);
  res.write(`event: task\ndata: ${JSON.stringify({ type: "task_initial", task: taskData })}\n\n`);

  const taskIdStr = task.id || task._id;

  const handler = (activity) => {
    const activityTaskId = activity.taskId
      ? activity.taskId.toString()
      : activity.taskId;
    if (activityTaskId !== taskIdStr) return;

    const payload = {
      type: activity.type,
      message: activity.message,
      taskId: taskIdStr,
      executionId: activity.executionId || null,
      metadata: activity.metadata || {},
      timestamp: activity.createdAt || new Date().toISOString(),
    };

    const eventType = getSSEEventType(activity.type);
    res.write(`event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`);
  };

  eventBus.onActivity(handler);

  const heartbeat = setInterval(() => {
    res.write(":\n\n");
  }, HEARTBEAT_INTERVAL_MS);

  const cleanup = () => {
    eventBus.offActivity(handler);
    clearInterval(heartbeat);
  };

  req.on("close", cleanup);
  req.on("aborted", cleanup);
});

module.exports = router;
