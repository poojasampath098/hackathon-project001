const executionLogger = require("./logger");
const aiService = require("../services/ai.service");

async function execute(execution, task, userId) {
  executionLogger.logExecutionStart(execution.id, task._id || task.id);

  const startTime = Date.now();

  try {
    if (execution.steps && execution.steps.length > 0) {
      return await executeSteps(execution, task, startTime);
    }

    const result = await runTask(task, execution.input);
    const duration = Date.now() - startTime;

    executionLogger.logExecutionComplete(execution.id, task._id || task.id, duration);

    return { output: result, duration, steps: [] };
  } catch (err) {
    const duration = Date.now() - startTime;
    executionLogger.logExecutionFailed(execution.id, task._id || task.id, err);

    throw err;
  }
}

async function executeSteps(execution, task, startTime) {
  const results = [];

  for (let i = 0; i < execution.steps.length; i++) {
    const step = execution.steps[i];
    const stepStart = Date.now();

    executionLogger.logExecutionStepStart(execution.id, step.name);

    try {
      const stepResult = await executeStep(step, execution.input, task);
      const stepDuration = Date.now() - stepStart;

      executionLogger.logExecutionStepComplete(execution.id, step.name, stepDuration);

      results.push({
        name: step.name,
        status: "completed",
        input: step.input || null,
        output: stepResult,
        duration: stepDuration,
      });
    } catch (err) {
      const stepDuration = Date.now() - stepStart;
      executionLogger.logExecutionStepFailed(execution.id, step.name, err);

      results.push({
        name: step.name,
        status: "failed",
        input: step.input || null,
        output: null,
        error: err.message,
        duration: stepDuration,
      });

      const failedStepIndex = i;
      for (let j = i + 1; j < execution.steps.length; j++) {
        results.push({
          name: execution.steps[j].name,
          status: "skipped",
          input: null,
          output: null,
          error: "Skipped due to previous step failure",
          duration: null,
        });
      }

      const duration = Date.now() - startTime;
      return { output: { results, failedStep: failedStepIndex }, duration, steps: results };
    }
  }

  const duration = Date.now() - startTime;
  executionLogger.logExecutionComplete(execution.id, task._id || task.id, duration);

  return { output: { results }, duration, steps: results };
}

const EXECUTION_SYSTEM_PROMPT =
  "You are AetherAI, an autonomous agent executing a user's task. " +
  "Produce a concrete, well-structured deliverable using the task details and input provided. " +
  "Do not ask clarifying questions. Return only the final result in clear prose or structured text.";

function buildTaskUserPrompt(task, input) {
  const parts = [`Task: ${task.title}`];
  if (task.description && task.description.trim()) {
    parts.push(`Description: ${task.description}`);
  }
  const hasInput =
    input && typeof input === "object" && Object.keys(input).length > 0;
  if (hasInput) {
    parts.push(`Input:\n"""\n${JSON.stringify(input, null, 2)}\n"""`);
  }
  parts.push("\nExecute the task and return the result.");
  return parts.join("\n\n");
}

async function executeStep(step, globalInput, task) {
  const input = step.input || globalInput || {};

  const content = await aiService.chatCompletion([
    { role: "system", content: EXECUTION_SYSTEM_PROMPT },
    {
      role: "user",
      content: `Task: ${task.title}\n\nCurrent step: ${step.name}\n\nStep input:\n"""\n${JSON.stringify(
        input,
        null,
        2
      )}\n"""\n\nExecute this step and return its output.`,
    },
  ]);

  return {
    stepName: step.name,
    taskTitle: task.title,
    status: "completed",
    input: input,
    output: content,
    timestamp: new Date().toISOString(),
  };
}

async function runTask(task, input) {
  const content = await aiService.chatCompletion([
    { role: "system", content: EXECUTION_SYSTEM_PROMPT },
    { role: "user", content: buildTaskUserPrompt(task, input || {}) },
  ]);

  return {
    taskTitle: task.title,
    status: "completed",
    message: `Task "${task.title}" executed successfully`,
    output: content,
    input: input || {},
    timestamp: new Date().toISOString(),
  };
}

module.exports = { execute, runTask, executeSteps, executeStep };
