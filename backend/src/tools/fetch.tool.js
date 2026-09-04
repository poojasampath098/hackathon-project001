const https = require("https");
const http = require("http");
const { URL } = require("url");
const logger = require("../core/logger");

const ALLOWED_PROTOCOLS = ["https:", "http:"];
const BLOCKED_HOSTS = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "metadata.google.internal",
  "169.254.169.254",
];
const BLOCKED_IP_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^0\./,
  /^169\.254\./,
];
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_TIMEOUT_MS = 30000;
const MAX_RESPONSE_SIZE = 1024 * 512;
const MAX_URL_LENGTH = 2048;

function validateUrl(urlString) {
  if (!urlString || typeof urlString !== "string") {
    return { valid: false, error: "URL is required" };
  }

  if (urlString.length > MAX_URL_LENGTH) {
    return { valid: false, error: `URL must not exceed ${MAX_URL_LENGTH} characters` };
  }

  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    return { valid: false, error: "Only HTTP and HTTPS URLs are allowed" };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.includes(hostname)) {
    return { valid: false, error: "This host is not allowed" };
  }

  for (const pattern of BLOCKED_IP_RANGES) {
    if (pattern.test(hostname)) {
      return { valid: false, error: "Internal/private IP addresses are not allowed" };
    }
  }

  return { valid: true, value: parsed };
}

function validateTimeout(timeout) {
  if (timeout === undefined || timeout === null) return { valid: true, value: DEFAULT_TIMEOUT_MS };
  if (typeof timeout !== "number" || !Number.isFinite(timeout)) {
    return { valid: false, error: "timeout must be a number" };
  }
  if (timeout < 1000 || timeout > MAX_TIMEOUT_MS) {
    return { valid: false, error: `timeout must be between 1000ms and ${MAX_TIMEOUT_MS}ms` };
  }
  return { valid: true, value: timeout };
}

function fetchUrl(urlString, options) {
  const urlCheck = validateUrl(urlString);
  if (!urlCheck.valid) {
    return Promise.reject(Object.assign(new Error(urlCheck.error), { statusCode: 400 }));
  }

  const timeoutCheck = validateTimeout(options && options.timeout);
  if (!timeoutCheck.valid) {
    return Promise.reject(Object.assign(new Error(timeoutCheck.error), { statusCode: 400 }));
  }

  const parsed = urlCheck.value;
  const timeoutMs = timeoutCheck.value;
  const method = (options && options.method) || "GET";
  const headers = (options && options.headers) || {};

  return new Promise((resolve, reject) => {
    const proto = parsed.protocol === "https:" ? https : http;

    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: method.toUpperCase(),
      headers: {
        "User-Agent": "AetherPlatform/1.0",
        Accept: "application/json, text/plain, */*",
        ...headers,
      },
      timeout: timeoutMs,
    };

    const req = proto.request(reqOptions, (res) => {
      let body = "";
      let size = 0;

      res.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_SIZE) {
          req.destroy();
          reject(Object.assign(new Error("Response too large"), { statusCode: 413 }));
          return;
        }
        body += chunk;
      });

      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(Object.assign(
            new Error(`HTTP ${res.statusCode}: ${res.statusMessage || "Request failed"}`),
            { statusCode: res.statusCode >= 400 && res.statusCode < 600 ? res.statusCode : 502 }
          ));
          return;
        }

        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch {
          parsed = body;
        }

        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: parsed,
        });
      });
    });

    req.on("timeout", () => {
      req.destroy();
      reject(Object.assign(new Error("Request timed out"), { statusCode: 408 }));
    });

    req.on("error", (err) => {
      if (err.code === "ECONNREFUSED") {
        reject(Object.assign(new Error("Connection refused"), { statusCode: 502 }));
      } else if (err.code === "ENOTFOUND") {
        reject(Object.assign(new Error("Host not found"), { statusCode: 502 }));
      } else if (err.statusCode) {
        reject(err);
      } else {
        reject(Object.assign(new Error(`Request failed: ${err.message}`), { statusCode: 502 }));
      }
    });

    req.end();
  });
}

module.exports = { fetchUrl, validateUrl, validateTimeout };
