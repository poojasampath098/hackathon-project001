const agentService = require("../services/agent.service");
const aiService = require("../services/ai.service");
const searchTool = require("../tools/search.tool");
const taskService = require("../services/task.service");
const artifactService = require("../services/artifact.service");
const activityService = require("../services/activity.service");
const chatMessageRepo = require("../db/repositories/chat-message.repository");
const logger = require("../core/logger");
const mongoose = require("mongoose");

const DEFAULT_THREAD_ID = "data-extraction";

const MAX_MESSAGE_LENGTH = 10000;
const MAX_QUERY_LENGTH = 5000;
const MAX_PROMPT_LENGTH = 10000;
const MAX_FOCUS_LENGTH = 2000;

function validateStringField(value, fieldName, maxLength) {
  if (!value || typeof value !== "string") {
    const err = new Error(`${fieldName} is required`);
    err.statusCode = 400;
    return { valid: false, err };
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    const err = new Error(`${fieldName} cannot be empty`);
    err.statusCode = 400;
    return { valid: false, err };
  }
  if (trimmed.length > maxLength) {
    const err = new Error(`${fieldName} is too long (max ${maxLength} characters)`);
    err.statusCode = 400;
    return { valid: false, err };
  }
  return { valid: true, value: trimmed };
}

function handleAiError(err, res, next) {
  if (!err.statusCode) {
    err.statusCode = 500;
  }
  next(err);
}

async function chat(req, res, next) {
  try {
    const { message, artifactId, artifactIds, threadId } = req.body;
    const userId = req.user.userId;

    const rawText = typeof message === "string" ? message.trim() : "";

    let artifactIdsList = [];
    if (artifactId) artifactIdsList.push(artifactId);
    if (Array.isArray(artifactIds)) artifactIdsList = artifactIdsList.concat(artifactIds);
    artifactIdsList = [...new Set(artifactIdsList)];

    if (rawText.length === 0 && artifactIdsList.length === 0) {
      const err = new Error("Message is required");
      err.statusCode = 400;
      return next(err);
    }
    if (rawText.length > MAX_MESSAGE_LENGTH) {
      const err = new Error(`Message is too long (max ${MAX_MESSAGE_LENGTH} characters)`);
      err.statusCode = 400;
      return next(err);
    }

    const artifactContexts = [];
    const attachmentSnapshots = [];
    for (const id of artifactIdsList) {
      if (typeof id !== "string" || !mongoose.Types.ObjectId.isValid(id)) {
        const err = new Error("Invalid artifactId");
        err.statusCode = 400;
        return next(err);
      }

      const artifact = await artifactService.getArtifactById(id, userId);
      if (!artifact) {
        const err = new Error("Artifact not found");
        err.statusCode = 404;
        return next(err);
      }

      const content = artifact.content || {};
      const name = artifact.name || "file";

      let ctx;
      if (content.secureUrl) {
        ctx = { kind: "image", name, secureUrl: content.secureUrl };
      } else if (typeof content.extractableText === "string" && content.extractableText.trim().length > 0) {
        ctx = { kind: "text", name, extractableText: content.extractableText };
      } else {
        ctx = { kind: "unsupported", name };
      }

      artifactContexts.push(ctx);
      attachmentSnapshots.push({
        artifactId: id,
        name,
        secureUrl: content.secureUrl || null,
        mimetype: content.mimetype || null,
      });
    }

    const effectiveText = rawText || "Analyze the attached file(s).";

    const response = await agentService.processMessage(
      userId,
      effectiveText,
      artifactContexts.length ? artifactContexts : null
    );

    const chatThreadId = typeof threadId === "string" && threadId.trim() ? threadId.trim() : DEFAULT_THREAD_ID;

    if (rawText.length > 0 || artifactIdsList.length > 0) {
      await chatMessageRepo.addMessage({
        userId,
        threadId: chatThreadId,
        role: "user",
        messageType:
          artifactIdsList.length > 0 && rawText.length === 0
            ? "file"
            : artifactIdsList.length > 0
            ? "composed"
            : "text",
        content: rawText,
        attachments: attachmentSnapshots,
      });
    }

    if (response) {
      await chatMessageRepo.addMessage({
        userId,
        threadId: chatThreadId,
        role: "agent",
        messageType: "text",
        content: response,
        attachments: [],
      });
    }

    activityService.logActivity(
      userId, "ai_request", null,
      `AI chat request processed`,
      {
        messageLength: rawText.length,
        responseLength: response ? response.length : 0,
        artifactId: artifactIdsList[0] || null,
        artifactCount: artifactIdsList.length,
      }
    ).catch(() => {});

    res.status(200).json({
      success: true,
      message: "AI response generated successfully",
      data: { response },
    });
  } catch (err) {
    handleAiError(err, res, next);
  }
}

async function getHistory(req, res, next) {
  try {
    const userId = req.user.userId;
    const threadId =
      typeof req.query.threadId === "string" && req.query.threadId.trim()
        ? req.query.threadId.trim()
        : DEFAULT_THREAD_ID;
    const limit = parseInt(req.query.limit, 10);
    const messages = await chatMessageRepo.getHistory(
      userId,
      threadId,
      Number.isNaN(limit) || limit <= 0 ? 100 : Math.min(limit, 500)
    );

    res.status(200).json({
      success: true,
      data: { messages },
    });
  } catch (err) {
    handleAiError(err, res, next);
  }
}

