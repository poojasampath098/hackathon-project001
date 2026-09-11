process.env.JWT_SECRET = "test-jwt-secret-ai-timeout";

jest.mock("../src/core/ai.config", () => ({
  getClient: jest.fn(),
  resetClient: jest.fn(),
}));

const aiService = require("../src/services/ai.service");
const { getClient } = require("../src/core/ai.config");

const BASIC_MESSAGES = [{ role: "user", content: "hi" }];
const SHORT_TIMEOUT = { timeout: 500 };

function mockClient(createImpl) {
  const create = jest.fn(createImpl);
  getClient.mockReturnValue({ chat: { completions: { create } } });
  return create;
}

describe("ai.service error classification and retry", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("classifyError maps all expected categories", async () => {
    const cases = [
      [{ message: "Request timed out.", code: "ECONNABORTED" }, "timeout"],
      [{ message: "Request timed out." }, "timeout"],
      [{ name: "APIConnectionTimeoutError", message: "Request timed out." }, "timeout"],
      [{ message: "fetch timeout", code: "UND_ERR_TIMEOUT" }, "timeout"],
      [{ status: 401, message: "Incorrect API key" }, "auth"],
      [{ status: 429, message: "Rate limit reached" }, "rate_limit"],
      [{ status: 500, message: "Server error" }, "server"],
      [{ code: "ECONNRESET", message: "socket hang up" }, "network"],
      [{ code: "ENOTFOUND", message: "getaddrinfo" }, "network"],
      [{ status: 400, message: "model_not_found" }, "invalid_request"],
      [{ message: "connection error" }, "network"],
    ];

    for (const [err, expected] of cases) {
      expect(aiService.classifyError(err).category).toBe(expected);
    }
  });

  test("real SDK timeout error shape (no code, 'Request timed out.') fails as user-friendly timeout", async () => {
    const create = mockClient(() => {
      throw Object.assign(new Error("Request timed out."), {
        name: "APIConnectionTimeoutError",
      });
    });

    await expect(
      aiService.chatCompletion(BASIC_MESSAGES, SHORT_TIMEOUT)
    ).rejects.toMatchObject({
      message: "AI service request timed out. Please try again.",
      aiErrorCategory: "timeout",
    });

    expect(create).toHaveBeenCalledTimes(1);
  });

  test("timeout errors are surfaced immediately without retry", async () => {
    const create = mockClient(() => {
      throw Object.assign(new Error("Request timed out."), { code: "ECONNABORTED" });
    });

    await expect(
      aiService.chatCompletion(BASIC_MESSAGES, SHORT_TIMEOUT)
    ).rejects.toMatchObject({
      message: "AI service request timed out. Please try again.",
      aiErrorCategory: "timeout",
    });

    expect(create).toHaveBeenCalledTimes(1);
  });

  test("auth errors are surfaced as configuration errors without retry", async () => {
    const create = mockClient(() => {
      throw Object.assign(new Error("Incorrect API key provided"), { status: 401 });
    });

    await expect(
      aiService.chatCompletion(BASIC_MESSAGES, SHORT_TIMEOUT)
    ).rejects.toMatchObject({
      message: "AI service configuration error. Please contact support.",
      aiErrorCategory: "auth",
    });

    expect(create).toHaveBeenCalledTimes(1);
  });

  test("rate limit errors are retried once", async () => {
    let attempts = 0;
    const create = mockClient(() => {
      attempts += 1;
      if (attempts === 1) {
        throw Object.assign(new Error("Rate limit reached"), { status: 429 });
      }
      return {
        choices: [{ message: { role: "assistant", content: "retried ok" } }],
      };
    });

    const result = await aiService.chatCompletion(BASIC_MESSAGES, SHORT_TIMEOUT);

    expect(result).toBe("retried ok");
    expect(create).toHaveBeenCalledTimes(2);
  });

  test("network errors are retried once", async () => {
    let attempts = 0;
    const create = mockClient(() => {
      attempts += 1;
      if (attempts === 1) {
        throw Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
      }
      return {
        choices: [{ message: { role: "assistant", content: "ok after retry" } }],
      };
    });

    const result = await aiService.chatCompletion(BASIC_MESSAGES, SHORT_TIMEOUT);

    expect(result).toBe("ok after retry");
    expect(create).toHaveBeenCalledTimes(2);
  });

  test("never retries more than MAX_RETRIES and still fails cleanly", async () => {
    const create = mockClient(() => {
      throw Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
    });

    await expect(
      aiService.chatCompletion(BASIC_MESSAGES, SHORT_TIMEOUT)
    ).rejects.toMatchObject({
      message: "Network error communicating with AI service. Please try again.",
      aiErrorCategory: "network",
    });

    expect(create).toHaveBeenCalledTimes(2);
  });

  test("invalid response shape is rejected cleanly", async () => {
    const create = mockClient(() => ({}));

    await expect(
      aiService.chatCompletion(BASIC_MESSAGES, SHORT_TIMEOUT)
    ).rejects.toMatchObject({
      message: "AI service rejected the request. Please try rephrasing.",
      aiErrorCategory: "invalid_request",
    });

    expect(create).toHaveBeenCalledTimes(1);
  });

  test("empty response content is rejected cleanly", async () => {
    const create = mockClient(() => ({
      choices: [{ message: { role: "assistant", content: "" } }],
    }));

    await expect(
      aiService.chatCompletion(BASIC_MESSAGES, SHORT_TIMEOUT)
    ).rejects.toMatchObject({
      message: "AI service is currently unavailable. Please try again later.",
    });

    expect(create).toHaveBeenCalledTimes(1);
  });

  test("error that consumes the full timeout budget is treated as timeout (no retry, ETIMEDOUT code)", async () => {
    const create = mockClient(async () => {
      await new Promise((r) => setTimeout(r, 500));
      throw new Error("Connection error.");
    });

    const err = await aiService
      .chatCompletion(BASIC_MESSAGES, SHORT_TIMEOUT)
      .catch((e) => e);

    expect(err.aiErrorCategory).toBe("timeout");
    expect(err.message).toBe("AI service request timed out. Please try again.");
    expect(err.code).toBe("ETIMEDOUT");
    expect(create).toHaveBeenCalledTimes(1);
  });

  test("final error preserves underlying retryable code when not budget-exceeded", async () => {
    const create = mockClient(() => {
      throw Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
    });

    const err = await aiService
      .chatCompletion(BASIC_MESSAGES, SHORT_TIMEOUT)
      .catch((e) => e);

    expect(err.aiErrorCategory).toBe("network");
    expect(err.code).toBe("ECONNRESET");
    expect(err.message).toBe("Network error communicating with AI service. Please try again.");
  });
});