function buildTaskResponse(action, result) {
  switch (action) {
    case "create":
      if (!result) return "I couldn't create the task. Please check the title and try again.";
      const approvalNote = result.requiresApproval ? "\n- Requires approval before execution" : "";
      return `Task created successfully:\n\n**${result.title}**\n- Status: ${result.status}\n- Priority: ${result.priority}${result.description ? `\n- Description: ${result.description}` : ""}${approvalNote}`;
    case "list":
      if (!result || result.length === 0) return "You don't have any tasks yet.";
      const lines = result.map((t, i) => `${i + 1}. **${t.title}** — ${t.status} (${t.priority})${t.requiresApproval ? " [requires approval]" : ""}`);
      return `Here are your tasks:\n\n${lines.join("\n")}`;
    default:
      return "I've processed your task request.";
  }
}

module.exports = { buildTaskResponse };
