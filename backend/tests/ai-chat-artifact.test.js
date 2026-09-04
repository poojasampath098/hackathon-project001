process.env.JWT_SECRET = "test-jwt-secret-ai-chat-artifact";

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const express = require("express");
const request = require("supertest");
const bcrypt = require("bcrypt");
const errorHandler = require("../src/middleware/error.middleware");

jest.mock("../src/services/ai.service");
jest.mock("../src/tools/search.tool");

const aiService = require("../src/services/ai.service");
const artifactService = require("../src/services/artifact.service");

const aiRoutes = require("../src/routes/ai.routes");
const authRoutes = require("../src/routes/auth.routes");
const { generateAccessToken } = require("../src/core/security");

let mongoServer;
let app;
let userId;
let token;
let otherUserId;
let otherToken;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);

  app = express();
  app.use(express.json());
  app.use("/api/auth", authRoutes);
  app.use("/api/ai", aiRoutes);
  app.use((req, res) => {
    res.status(404).json({ success: false, message: "Not found" });
  });
  app.use(errorHandler);

  const User = require("../src/db/models/user.model");
  const passwordHash = await bcrypt.hash("TestPass1!", 10);
  const user = await User.create({ email: "chat-artifact@example.com", passwordHash, emailVerified: true });
  userId = user.id;
  token = generateAccessToken({ userId });

  const otherUser = await User.create({ email: "chat-artifact-other@example.com", passwordHash, emailVerified: true });
  otherUserId = otherUser.id;
  otherToken = generateAccessToken({ userId: otherUserId });
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

afterEach(async () => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    if (key !== "users") {
      await collections[key].deleteMany({});
    }
  }
});

function authHeader(t) {
  return { Authorization: `Bearer ${t}` };
}

function lastUserCall() {
  const calls = aiService.chatCompletion.mock.calls;
  return calls[calls.length - 1][0][1];
}

describe("POST /api/ai/chat with artifacts", () => {
  test("chat without artifactId still works (string content)", async () => {
    aiService.chatCompletion.mockResolvedValue("Hello! How can I help?");

    const res = await request(app)
      .post("/api/ai/chat")
      .set(authHeader(token))
      .send({ message: "Hi there" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.response).toBe("Hello! How can I help?");

    const userContent = lastUserCall().content;
    expect(typeof userContent).toBe("string");
    expect(userContent).toContain("Hi there");
  });

  test("chat with valid text artifact includes extractable text context", async () => {
    aiService.chatCompletion.mockResolvedValue("Summary of the file");

    const artifact = await artifactService.createArtifact(
      userId,
      "document",
      "notes.txt",
      { originalName: "notes.txt", extractableText: "This is the document text." },
      null,
      null,
      { uploadedFrom: "agent" }
    );

    const res = await request(app)
      .post("/api/ai/chat")
      .set(authHeader(token))
      .send({ message: "summarize this", artifactId: artifact.id });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const userContent = lastUserCall().content;
    expect(typeof userContent).toBe("string");
    expect(userContent).toContain("This is the document text.");
  });

  test("chat with valid image artifact produces multimodal AI input", async () => {
    aiService.chatCompletion.mockResolvedValue("Here is what this image shows.");
    aiService.buildImageDataUri.mockResolvedValue("data:image/png;base64,aGFja2F0aG9u");

    const artifact = await artifactService.createArtifact(
      userId,
      "document",
      "photo.png",
      {
        originalName: "photo.png",
        mimetype: "image/png",
        secureUrl: "https://res.cloudinary.com/demo/image/upload/v1/aether/photo.png",
      },
      null,
      null,
      { uploadedFrom: "agent" }
    );

    const res = await request(app)
      .post("/api/ai/chat")
      .set(authHeader(token))
      .send({ message: "explain this", artifactId: artifact.id });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.response).toBe("Here is what this image shows.");

    const userContent = lastUserCall().content;
    expect(Array.isArray(userContent)).toBe(true);
    expect(userContent[0]).toEqual({ type: "text", text: "explain this" });
    expect(userContent[1].type).toBe("image_url");
    expect(userContent[1].image_url.url).toBe("data:image/png;base64,aGFja2F0aG9u");
    expect(aiService.buildImageDataUri).toHaveBeenCalledWith(
      "https://res.cloudinary.com/demo/image/upload/v1/aether/photo.png"
    );
  });

  test("chat with unsupported artifact clearly notes it cannot read the file", async () => {
    aiService.chatCompletion.mockResolvedValue("Cannot read this format.");

    const artifact = await artifactService.createArtifact(
      userId,
      "document",
      "archive.zip",
      { originalName: "archive.zip", formatSupported: false },
      null,
      null,
      { uploadedFrom: "agent" }
    );

    const res = await request(app)
      .post("/api/ai/chat")
      .set(authHeader(token))
      .send({ message: "what is in this file?", artifactId: artifact.id });

    expect(res.status).toBe(200);

    const userContent = lastUserCall().content;
    expect(typeof userContent).toBe("string");
    expect(userContent).toContain("unsupported format");
    expect(userContent).not.toContain("This is the document text.");
  });

  test("artifact ownership is enforced (other user's artifact denied)", async () => {
    aiService.chatCompletion.mockResolvedValue("OK");

    const artifact = await artifactService.createArtifact(
      userId,
      "document",
      "secret.txt",
      { extractableText: "Private content" },
      null,
      null,
      { uploadedFrom: "agent" }
    );

    const res = await request(app)
      .post("/api/ai/chat")
      .set(authHeader(otherToken))
      .send({ message: "explain this", artifactId: artifact.id });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/not found/i);
    expect(aiService.chatCompletion).not.toHaveBeenCalled();
  });

  test("invalid artifactId format returns 400", async () => {
    const res = await request(app)
      .post("/api/ai/chat")
      .set(authHeader(token))
      .send({ message: "explain this", artifactId: "not-a-valid-id" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/artifact/i);
    expect(aiService.chatCompletion).not.toHaveBeenCalled();
  });

  test("nonexistent artifactId returns 404", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .post("/api/ai/chat")
      .set(authHeader(token))
      .send({ message: "explain this", artifactId: fakeId.toString() });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/not found/i);
  });

  test("normal text chat still produces string content (no artifact)", async () => {
    aiService.chatCompletion.mockResolvedValue("A normal chat reply");

    const res = await request(app)
      .post("/api/ai/chat")
      .set(authHeader(token))
      .send({ message: "What is 2+2?" });

    expect(res.status).toBe(200);
    const userContent = lastUserCall().content;
    expect(typeof userContent).toBe("string");
    expect(userContent).toContain("What is 2+2?");
  });
});
