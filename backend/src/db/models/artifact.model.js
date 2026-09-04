const mongoose = require("mongoose");

const VALID_TYPES = ["execution_output", "ai_response", "document", "report"];

const artifactSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
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
    type: {
      type: String,
      required: true,
      enum: VALID_TYPES,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    content: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

artifactSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

artifactSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform(doc, ret) {
    delete ret._id;
    delete ret.userId;
  },
});

artifactSchema.set("toObject", {
  virtuals: true,
  versionKey: false,
});

const Artifact = mongoose.model("Artifact", artifactSchema);

module.exports = Artifact;
