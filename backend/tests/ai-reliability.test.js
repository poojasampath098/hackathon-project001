process.env.JWT_SECRET = "test-jwt-secret-ai-reliability";

const aiService = require("../src/services/ai.service");
const searchTool = require("../src/tools/search.tool");

jest.mock("../src/services/ai.service", () => ({
  chatCompletion: jest.fn(),
  buildImageDataUri: jest.fn(),
}));

jest.mock("../src/tools/search.tool", () => ({
  research: jest.fn(),
  validateQuery: jest.fn(),
}));

jest.mock("../src/services/task.service", () => ({
  createTask: jest.fn(),
  getUserTasks: jest.fn(),
}));

const { processMessage } = require("../src/agent/main-agent");
const intent = require("../src/agent/intent");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("intent.js deterministic detection", () => {
  test("parseTaskFromMessage is exported as a function", () => {
    expect(typeof intent.parseTaskFromMessage).toBe("function");
  });

  test("detectIntent is exported as a function", () => {
    expect(typeof intent.detectIntent).toBe("function");
  });

  test("SYSTEM_PROMPT and INTENT_PROMPT are preserved", () => {
    expect(typeof intent.SYSTEM_PROMPT).toBe("string");
    expect(intent.SYSTEM_PROMPT.length).toBeGreaterThan(0);
    expect(typeof intent.INTENT_PROMPT).toBe("string");
    expect(intent.INTENT_PROMPT.length).toBeGreaterThan(0);
  });

  test("ordinary conversation resolves to conversation intent", () => {
    expect(intent.detectIntent("Hello")).toEqual({
      intent: "conversation",
      taskAction: null,
    });
    expect(intent.detectIntent("What is Kubernetes?")).toEqual({
      intent: "conversation",
      taskAction: null,
    });
  });

  test("research intent", () => {
    expect(intent.detectIntent("Research about Kubernetes").intent).toBe("research");
  });

  test("analysis intent", () => {
    expect(intent.detectIntent("Compare Docker and Kubernetes").intent).toBe("analysis");
  });

  test("obvious false classifications are avoided", () => {
    expect(intent.detectIntent("I can't find my keys").intent).toBe("conversation");
    expect(intent.detectIntent("Where is the search bar?").intent).toBe("conversation");
    expect(intent.detectIntent("I want to search on Google").intent).toBe("conversation");
  });

  test("task creation is parsed deterministically", () => {
    const parsed = intent.parseTaskFromMessage(
      "create a task called deploy with priority high"
    );
    expect(parsed).not.toBeNull();
    expect(parsed.action).toBe("create");
    expect(parsed.title).toBe("deploy");
    expect(parsed.priority).toBe("high");
  });

  test("task listing is parsed deterministically", () => {
    expect(intent.parseTaskFromMessage("list my tasks")).toEqual({ action: "list" });
    expect(intent.parseTaskFromMessage("show me my tasks")).toEqual({ action: "list" });
  });
});

describe("main-agent AI call counts (no duplicate calls)", () => {
  test("normal conversation makes exactly 1 AI call", async () => {
    aiService.chatCompletion.mockResolvedValue("Hello! How can I help?");

    const result = await processMessage("user-1", "Hello");

    expect(result).toBe("Hello! How can I help?");
    expect(aiService.chatCompletion).toHaveBeenCalledTimes(1);
    expect(searchTool.research).not.toHaveBeenCalled();
  });

  test("'What is Kubernetes?' makes exactly 1 AI call", async () => {
    aiService.chatCompletion.mockResolvedValue("Kubernetes is a container orchestrator.");

    await processMessage("user-1", "What is Kubernetes?");

    expect(aiService.chatCompletion).toHaveBeenCalledTimes(1);
    expect(searchTool.research).not.toHaveBeenCalled();
  });

  test("research via chat makes only the search tool AI call (no duplicate refinement)", async () => {
    searchTool.research.mockResolvedValue("Research findings about Kubernetes.");

    const result = await processMessage("user-1", "Research about Kubernetes");

    expect(searchTool.research).toHaveBeenCalledTimes(1);
    expect(aiService.chatCompletion).not.toHaveBeenCalled();
    expect(result).toBe("Research findings about Kubernetes.");
  });

  test("analysis makes exactly 1 AI call", async () => {
    aiService.chatCompletion.mockResolvedValue("Docker and Kubernetes comparison...");

    await processMessage("user-1", "Compare Docker and Kubernetes");

    expect(aiService.chatCompletion).toHaveBeenCalledTimes(1);
    expect(searchTool.research).not.toHaveBeenCalled();
  });

  test("task creation makes 0 AI calls", async () => {
    const taskService = require("../src/services/task.service");
    taskService.createTask.mockResolvedValue({
      title: "deploy",
      status: "pending",
      priority: "medium",
      requiresApproval: false,
    });

    const result = await processMessage("user-1", "create a task called deploy");

    expect(aiService.chatCompletion).not.toHaveBeenCalled();
    expect(searchTool.research).not.toHaveBeenCalled();
    expect(result).toContain("Task created successfully");
  });

  test("task listing makes 0 AI calls", async () => {
    const taskService = require("../src/services/task.service");
    taskService.getUserTasks.mockResolvedValue([]);

    const result = await processMessage("user-1", "list my tasks");

    expect(aiService.chatCompletion).not.toHaveBeenCalled();
    expect(result).toContain("You don't have any tasks yet.");
  });

  test("AI timeout error is surfaced as a user-friendly timeout message", async () => {
    const err = new Error("AI service request timed out. Please try again.");
    err.aiErrorCategory = "timeout";
    aiService.chatCompletion.mockRejectedValue(err);

    await expect(processMessage("user-1", "Hello there")).rejects.toMatchObject({
      message: "AI service request timed out. Please try again.",
    });
  });
});