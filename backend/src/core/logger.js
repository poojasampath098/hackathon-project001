function timestamp() {
  return new Date().toISOString();
}

const logger = {
  info(message, meta) {
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
    console.log(`[${timestamp()}] INFO: ${message}${metaStr}`);
  },

  error(message, error) {
    const errorStr = error
      ? ` ${error.stack || error.message || JSON.stringify(error)}`
      : "";
    console.error(`[${timestamp()}] ERROR: ${message}${errorStr}`);
  },

  warn(message, meta) {
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
    console.warn(`[${timestamp()}] WARN: ${message}${metaStr}`);
  },
};

module.exports = logger;