async function research(req, res, next) {
  try {
    const { query } = req.body;
    const userId = req.user.userId;

    const validation = validateStringField(query, "Query", MAX_QUERY_LENGTH);
    if (!validation.valid) return next(validation.err);

    const response = await searchTool.research(validation.value);

    activityService.logActivity(
      userId, "ai_request", null,
      `AI research request processed`,
      { queryLength: validation.value.length, responseLength: response ? response.length : 0 }
    ).catch(() => {});

    res.status(200).json({
      success: true,
      message: "Research completed successfully",
      data: { query: validation.value, response },
    });
  } catch (err) {
    handleAiError(err, res, next);
  }
}

async function generate(req, res, next) {
  try {
    const { prompt, context, type } = req.body;
    const userId = req.user.userId;

    const promptValidation = validateStringField(prompt, "Prompt", MAX_PROMPT_LENGTH);
    if (!promptValidation.valid) return next(promptValidation.err);

    const systemParts = [
      "You are the Aether Platform AI assistant.",
      "Generate high-quality, well-structured content based on the user's prompt.",
      "Be clear, helpful, and accurate.",
      "Do not fabricate sources, URLs, or citations.",
    ];

    if (context && typeof context === "string" && context.trim().length > 0) {
      if (context.trim().length > MAX_FOCUS_LENGTH) {
        const err = new Error("Context is too long");
        err.statusCode = 400;
        return next(err);
      }
      systemParts.push(`Additional context provided by the user:\n\n${context.trim()}`);
    }

    if (type && typeof type === "string" && type.trim().length > 0) {
      systemParts.push(`Content type: ${type.trim()}`);
    }

    const messages = [
      { role: "system", content: systemParts.join("\n\n") },
      { role: "user", content: promptValidation.value },
    ];

    const response = await aiService.chatCompletion(messages);

    activityService.logActivity(
      userId, "ai_request", null,
      `AI generation request processed`,
      { promptLength: promptValidation.value.length, responseLength: response ? response.length : 0, type: type || "general" }
    ).catch(() => {});

    res.status(200).json({
      success: true,
      message: "Content generated successfully",
      data: { response, type: type || "general" },
    });
  } catch (err) {
    handleAiError(err, res, next);
  }
}

async function analyze(req, res, next) {
  try {
    const { taskId } = req.params;
    const { focus } = req.body || {};
    const userId = req.user.userId;

    if (!taskId || typeof taskId !== "string" || taskId.trim().length === 0) {
      const err = new Error("Task ID is required");
      err.statusCode = 400;
      return next(err);
    }

    if (!taskService.isValidObjectId(taskId.trim())) {
      const err = new Error("Invalid task ID format");
      err.statusCode = 400;
      return next(err);
    }

    const task = await taskService.getTaskById(taskId.trim(), userId);
    if (!task) {
      const err = new Error("Task not found");
      err.statusCode = 404;
      return next(err);
    }

    const systemParts = [
      "You are the Aether Platform AI assistant performing a task analysis.",
      "Analyze the given task and provide structured insights.",
      "Include: status assessment, priority evaluation, potential risks, recommended next steps, and any observations.",
      "Be thorough, objective, and actionable.",
    ];

    let userContent = `Analyze the following task:\n\n`;
    userContent += `Title: ${task.title}\n`;
    userContent += `Status: ${task.status}\n`;
    userContent += `Priority: ${task.priority}\n`;
    userContent += `Description: ${task.description || "No description provided"}\n`;
    userContent += `Schedule Type: ${task.scheduleType}\n`;
    if (task.agent) userContent += `Agent: ${task.agent}\n`;
    if (task.scheduledTime) userContent += `Scheduled Time: ${task.scheduledTime}\n`;
    userContent += `Requires Approval: ${task.requiresApproval ? "Yes" : "No"}\n`;
    userContent += `Created: ${task.createdAt}\n`;
    userContent += `Last Updated: ${task.updatedAt}\n`;

    if (focus && typeof focus === "string" && focus.trim().length > 0) {
      if (focus.trim().length > MAX_FOCUS_LENGTH) {
        const err = new Error("Focus is too long");
        err.statusCode = 400;
        return next(err);
      }
      userContent += `\nSpecific analysis focus: ${focus.trim()}`;
    }

    const messages = [
      { role: "system", content: systemParts.join("\n\n") },
      { role: "user", content: userContent },
    ];

    const response = await aiService.chatCompletion(messages);

    activityService.logActivity(
      userId, "ai_request", task.id,
      `AI task analysis completed`,
      { taskId: task.id, taskTitle: task.title, focusLength: focus ? focus.length : 0, responseLength: response ? response.length : 0 }
    ).catch(() => {});

    res.status(200).json({
      success: true,
      message: "Task analysis completed successfully",
      data: {
        response,
        task: {
          id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
          scheduleType: task.scheduleType,
        },
      },
    });
  } catch (err) {
    handleAiError(err, res, next);
  }
}

module.exports = { chat, research, generate, analyze, getHistory };
