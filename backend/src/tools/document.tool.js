const mongoose = require("mongoose");
const logger = require("../core/logger");

const SUPPORTED_TYPES = ["task", "execution", "approval", "schedule", "activity"];
const MAX_QUERY_LENGTH = 1000;
const MAX_RESULTS = 50;

function validateObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function getCollectionForType(type) {
  const map = {
    task: "Task",
    execution: "Execution",
    approval: "Approval",
    schedule: "Schedule",
    activity: "Activity",
  };
  const name = map[type];
  if (!name) return null;
  return mongoose.model(name);
}

function validateDocumentType(type) {
  if (!type || typeof type !== "string") {
    return { valid: false, error: "Document type is required" };
  }
  if (!SUPPORTED_TYPES.includes(type)) {
    return { valid: false, error: `Document type must be one of: ${SUPPORTED_TYPES.join(", ")}` };
  }
  return { valid: true };
}

function validateSearchQuery(query) {
  if (!query || typeof query !== "string") {
    return { valid: false, error: "Search query is required" };
  }
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: "Search query cannot be empty" };
  }
  if (trimmed.length > MAX_QUERY_LENGTH) {
    return { valid: false, error: `Search query must not exceed ${MAX_QUERY_LENGTH} characters` };
  }
  return { valid: true, value: trimmed };
}

async function findById(userId, type, documentId) {
  const typeCheck = validateDocumentType(type);
  if (!typeCheck.valid) {
    throw Object.assign(new Error(typeCheck.error), { statusCode: 400 });
  }

  if (!userId || !validateObjectId(userId)) {
    throw Object.assign(new Error("Invalid userId"), { statusCode: 400 });
  }

  if (!validateObjectId(documentId)) {
    throw Object.assign(new Error("Invalid document ID"), { statusCode: 400 });
  }

  const Model = getCollectionForType(type);
  if (!Model) {
    throw Object.assign(new Error("Unknown document type"), { statusCode: 400 });
  }

  try {
    const doc = await Model.findOne({ _id: documentId, userId }).lean();
    if (!doc) {
      throw Object.assign(new Error("Document not found"), { statusCode: 404 });
    }
    return doc;
  } catch (err) {
    if (err.statusCode) throw err;
    logger.error("Document tool findById failed", err);
    throw Object.assign(new Error("Failed to retrieve document"), { statusCode: 500 });
  }
}

async function search(userId, type, query, options) {
  const typeCheck = validateDocumentType(type);
  if (!typeCheck.valid) {
    throw Object.assign(new Error(typeCheck.error), { statusCode: 400 });
  }

  if (!userId || !validateObjectId(userId)) {
    throw Object.assign(new Error("Invalid userId"), { statusCode: 400 });
  }

  const qCheck = validateSearchQuery(query);
  if (!qCheck.valid) {
    throw Object.assign(new Error(qCheck.error), { statusCode: 400 });
  }

  const Model = getCollectionForType(type);
  if (!Model) {
    throw Object.assign(new Error("Unknown document type"), { statusCode: 400 });
  }

  const limit = Math.min((options && options.limit) || 20, MAX_RESULTS);

  try {
    const regex = new RegExp(qCheck.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

    const searchableFields = getSearchableFields(type);

    const orFilter = searchableFields.map((field) => ({
      [field]: { $regex: regex },
    }));

    const docs = await Model.find({
      userId,
      $or: orFilter,
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return { count: docs.length, query: qCheck.value, data: docs };
  } catch (err) {
    if (err.statusCode) throw err;
    logger.error("Document tool search failed", err);
    throw Object.assign(new Error("Document search failed"), { statusCode: 500 });
  }
}

function getSearchableFields(type) {
  const fields = {
    task: ["title", "description"],
    execution: ["error"],
    approval: ["reason"],
    schedule: [],
    activity: ["message"],
  };
  return fields[type] || [];
}

async function getDocumentSummary(userId, type) {
  const typeCheck = validateDocumentType(type);
  if (!typeCheck.valid) {
    throw Object.assign(new Error(typeCheck.error), { statusCode: 400 });
  }

  if (!userId || !validateObjectId(userId)) {
    throw Object.assign(new Error("Invalid userId"), { statusCode: 400 });
  }

  const Model = getCollectionForType(type);
  if (!Model) {
    throw Object.assign(new Error("Unknown document type"), { statusCode: 400 });
  }

  try {
    const count = await Model.countDocuments({ userId });
    const recent = await Model.find({ userId }).sort({ createdAt: -1 }).limit(5).lean();

    return {
      type,
      total: count,
      recent,
    };
  } catch (err) {
    if (err.statusCode) throw err;
    logger.error("Document tool summary failed", err);
    throw Object.assign(new Error("Failed to get document summary"), { statusCode: 500 });
  }
}

module.exports = {
  findById,
  search,
  getDocumentSummary,
  validateDocumentType,
  validateSearchQuery,
  SUPPORTED_TYPES,
};
