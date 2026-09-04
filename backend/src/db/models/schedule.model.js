const mongoose = require("mongoose");

const VALID_FREQUENCIES = ["once", "daily", "weekly", "monthly"];

const scheduleSchema = new mongoose.Schema(
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
    frequency: {
      type: String,
      required: true,
      enum: VALID_FREQUENCIES,
      default: "once",
    },
    nextRunAt: {
      type: Date,
      required: true,
    },
    lastRunAt: {
      type: Date,
      default: null,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

scheduleSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

scheduleSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform(doc, ret) {
    delete ret._id;
    delete ret.userId;
  },
});

scheduleSchema.set("toObject", {
  virtuals: true,
  versionKey: false,
});

const Schedule = mongoose.model("Schedule", scheduleSchema);

module.exports = Schedule;
