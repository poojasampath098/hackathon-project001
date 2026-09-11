const OpenAI = require("openai");
const config = require("./config");

let client = null;

function getClient() {
  if (!client) {
    if (!config.nvidiaApiKey) {
      throw new Error("NVIDIA_API_KEY is not set in environment variables");
    }
    client = new OpenAI({
      apiKey: config.nvidiaApiKey,
      baseURL: config.nvidiaBaseUrl,
      timeout: config.aiTimeoutMs,
      maxRetries: 0,
    });
  }
  return client;
}

function resetClient() {
  client = null;
}

module.exports = { getClient, resetClient };
