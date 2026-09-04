const aiService = require("../services/ai.service");
const logger = require("../core/logger");

const SYSTEM_PROMPT = `You are the Aether Platform AI Agent — a single, unified AI assistant.

You handle ALL user requests internally. You do NOT delegate to separate agents.
You do NOT expose your internal reasoning process to the user.

Your internal capabilities:
- Conversation: answer questions, explain concepts, chat naturally
- Research: find and synthesize information on any topic
- Analysis: compare, evaluate, identify patterns, summarize, and reason
- Task Management: help create, list, update, and track tasks

Rules:
- Respond as one intelligent assistant. Never mention "agents", "tools", or internal capabilities.
- Do not say "I am researching..." or "Analyzing..." — just provide the result.
- Keep responses clear, helpful, and well-structured.
- If a request involves multiple capabilities, handle it seamlessly.
- Be concise by default. Add detail when the user asks for it.
- If you are unsure about something, say so honestly.
- Never fabricate sources, URLs, or citations.`;

const INTENT_PROMPT = `Analyze the user message and classify it into exactly ONE intent.
Respond with ONLY a JSON object, no other text.

Intents:
- "conversation": normal questions, greetings, explanations, opinions, help requests
- "research": requests to find, look up, discover, or gather information about a topic
- "analysis": requests to compare, evaluate, summarize, interpret, or reason about information
- "task": explicit requests to create, list, update, delete, or manage tasks

Rules:
- "Create a task to..." → task
- "List my tasks" → task
- "Research X" → research
- "Compare X and Y" → analysis
- "Summarize X" → analysis
- "What is X?" → conversation (unless explicitly asking to research)
- "Hello" → conversation
- Ambiguous messages default to conversation

Respond with ONLY this JSON:
{"intent": "conversation|research|analysis|task", "taskAction": "create|list|get|update|delete|null"}`;

function parseTaskFromMessage(message) {
  const lower = message.toLowerCase();
  const adj = "(?:\\w+\\s+)*";
  const createPatterns = [
    new RegExp(`create\\s+(?:a\\s+|an\\s+)?(?:new\\s+)?${adj}task\\s+(?:called\\s+|named\\s+|titled\\s+)?["']?(.+?)["']?\\s+(?:with|and|priority|description|desc)\\s+`, "i"),
    new RegExp(`create\\s+(?:a\\s+|an\\s+)?(?:new\\s+)?${adj}task\\s+(?:called\\s+|named\\s+|titled\\s+)?["']?([^"']+?)["']?\\s*$`, "i"),
    new RegExp(`add\\s+(?:a\\s+|an\\s+)?(?:new\\s+)?${adj}task\\s+(?:called\\s+|named\\s+|titled\\s+)?["']?(.+?)["']?\\s+(?:with|and|priority|description|desc)\\s+`, "i"),
    new RegExp(`add\\s+(?:a\\s+|an\\s+)?(?:new\\s+)?${adj}task\\s+(?:called\\s+|named\\s+|titled\\s+)?["']?([^"']+?)["']?\\s*$`, "i"),
    new RegExp(`make\\s+(?:a\\s+|an\\s+)?(?:new\\s+)?${adj}task\\s+(?:called\\s+|named\\s+|titled\\s+)?["']?(.+?)["']?\\s+(?:with|and|priority|description|desc)\\s+`, "i"),
    new RegExp(`make\\s+(?:a\\s+|an\\s+)?(?:new\\s+)?${adj}task\\s+(?:called\\s+|named\\s+|titled\\s+)?["']?([^"']+?)["']?\\s*$`, "i"),
    /new\s+task\s*:\s*["']?([^"']+?)["']?\s*$/i,
    /task\s*:\s*["']?([^"']+?)["']?\s*$/i,
  ];

  for (const pattern of createPatterns) {
    const match = message.match(pattern);
    if (match) {
      const title = match[1].trim().replace(/["']/g, "");
      let priority = "medium";
      if (/\b(urgent|high|important|critical)\b/i.test(message)) priority = "high";
      else if (/\b(low|minor|trivial)\b/i.test(message)) priority = "low";

      let description = "";
      const descMatch = message.match(/(?:description|desc|details|about|notes?)\s*[:=]\s*["']?([^"']+?)["']?\s*$/i);
      if (descMatch) description = descMatch[1].trim();

      const requiresApproval = /\b(requires?\s+approval|needs?\s+approval|approval\s+required)\b/i.test(message);

      return { action: "create", title, description, priority, requiresApproval };
    }
  }

  if (/\b(list|show|get|view|fetch|see)\b.*\btasks?\b/i.test(lower) ||
      /\btasks?\b.*\b(list|show|get|view|fetch|see)\b/i.test(lower)) {
    return { action: "list" };
  }

  return null;
}

async function detectIntent(message) {
  const messages = [
    { role: "system", content: INTENT_PROMPT },
    { role: "user", content: message },
  ];

  try {
    const response = await aiService.chatCompletion(messages);
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (["conversation", "research", "analysis", "task"].includes(parsed.intent)) {
        return parsed;
      }
    }
  } catch (err) {
    logger.warn("Intent detection failed, defaulting to conversation", { error: err.message });
  }

  return { intent: "conversation", taskAction: null };
}

module.exports = { SYSTEM_PROMPT, INTENT_PROMPT, parseTaskFromMessage, detectIntent };
