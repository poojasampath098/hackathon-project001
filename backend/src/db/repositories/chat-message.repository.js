const ChatMessage = require("../models/chat-message.model");

async function addMessage(messageData) {
  const message = await ChatMessage.create(messageData);
  return message.toObject();
}

async function getHistory(userId, threadId, limit) {
  const messages = await ChatMessage.find({ userId, threadId })
    .sort({ createdAt: 1 })
    .limit(limit || 100)
    .lean();
  return messages.map((m) => {
    const obj = { ...m };
    obj.id = obj._id.toHexString();
    delete obj._id;
    delete obj.userId;
    return obj;
  });
}

module.exports = { addMessage, getHistory };
