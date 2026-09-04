const mongoose = require("mongoose");

const chatMessageSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
      index: true,
    },
    threadId: {
      type: String,
      default: "data-extraction",
      index: true,
    },
    role: {
      type: String,
      required: true,
      enum: ["user", "agent"],
    },
    messageType: {
      type: String,
      default: "text",
      enum: ["text", "file", "audio", "composed", "error"],
    },
    content: {
      type: String,
      default: "",
      maxlength: 10000,
    },
    attachments: {
      type: [
        {
          artifactId: { type: mongoose.Schema.Types.ObjectId, ref: "Artifact", default: null },
          name: { type: String, default: "" },
          secureUrl: { type: String, default: null },
          mimetype: { type: String, default: null },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

chatMessageSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

chatMessageSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform(doc, ret) {
    delete ret._id;
    delete ret.userId;
  },
});

chatMessageSchema.set("toObject", {
  virtuals: true,
  versionKey: false,
});

const ChatMessage = mongoose.model("ChatMessage", chatMessageSchema);

module.exports = ChatMessage;
