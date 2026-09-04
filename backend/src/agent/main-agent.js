const aiService = require("../services/ai.service");
const logger = require("../core/logger");
const { parseTaskFromMessage, detectIntent, SYSTEM_PROMPT } = require("./intent");
const { executeTask } = require("./planner");
const searchTool = require("../tools/search.tool");
const fetchTool = require("../tools/fetch.tool");
const databaseTool = require("../tools/database.tool");
const documentTool = require("../tools/document.tool");

const TOOLS = {
  search: searchTool,
  fetch: fetchTool,
  database: databaseTool,
  document: documentTool,
};

async function buildUserContent(text, artifactContext) {
  const contexts = Array.isArray(artifactContext)
    ? artifactContext
    : artifactContext
    ? [artifactContext]
    : [];
  if (contexts.length === 0) return text;

  const images = [];
  const textParts = [];
  let imagePrepFailed = false;

  for (const ctx of contexts) {
    if (!ctx) continue;
    if (ctx.kind === "image" && ctx.secureUrl) {
      let dataUri;
      try {
        dataUri = await aiService.buildImageDataUri(ctx.secureUrl);
      } catch (err) {
        logger.warn("Failed to prepare artifact image", { error: err.message });
        imagePrepFailed = true;
        textParts.push(
          `Note: The referenced image (${ctx.name}) could not be prepared for analysis.`
        );
        continue;
      }
      images.push({ type: "image_url", image_url: { url: dataUri } });
    } else if (ctx.extractableText) {
      textParts.push(
        `Referenced file contents (${ctx.name}):\n"""\n${ctx.extractableText}\n"""`
      );
    } else if (ctx.kind === "unsupported") {
      textParts.push(
        `Note: The referenced file (${ctx.name}) is an unsupported format whose contents could not be read. Do not guess or invent its contents.`
      );
    }
  }

  const baseText =
    textParts.length > 0 ? `${text}\n\n${textParts.join("\n\n")}` : text;

  if (images.length > 0) {
    if (images.length === 1 && textParts.length === 0 && !imagePrepFailed) {
      return [
        { type: "text", text },
        { type: "image_url", image_url: { url: images[0].image_url.url } },
      ];
    }
    return [{ type: "text", text: baseText }, ...images];
  }

  return baseText;
}

async function handleConversation(message, artifactContext) {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: await buildUserContent(message, artifactContext) },
  ];
  return await aiService.chatCompletion(messages);
}

async function handleResearch(message, artifactContext) {
  const researchResult = await searchTool.research(message);
  const baseText = `The user asked: "${message}"\n\nHere is the research information:\n\n${researchResult}\n\nProvide a clear, well-structured response to the user based on this information.`;
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: await buildUserContent(baseText, artifactContext) },
  ];
  return await aiService.chatCompletion(messages);
}

async function handleAnalysis(message, artifactContext) {
  const messages = [
    {
      role: "system",
      content: `${SYSTEM_PROMPT}\n\nYou are performing an analysis. Be thorough, structured, and objective. Use comparisons, pros/cons, key points, and clear reasoning.`,
    },
    { role: "user", content: await buildUserContent(message, artifactContext) },
  ];
  return await aiService.chatCompletion(messages);
}

async function processMessage(userId, message, artifactContext) {
  const startTime = Date.now();

  try {
    const taskParsed = parseTaskFromMessage(message);
    if (taskParsed) {
      logger.info("AI intent detected", {
        intent: "task",
        taskAction: taskParsed.action,
        userId,
        duration: Date.now() - startTime,
      });
      return await executeTask(userId, taskParsed);
    }

    const intentResult = await detectIntent(message);
    const intent = intentResult.intent;

    logger.info("AI intent detected", {
      intent,
      taskAction: null,
      userId,
      duration: Date.now() - startTime,
    });

    switch (intent) {
      case "research":
        return await handleResearch(message, artifactContext);
      case "analysis":
        return await handleAnalysis(message, artifactContext);
      case "conversation":
      default:
        return await handleConversation(message, artifactContext);
    }
  } catch (err) {
    logger.error("Agent processing failed", err);

    if (err.message && err.message.includes("API key")) {
      throw new Error("AI service configuration error");
    }
    if (err.message && err.message.includes("Empty response")) {
      throw new Error("AI service returned an empty response. Please try again.");
    }
    if (err.code === "ECONNABORTED" || (err.message && err.message.includes("timeout"))) {
      throw new Error("AI service request timed out. Please try again.");
    }
    if (err.message && err.message.includes("currently unavailable")) {
      throw err;
    }

    throw new Error("AI service is currently unavailable. Please try again later.");
  }
}

function getTool(name) {
  return TOOLS[name] || null;
}

function getAvailableTools() {
  return Object.keys(TOOLS);
}

module.exports = { processMessage, getTool, getAvailableTools, TOOLS };
