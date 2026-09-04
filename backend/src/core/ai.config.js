const OpenAI = require("openai");
const config = require("./config");

let client = null;

function getClient() {
  if (!client) {
    if (!config.geminiApiKey) {
      throw new Error("GEMINI_API_KEY is not set in environment variables");
    }
    client = new OpenAI({
      apiKey: config.geminiApiKey,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    });
  }
  return client;
}

module.exports = { getClient };
