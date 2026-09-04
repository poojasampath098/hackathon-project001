const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const express = require("express");
const request = require("supertest");
const bcrypt = require("bcrypt");
const errorHandler = require("../src/middleware/error.middleware");
const { generateAccessToken } = require("../src/core/security");

jest.mock("../src/services/cloudinary.service");
const cloudinaryService = require("../src/services/cloudinary.service");

let mongoServer;
let app;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);

  app = express();
  app.use(express.json());
  const artifactRoutes = require("../src/routes/artifact.routes");
  app.use("/api/artifacts", artifactRoutes);
  app.use((req, res) => res.status(404).json({ success: false, message: "Not found" }));
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

afterEach(async () => {
  jest.clearAllMocks();
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

function authHeader(t) {
  return { Authorization: `Bearer ${t}` };
}

async function makeUser() {
  const User = require("../src/db/models/user.model");
  const hash = await bcrypt.hash("Test1234!", 10);
  const user = await User.create({
    email: "upload@example.com",
    passwordHash: hash,
    emailVerified: true,
    firstName: "Fay",
    lastName: "Ile",
  });
  return { user, token: generateAccessToken({ userId: user.id }) };
}

describe("POST /api/artifacts/upload", () => {
  test("rejects unauthenticated request", async () => {
    const res = await request(app)
      .post("/api/artifacts/upload")
      .attach("file", Buffer.from("hello world"), "note.txt");
    expect(res.status).toBe(401);
  });

  test("uploads a file and creates a document artifact", async () => {
    const { token } = await makeUser();
    const res = await request(app)
      .post("/api/artifacts/upload")
      .set(authHeader(token))
      .attach("file", Buffer.from("hello world"), {
        filename: "note.txt",
        contentType: "text/plain",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    const artifact = res.body.data.artifact;
    expect(artifact.type).toBe("document");
    expect(artifact.name).toBe("note.txt");
    expect(artifact.metadata.originalName).toBe("note.txt");
    expect(artifact.metadata.size).toBe(11);
  });

  test("uploads an image file to Cloudinary and stores a secure URL", async () => {
    cloudinaryService.isConfigured.mockReturnValue(true);
    cloudinaryService.uploadImage.mockResolvedValue({
      secure_url: "https://res.cloudinary.com/demo/image/upload/v1/aether/artifacts/agent_x.jpg",
      public_id: "aether/artifacts/agent_x",
    });

    const { token } = await makeUser();
    const res = await request(app)
      .post("/api/artifacts/upload")
      .set(authHeader(token))
      .attach("file", Buffer.from("fake-image-bytes"), {
        filename: "photo.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    const artifact = res.body.data.artifact;
    expect(artifact.name).toBe("photo.png");
    expect(artifact.content.secureUrl).toBe(
      "https://res.cloudinary.com/demo/image/upload/v1/aether/artifacts/agent_x.jpg"
    );
    expect(artifact.metadata.secureUrl).toBe(
      "https://res.cloudinary.com/demo/image/upload/v1/aether/artifacts/agent_x.jpg"
    );
    expect(cloudinaryService.uploadImage).toHaveBeenCalledTimes(1);
  });

  test("image upload without Cloudinary configured stores no URL and marks unavailable", async () => {
    cloudinaryService.isConfigured.mockReturnValue(false);

    const { token } = await makeUser();
    const res = await request(app)
      .post("/api/artifacts/upload")
      .set(authHeader(token))
      .attach("file", Buffer.from("bytes"), {
        filename: "pic.jpg",
        contentType: "image/jpeg",
      });

    expect(res.status).toBe(201);
    const artifact = res.body.data.artifact;
    expect(artifact.content.imageAvailable).toBe(false);
    expect(artifact.content.secureUrl).toBeUndefined();
    expect(cloudinaryService.uploadImage).not.toHaveBeenCalled();
  });

  test("rejects missing file field", async () => {
    const { token } = await makeUser();
    const res = await request(app)
      .post("/api/artifacts/upload")
      .set(authHeader(token));
    expect(res.status).toBe(400);
  });

  test("rejects file larger than 5MB", async () => {
    const { token } = await makeUser();
    const big = Buffer.alloc(6 * 1024 * 1024, 1);
    const res = await request(app)
      .post("/api/artifacts/upload")
      .set(authHeader(token))
      .attach("file", big, { filename: "big.bin", contentType: "application/octet-stream" });
    expect(res.status).toBe(400);
  });
});
