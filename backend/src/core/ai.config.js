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
    });
  }
  return client;
}

module.exports = { getClient };
