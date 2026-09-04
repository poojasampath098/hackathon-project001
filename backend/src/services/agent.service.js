const { processMessage } = require("../agent/main-agent");

module.exports = {
  processMessage: (userId, message, artifactContext) =>
    processMessage(userId, message, artifactContext),
};
