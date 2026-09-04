const mongoose = require("mongoose");

const VALID_STATUSES = ["pending", "running", "completed", "failed", "cancelled"];

const VALID_TRANSITIONS = {
  pending: ["running", "cancelled", "failed"],
  running: ["completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

const stepSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "running", "completed", "failed", "skipped"],
      default: "pending",
    },
    input: { type: mongoose.Schema.Types.Mixed, default: null },
    output: { type: mongoose.Schema.Types.Mixed, default: null },
    error: { type: String, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    duration: { type: Number, default: null },
  },
  { _id: true }
);

const executionSchema = new mongoose.Schema(
  {
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Task",
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    status: {
      type: String,
      required: true,
      enum: VALID_STATUSES,
      default: "pending",
    },
    steps: {
      type: [stepSchema],
      default: [],
    },
    input: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    output: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    error: {
      type: String,
      default: null,
    },
    timeout: {
      type: Number,
      default: 120000,
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    maxRetries: {
      type: Number,
      default: 0,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    duration: {
      type: Number,
      default: null,
    },
  },
  { timestamps: true }
);

executionSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

executionSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
  },
});

executionSchema.set("toObject", {
  virtuals: true,
  versionKey: false,
});

executionSchema.index({ userId: 1, status: 1 });
executionSchema.index({ userId: 1, createdAt: -1 });
executionSchema.index({ taskId: 1, userId: 1 });
executionSchema.index({ status: 1, startedAt: 1 });

function canTransition(from, to) {
  const allowed = VALID_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

const Execution = mongoose.model("Execution", executionSchema);

module.exports = Execution;
module.exports.VALID_STATUSES = VALID_STATUSES;
module.exports.VALID_TRANSITIONS = VALID_TRANSITIONS;
module.exports.canTransition = canTransition;
