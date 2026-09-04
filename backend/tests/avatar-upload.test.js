const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const express = require("express");
const request = require("supertest");
const bcrypt = require("bcrypt");
const errorHandler = require("../src/middleware/error.middleware");
const { generateAccessToken } = require("../src/core/security");

const mockCloudinaryService = {
  uploadAvatar: jest.fn(async (buffer, options) => ({
    public_id: `aether/profile-avatars/avatar_${options && options.public_id}`,
    secure_url: `https://res.cloudinary.com/md8m8xo9/image/upload/v1/aether/profile-avatars/${options && options.public_id}.jpg`,
  })),
  deleteImage: jest.fn(async (publicId) => true),
  getPublicIdFromUrl: jest.fn((url) => {
    if (!url || typeof url !== "string") return null;
    const match = url.match(/\/v\d+\/(.+)$/);
    return match ? match[1] : null;
  }),
};
jest.mock("../src/services/cloudinary.service", () => mockCloudinaryService);

let mongoServer;
let app;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);

  app = express();
  app.use(express.json());
  const userRoutes = require("../src/routes/user.routes");
  app.use("/api/users", userRoutes);
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

async function makeUser(extra = {}) {
  const User = require("../src/db/models/user.model");
  const hash = await bcrypt.hash("Test1234!", 10);
  const user = await User.create({
    email: "avatar@example.com",
    passwordHash: hash,
    emailVerified: true,
    firstName: "Ava",
    lastName: "Tar",
    ...extra,
  });
  return { user, token: generateAccessToken({ userId: user.id }) };
}

describe("POST /api/users/profile/avatar", () => {
  test("rejects unauthenticated request", async () => {
    const res = await request(app)
      .post("/api/users/profile/avatar")
      .attach("avatar", Buffer.from("fakeimage"), "photo.png");
    expect(res.status).toBe(401);
  });

  test("uploads image and stores the Cloudinary URL in user.avatar (no base64)", async () => {
    const { token } = await makeUser();
    const res = await request(app)
      .post("/api/users/profile/avatar")
      .set(authHeader(token))
      .attach("avatar", Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        { filename: "photo.png", contentType: "image/png" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.avatar).toContain("https://res.cloudinary.com/");
    expect(res.body.data.user.avatar).not.toContain("base64");
    expect(res.body.data.publicId).toContain("avatar_");
  });

  test("persists avatar in DB and GET /api/users/profile returns it", async () => {
    const { token } = await makeUser();
    await request(app)
      .post("/api/users/profile/avatar")
      .set(authHeader(token))
      .attach("avatar", Buffer.from("jpegdata"), "photo.jpg");

    const dbUser = await require("../src/db/models/user.model").findOne({ email: "avatar@example.com" });
    expect(dbUser.avatar).toContain("https://res.cloudinary.com/");
    expect(dbUser.avatar).not.toContain("base64");

    const res = await request(app)
      .get("/api/users/profile")
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.data.user.avatar).toContain("res.cloudinary.com");
  });

  test("deletes the old Cloudinary avatar after a successful new upload, without breaking on failure", async () => {
    const oldUrl = "https://res.cloudinary.com/md8m8xo9/image/upload/v1/aether/profile-avatars/old_photo.jpg";
    const { token } = await makeUser({ avatar: oldUrl });
    mockCloudinaryService.deleteImage.mockRejectedValueOnce(new Error("cleanup failed"));

    const res = await request(app)
      .post("/api/users/profile/avatar")
      .set(authHeader(token))
      .attach("avatar", Buffer.from("data"), "photo.jpg");

    expect(res.status).toBe(200);
    expect(res.body.data.user.avatar).toContain("res.cloudinary.com");
    expect(mockCloudinaryService.deleteImage).toHaveBeenCalledWith("aether/profile-avatars/old_photo.jpg");
  });

  test("rejects non-image mimetype via multer fileFilter", async () => {
    const { token } = await makeUser();
    const res = await request(app)
      .post("/api/users/profile/avatar")
      .set(authHeader(token))
      .attach("avatar", Buffer.from("plain text"), "note.txt");
    expect(res.status).toBe(400);
  });

  test("rejects missing file field", async () => {
    const { token } = await makeUser();
    const res = await request(app)
      .post("/api/users/profile/avatar")
      .set(authHeader(token));
    expect(res.status).toBe(400);
  });

  test("rejects file larger than 2MB", async () => {
    const { token } = await makeUser();
    const big = Buffer.alloc(3 * 1024 * 1024, 1);
    const res = await request(app)
      .post("/api/users/profile/avatar")
      .set(authHeader(token))
      .attach("avatar", big, { filename: "big.png", contentType: "image/png" });
    expect(res.status).toBe(400);
  });
});
