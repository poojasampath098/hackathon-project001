const { getClient } = require("../core/ai.config");
const config = require("../core/config");
const logger = require("../core/logger");

const MAX_RESPONSE_TOKENS = 2048;
const REQUEST_TIMEOUT_MS = 30000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

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

async function chatCompletion(messages) {
  try {
    const client = getClient();

    console.log("========== AI REQUEST ==========");
    console.log("MODEL:", config.geminiModel);
    console.log("MESSAGE COUNT:", messages.length);
    console.log("================================");

    const response = await client.chat.completions.create(
      {
        model: config.geminiModel,
        messages,
        max_tokens: MAX_RESPONSE_TOKENS,
        temperature: 0.7,
      },
      {
        timeout: REQUEST_TIMEOUT_MS,
      }
    );

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

    return content.trim();
  } catch (err) {
    console.log("\n========== AI ACTUAL ERROR ==========");
    console.log("MESSAGE:", err.message);
    console.log("STATUS:", err.status);
    console.log("CODE:", err.code);

    if (err.response) {
      console.log("RESPONSE:", err.response);
    }

    if (err.error) {
      console.log("ERROR DETAILS:", err.error);
    }

    console.log("====================================\n");

    logger.error("AI ERROR", {
      message: err.message,
      status: err.status,
      code: err.code,
    });

    throw err;
  }
}

module.exports = {
  chatCompletion,
  buildImageDataUri,
};