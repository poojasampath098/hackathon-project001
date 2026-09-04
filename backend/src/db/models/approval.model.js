const mongoose = require("mongoose");

const VALID_STATUSES = ["pending", "approved", "rejected"];

const VALID_TRANSITIONS = {
  pending: ["approved", "rejected"],
  approved: [],
  rejected: [],
};

function canTransition(from, to) {
  const allowed = VALID_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

const approvalSchema = new mongoose.Schema(
  {
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Task",
    },
    executionId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Execution",
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    approverId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      ref: "User",
    },
    status: {
      type: String,
      required: true,
      enum: VALID_STATUSES,
      default: "pending",
    },
    reason: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

approvalSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

approvalSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform(doc, ret) {
    delete ret._id;
    delete ret.userId;
  },
});

approvalSchema.set("toObject", {
  virtuals: true,
  versionKey: false,
});

const Approval = mongoose.model("Approval", approvalSchema);

module.exports = Approval;
module.exports.VALID_STATUSES = VALID_STATUSES;
module.exports.VALID_TRANSITIONS = VALID_TRANSITIONS;
module.exports.canTransition = canTransition;
