const aiService = require("../services/ai.service");
const logger = require("../core/logger");

const MAX_QUERY_LENGTH = 5000;
const MIN_QUERY_LENGTH = 2;

function validateQuery(query) {
  if (!query || typeof query !== "string") {
    return { valid: false, error: "Query is required and must be a string" };
  }
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) {
    return { valid: false, error: `Query must be at least ${MIN_QUERY_LENGTH} characters` };
  }
  if (trimmed.length > MAX_QUERY_LENGTH) {
    return { valid: false, error: `Query must not exceed ${MAX_QUERY_LENGTH} characters` };
  }
  return { valid: true, value: trimmed };
}

async function research(query) {
  const validation = validateQuery(query);
  if (!validation.valid) {
    throw Object.assign(new Error(validation.error), { statusCode: 400 });
  }

  const messages = [
    {
      role: "system",
      content: `You are a research assistant. Provide accurate, well-structured information based on your training knowledge.
Be factual and honest. If you are uncertain about something, say so.
Do not fabricate sources, URLs, or citations. Do not claim to have performed a live web search.
Format your response with clear sections and key points.`,
    },
    { role: "user", content: validation.value },
  ];

  try {
    const result = await aiService.chatCompletion(messages);
    if (!result || result.trim().length === 0) {
      return "No relevant information found for this query.";
    }
    return result;
  } catch (err) {
    logger.error("Research tool failed", {
      errorCategory: err.aiErrorCategory || "unknown",
      errorMessage: err.message,
    });
    throw err;
  }
}

module.exports = { research, validateQuery };
