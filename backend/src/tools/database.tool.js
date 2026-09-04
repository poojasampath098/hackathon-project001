const mongoose = require("mongoose");
const logger = require("../core/logger");

const ALLOWED_OPERATIONS = ["find", "findOne", "count", "aggregate"];
const MAX_LIMIT = 100;
const MAX_AGGREGATION_STAGES = 5;

function validateObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function validateOperation(operation) {
  if (!operation || typeof operation !== "string") {
    return { valid: false, error: "Operation is required" };
  }
  if (!ALLOWED_OPERATIONS.includes(operation)) {
    return { valid: false, error: `Operation must be one of: ${ALLOWED_OPERATIONS.join(", ")}` };
  }
  return { valid: true };
}

function validateCollection(collection) {
  if (!collection || typeof collection !== "string") {
    return { valid: false, error: "Collection is required" };
  }
  const allowed = ["tasks", "executions", "approvals", "schedules", "activities"];
  if (!allowed.includes(collection)) {
    return { valid: false, error: `Collection must be one of: ${allowed.join(", ")}` };
  }
  return { valid: true };
}

function getModel(collection) {
  const modelMap = {
    tasks: mongoose.model("Task"),
    executions: mongoose.model("Execution"),
    approvals: mongoose.model("Approval"),
    schedules: mongoose.model("Schedule"),
    activities: mongoose.model("Activity"),
  };
  return modelMap[collection];
}

async function query(userId, collection, operation, params) {
  const collCheck = validateCollection(collection);
  if (!collCheck.valid) {
    throw Object.assign(new Error(collCheck.error), { statusCode: 400 });
  }

  const opCheck = validateOperation(operation);
  if (!opCheck.valid) {
    throw Object.assign(new Error(opCheck.error), { statusCode: 400 });
  }

  if (!userId || !validateObjectId(userId)) {
    throw Object.assign(new Error("Invalid userId"), { statusCode: 400 });
  }

  const Model = getModel(collection);
  if (!Model) {
    throw Object.assign(new Error("Unknown collection"), { statusCode: 400 });
  }

  const filter = { userId, ...(params.filter || {}) };

  if (params.id) {
    if (!validateObjectId(params.id)) {
      throw Object.assign(new Error("Invalid ID format"), { statusCode: 400 });
    }
    filter._id = params.id;
  }

  try {
    switch (operation) {
      case "find": {
        const limit = Math.min(params.limit || 20, MAX_LIMIT);
        const skip = params.skip || 0;
        const sort = params.sort || { createdAt: -1 };
        const docs = await Model.find(filter).sort(sort).skip(skip).limit(limit).lean();
        return { count: docs.length, data: docs };
      }
      case "findOne": {
        const doc = await Model.findOne(filter).lean();
        return { data: doc || null };
      }
      case "count": {
        const count = await Model.countDocuments(filter);
        return { count };
      }
      case "aggregate": {
        if (!Array.isArray(params.stages) || params.stages.length === 0) {
          throw Object.assign(new Error("Aggregation requires at least one stage"), { statusCode: 400 });
        }
        if (params.stages.length > MAX_AGGREGATION_STAGES) {
          throw Object.assign(new Error(`Aggregation limited to ${MAX_AGGREGATION_STAGES} stages`), { statusCode: 400 });
        }

        const userIdMatch = { $match: { userId: new mongoose.Types.ObjectId(userId) } };
        const pipeline = [userIdMatch, ...params.stages];
        const results = await Model.aggregate(pipeline);
        return { count: results.length, data: results };
      }
      default:
        throw Object.assign(new Error("Unknown operation"), { statusCode: 400 });
    }
  } catch (err) {
    if (err.statusCode) throw err;
    logger.error("Database tool query failed", err);
    throw Object.assign(new Error("Database query failed"), { statusCode: 500 });
  }
}

module.exports = { query, validateCollection, validateOperation };
