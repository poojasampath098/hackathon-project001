const { getClient } = require("../core/ai.config");
const config = require("../core/config");
const logger = require("../core/logger");

const MAX_RESPONSE_TOKENS = 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 1000;

function classifyError(err) {
  const status = err.status || (err.response && err.response.status);
  const code = err.code || "";
  const msg = (err.message || "").toLowerCase();

  if (
    code === "ECONNABORTED" ||
    code === "ETIMEDOUT" ||
    msg.includes("timed out") ||
    msg.includes("timeout") ||
    msg.includes("aborted")
  ) {
    return { category: "timeout", retriable: false };
  }
  if (status === 401 || status === 403 || msg.includes("api key") || msg.includes("unauthorized")) {
    return { category: "auth", retriable: false };
  }
  if (status === 429 || msg.includes("rate limit")) {
    return { category: "rate_limit", retriable: true };
  }
  if (status >= 500 || msg.includes("server error") || msg.includes("overloaded")) {
    return { category: "server", retriable: true };
  }
  if (
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "ENETUNREACH" ||
    code === "EAI_AGAIN" ||
    code === "ECONNECTION" ||
    msg.includes("socket hang up") ||
    msg.includes("connection error") ||
    msg.includes("network")
  ) {
    return { category: "network", retriable: true };
  }
  if (status === 400 || status === 422 || msg.includes("invalid")) {
    return { category: "invalid_request", retriable: false };
  }
  return { category: "unknown", retriable: false };
}

function formatUserError(classified) {
  switch (classified.category) {
    case "timeout":
      return "AI service request timed out. Please try again.";
    case "auth":
      return "AI service configuration error. Please contact support.";
    case "rate_limit":
      return "AI service rate limit exceeded. Please wait a moment and try again.";
    case "server":
      return "AI service is temporarily unavailable. Please try again later.";
    case "network":
      return "Network error communicating with AI service. Please try again.";
    case "invalid_request":
      return "AI service rejected the request. Please try rephrasing.";
    default:
      return "AI service is currently unavailable. Please try again later.";
  }
}

async function chatCompletion(messages, options) {
  const startTime = Date.now();
  const requestModel = (options && options.model) || config.aiModel;
  const requestTimeout = (options && options.timeout) || config.aiTimeoutMs;

  let lastErr = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      logger.info("AI request retrying", {
        attempt,
        model: requestModel,
        errorCategory: lastErr ? classifyError(lastErr).category : "unknown",
      });
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
    }

    const attemptStart = Date.now();

    try {
      const client = getClient();

      logger.info("AI request", {
        model: requestModel,
        messageCount: messages.length,
        timeout: requestTimeout,
        attempt,
      });

      const response = await client.chat.completions.create(
        {
          model: requestModel,
          messages,
          max_tokens: MAX_RESPONSE_TOKENS,
          temperature: 0.7,
          top_p: 0.95,
          extra_body: {
            chat_template_kwargs: {
              thinking: false,
            },
          },
          stream: false,
        },
        {
          timeout: requestTimeout,
        }
      );

      const duration = Date.now() - startTime;

      if (
        !response ||
        !response.choices ||
        !response.choices.length ||
        !response.choices[0].message
      ) {
        throw new Error("Invalid response from AI model");
      }

      const content = response.choices[0].message.content;

      if (!content || typeof content !== "string") {
        throw new Error("Empty response from AI model");
      }

      logger.info("AI request complete", {
        model: requestModel,
        duration,
        attempt,
        responseLength: content.length,
      });

      return content.trim();
    } catch (err) {
      lastErr = err;
      const classified = classifyError(err);
      const attemptDuration = Date.now() - attemptStart;
      const totalDuration = Date.now() - startTime;
      const consumedFullBudget = attemptDuration >= requestTimeout * 0.95;
      const effectiveCategory = consumedFullBudget ? "timeout" : classified.category;

      logger.error("AI request failed", {
        model: requestModel,
        duration: totalDuration,
        attempt,
        errorCategory: effectiveCategory,
        errorStatus: err.status || (err.response && err.response.status) || null,
        errorCode: err.code || null,
        errorMessage: err.message,
      });

      const shouldRetry =
        classified.retriable && !consumedFullBudget && attempt < MAX_RETRIES;

      if (!shouldRetry) {
        const userError = formatUserError({ category: effectiveCategory });
        const error = new Error(userError);
        error.aiErrorCategory = effectiveCategory;
        error.aiErrorStatus = err.status;
        if (effectiveCategory === "timeout") {
          error.code = err.code || "ETIMEDOUT";
        } else if (err.code) {
          error.code = err.code;
        }
        throw error;
      }
    }
  }
}

async function buildImageDataUri(secureUrl) {
  if (typeof secureUrl !== "string" || !/^https:\/\//i.test(secureUrl)) {
    throw new Error("Invalid image URL for AI input");
  }

  const res = await fetch(secureUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch artifact image (HTTP ${res.status})`);
  }

  const contentType = res.headers.get("content-type") || "image/png";
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_IMAGE_BYTES) {
    throw new Error("Artifact image exceeds the 5MB limit");
  }

  return `data:${contentType};base64,${buf.toString("base64")}`;
}

module.exports = {
  chatCompletion,
  buildImageDataUri,
  classifyError,
};
