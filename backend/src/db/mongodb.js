const dns = require("dns");

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const mongoose = require("mongoose");
const config = require("../core/config");
const logger = require("../core/logger");

async function connectDatabase() {
  if (!config.mongodbUri) {
    throw new Error("MONGODB_URI is not set in environment variables");
  }

  await mongoose.connect(config.mongodbUri);

  logger.info("MongoDB connected");
}

module.exports = { connectDatabase };