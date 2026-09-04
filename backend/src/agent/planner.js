const taskService = require("../services/task.service");
const { buildTaskResponse } = require("./response");

async function executeTask(userId, parsed) {
  let result;
  switch (parsed.action) {
    case "create":
      result = await taskService.createTask(
        {
          title: parsed.title,
          description: parsed.description,
          priority: parsed.priority,
          requiresApproval: parsed.requiresApproval,
        },
        userId
      );
      break;
    case "list":
      result = await taskService.getUserTasks(userId);
      break;
    default:
      result = null;
  }

  return buildTaskResponse(parsed.action, result);
}

module.exports = { executeTask };
