const mongoose = require("mongoose");

const VALID_TYPES = [
  "task_created", "task_updated", "task_completed", "task_deleted",
  "execution_started", "execution_completed", "execution_failed", "execution_cancelled",
  "approval_requested", "approval_granted", "approval_rejected",
  "ai_request", "ai_response",
  "user_registered", "user_logged_in", "user_password_reset",
  "schedule_created", "schedule_toggled", "schedule_deleted",
  "artifact_created",
];

const activitySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    type: {
      type: String,
      required: true,
      enum: VALID_TYPES,
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      default: null,
    },
    executionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Execution",
      default: null,
    },
    message: {
      type: String,
      default: "",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    // Notification read state (drives the top-bar unread indicator). Kept on
    // the activity document itself so the existing activity feed doubles as the
    // notification feed without a separate collection.
    read: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

activitySchema.virtual("id").get(function () {
  return this._id.toHexString();
});

activitySchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform(doc, ret) {
    delete ret._id;
    delete ret.userId;
  },
});

activitySchema.set("toObject", {
  virtuals: true,
  versionKey: false,
});

const Activity = mongoose.model("Activity", activitySchema);

module.exports = Activity;
