const mongoose = require("mongoose");

const VALID_STATUSES = ["pending", "in_progress", "completed", "failed", "cancelled"];
const VALID_PRIORITIES = ["low", "medium", "high"];
const VALID_SCHEDULE_TYPES = ["once", "recurring"];

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
    status: {
      type: String,
      required: true,
      enum: VALID_STATUSES,
      default: "pending",
    },
    priority: {
      type: String,
      enum: VALID_PRIORITIES,
      default: "medium",
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    requiresApproval: {
      type: Boolean,
      default: false,
    },
    agent: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
    },
    scheduledTime: {
      type: String,
      trim: true,
      default: "",
    },
    scheduleType: {
      type: String,
      enum: VALID_SCHEDULE_TYPES,
      default: "once",
    },
  },
  { timestamps: true }
);

taskSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

taskSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform(doc, ret) {
    delete ret._id;
    delete ret.userId;
  },
});

taskSchema.set("toObject", {
  virtuals: true,
  versionKey: false,
});

const Task = mongoose.model("Task", taskSchema);

module.exports = Task;
