const taskService = require("../services/task.service");
const activityService = require("../services/activity.service");

async function createTask(req, res, next) {
  try {
    const userId = req.user.userId;

    const errors = taskService.validateCreateInput(req.body);
    if (errors.length > 0) {
      const err = new Error(errors[0]);
      err.statusCode = 400;
      return next(err);
    }

    const { task, schedule } = await taskService.createTask(req.body, userId);

    activityService.logActivity(
      userId, "task_created", task.id,
      `Task "${task.title}" created`,
      { title: task.title, priority: task.priority }
    ).catch(() => {});

    if (schedule) {
      activityService.logActivity(
        userId, "schedule_created", task.id,
        "Schedule created",
        { scheduleId: schedule.id, frequency: schedule.frequency, nextRunAt: schedule.nextRunAt }
      ).catch(() => {});
    }

    res.status(201).json({
      success: true,
      message: "Task created successfully",
      data: { task: taskService.formatTaskResponse(task), schedule },
    });
  } catch (err) {
    next(err);
  }
}

async function getTasks(req, res, next) {
  try {
    const userId = req.user.userId;
    const filter = {};
    if (req.query.status) {
      filter.status = req.query.status;
    }
    const tasks = await taskService.getUserTasks(userId, filter);

    res.status(200).json({
      success: true,
      message: "Tasks retrieved successfully",
      data: { tasks: tasks.map(taskService.formatTaskResponse) },
    });
  } catch (err) {
    next(err);
  }
}

async function getTask(req, res, next) {
  try {
    const { id } = req.params;

    if (!taskService.isValidObjectId(id)) {
      const err = new Error("Invalid task ID");
      err.statusCode = 400;
      return next(err);
    }

    const task = await taskService.getTaskById(id, req.user.userId);
    if (!task) {
      const err = new Error("Task not found");
      err.statusCode = 404;
      return next(err);
    }

    res.status(200).json({
      success: true,
      message: "Task retrieved successfully",
      data: { task: taskService.formatTaskResponse(task) },
    });
  } catch (err) {
    next(err);
  }
}

async function updateTask(req, res, next) {
  try {
    const { id } = req.params;

    if (!taskService.isValidObjectId(id)) {
      const err = new Error("Invalid task ID");
      err.statusCode = 400;
      return next(err);
    }

    const { errors, allowed } = taskService.validateUpdateInput(req.body);
    if (errors.length > 0) {
      const err = new Error(errors[0]);
      err.statusCode = 400;
      return next(err);
    }

    if (Object.keys(allowed).length === 0) {
      const err = new Error("No valid fields to update");
      err.statusCode = 400;
      return next(err);
    }

    const task = await taskService.updateTaskById(id, req.user.userId, allowed);
    if (!task) {
      const err = new Error("Task not found");
      err.statusCode = 404;
      return next(err);
    }

    const activityType = allowed.status === "completed" ? "task_completed" : "task_updated";
    const activityMessage = allowed.status === "completed"
      ? `Task "${task.title}" completed`
      : `Task "${task.title}" updated`;
    activityService.logActivity(
      req.user.userId, activityType, task.id,
      activityMessage,
      { title: task.title, updates: Object.keys(allowed) }
    ).catch(() => {});

    res.status(200).json({
      success: true,
      message: "Task updated successfully",
      data: { task: taskService.formatTaskResponse(task) },
    });
  } catch (err) {
    next(err);
  }
}

async function deleteTask(req, res, next) {
  try {
    const { id } = req.params;

    if (!taskService.isValidObjectId(id)) {
      const err = new Error("Invalid task ID");
      err.statusCode = 400;
      return next(err);
    }

    const task = await taskService.deleteTaskById(id, req.user.userId);
    if (!task) {
      const err = new Error("Task not found");
      err.statusCode = 404;
      return next(err);
    }

    activityService.logActivity(
      req.user.userId, "task_deleted", task.id,
      `Task "${task.title}" deleted`,
      { title: task.title }
    ).catch(() => {});

    res.status(200).json({
      success: true,
      message: "Task deleted successfully",
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { createTask, getTasks, getTask, updateTask, deleteTask };
