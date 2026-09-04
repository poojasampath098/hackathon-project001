const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

const Activity = require("../src/db/models/activity.model");
const Artifact = require("../src/db/models/artifact.model");
const activityRepo = require("../src/db/repositories/activity.repository");
const artifactRepo = require("../src/db/repositories/artifact.repository");
const activityService = require("../src/services/activity.service");
const artifactService = require("../src/services/artifact.service");

const VALID_ACTIVITY_TYPES = [
  "task_created", "task_updated", "task_completed", "task_deleted",
  "execution_started", "execution_completed", "execution_failed", "execution_cancelled",
  "approval_requested", "approval_granted", "approval_rejected",
  "ai_request", "ai_response",
  "user_registered", "user_logged_in",
  "schedule_created", "schedule_toggled", "schedule_deleted",
  "artifact_created",
];

const VALID_ARTIFACT_TYPES = ["execution_output", "ai_response", "document", "report"];

describe("Activity Model", () => {
  test("creates activity with all required fields", async () => {
    const userId = new mongoose.Types.ObjectId();
    const taskId = new mongoose.Types.ObjectId();
    const executionId = new mongoose.Types.ObjectId();

    const activity = await Activity.create({
      userId,
      type: "task_created",
      taskId,
      executionId,
      message: "Task created",
      metadata: { title: "Test Task" },
    });

    expect(activity).toBeDefined();
    expect(activity.userId.toString()).toBe(userId.toString());
    expect(activity.type).toBe("task_created");
    expect(activity.taskId.toString()).toBe(taskId.toString());
    expect(activity.executionId.toString()).toBe(executionId.toString());
    expect(activity.message).toBe("Task created");
    expect(activity.metadata.title).toBe("Test Task");
    expect(activity.createdAt).toBeDefined();
    expect(activity.updatedAt).toBeDefined();
  });

  test("creates activity with defaults", async () => {
    const userId = new mongoose.Types.ObjectId();
    const activity = await Activity.create({ userId, type: "user_logged_in" });

    expect(activity.taskId).toBeNull();
    expect(activity.executionId).toBeNull();
    expect(activity.message).toBe("");
    expect(activity.metadata).toEqual({});
  });

  test("rejects invalid type", async () => {
    const userId = new mongoose.Types.ObjectId();
    await expect(
      Activity.create({ userId, type: "invalid_type" })
    ).rejects.toThrow();
  });

  test("virtual id works", async () => {
    const userId = new mongoose.Types.ObjectId();
    const activity = await Activity.create({ userId, type: "task_created" });
    const json = activity.toJSON();
    expect(json.id).toBeDefined();
    expect(json._id).toBeUndefined();
  });

  test("toJSON strips userId", async () => {
    const userId = new mongoose.Types.ObjectId();
    const activity = await Activity.create({ userId, type: "task_created" });
    const json = activity.toJSON();
    expect(json.userId).toBeUndefined();
  });

  test("read defaults to false (notification unread)", async () => {
    const userId = new mongoose.Types.ObjectId();
    const activity = await Activity.create({ userId, type: "task_created" });
    expect(activity.read).toBe(false);
    const json = activity.toJSON();
    expect(json.read).toBe(false);
  });

  test("read can be set to true", async () => {
    const userId = new mongoose.Types.ObjectId();
    const activity = await Activity.create({ userId, type: "task_created", read: true });
    expect(activity.read).toBe(true);
  });

  test.each(VALID_ACTIVITY_TYPES)("accepts type: %s", async (type) => {
    const userId = new mongoose.Types.ObjectId();
    const activity = await Activity.create({ userId, type });
    expect(activity.type).toBe(type);
  });
});

describe("Activity Repository", () => {
  test("createActivity stores activity", async () => {
    const userId = new mongoose.Types.ObjectId();
    const result = await activityRepo.createActivity({
      userId,
      type: "task_created",
      message: "Test",
    });

    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.type).toBe("task_created");
  });

  test("findActivitiesByUserId returns user activities sorted by newest", async () => {
    const userId = new mongoose.Types.ObjectId();
    const otherUserId = new mongoose.Types.ObjectId();

    await activityRepo.createActivity({ userId, type: "task_created", message: "First" });
    await new Promise((r) => setTimeout(r, 10));
    await activityRepo.createActivity({ userId, type: "task_completed", message: "Second" });
    await activityRepo.createActivity({ userId: otherUserId, type: "task_created", message: "Other" });

    const activities = await activityRepo.findActivitiesByUserId(userId, 10);
    expect(activities).toHaveLength(2);
    expect(activities[0].message).toBe("Second");
    expect(activities[1].message).toBe("First");
  });

  test("findActivitiesByUserId respects limit", async () => {
    const userId = new mongoose.Types.ObjectId();
    for (let i = 0; i < 5; i++) {
      await activityRepo.createActivity({ userId, type: "task_created", message: `Task ${i}` });
    }

    const activities = await activityRepo.findActivitiesByUserId(userId, 3);
    expect(activities).toHaveLength(3);
  });

  test("findActivitiesByUserId respects offset", async () => {
    const userId = new mongoose.Types.ObjectId();
    for (let i = 0; i < 5; i++) {
      await activityRepo.createActivity({ userId, type: "task_created", message: `Task ${i}` });
    }

    const activities = await activityRepo.findActivitiesByUserId(userId, 10, 2);
    expect(activities).toHaveLength(3);
  });

  test("findActivitiesByTaskId returns task activities", async () => {
    const userId = new mongoose.Types.ObjectId();
    const taskId = new mongoose.Types.ObjectId();
    const otherTaskId = new mongoose.Types.ObjectId();

    await activityRepo.createActivity({ userId, type: "task_created", taskId, message: "For task" });
    await activityRepo.createActivity({ userId, type: "task_created", taskId: otherTaskId, message: "Other task" });

    const activities = await activityRepo.findActivitiesByTaskId(taskId, userId);
    expect(activities).toHaveLength(1);
    expect(activities[0].message).toBe("For task");
  });

  test("findActivitiesByExecutionId returns execution activities", async () => {
    const userId = new mongoose.Types.ObjectId();
    const executionId = new mongoose.Types.ObjectId();

    await activityRepo.createActivity({ userId, type: "execution_started", executionId, message: "Started" });
    await activityRepo.createActivity({ userId, type: "execution_completed", executionId, message: "Completed" });

    const activities = await activityRepo.findActivitiesByExecutionId(executionId, userId);
    expect(activities).toHaveLength(2);
  });

  test("deleteActivity removes activity", async () => {
    const userId = new mongoose.Types.ObjectId();
    const activity = await activityRepo.createActivity({ userId, type: "task_created" });

    const deleted = await activityRepo.deleteActivity(activity.id, userId);
    expect(deleted).toBeDefined();

    const remaining = await activityRepo.findActivitiesByUserId(userId);
    expect(remaining).toHaveLength(0);
  });

  test("deleteActivity returns null for non-existent", async () => {
    const userId = new mongoose.Types.ObjectId();
    const fakeId = new mongoose.Types.ObjectId();
    const result = await activityRepo.deleteActivity(fakeId, userId);
    expect(result).toBeNull();
  });

  test("markActivityRead marks the owner's activity as read", async () => {
    const userId = new mongoose.Types.ObjectId();
    const activity = await activityRepo.createActivity({ userId, type: "task_created" });

    const updated = await activityRepo.markActivityRead(activity.id, userId);
    expect(updated).toBeDefined();
    expect(updated.read).toBe(true);
  });

  test("markActivityRead never touches another user's activity (IDOR)", async () => {
    const userId = new mongoose.Types.ObjectId();
    const otherUserId = new mongoose.Types.ObjectId();
    const activity = await activityRepo.createActivity({ userId, type: "task_created" });

    const result = await activityRepo.markActivityRead(activity.id, otherUserId);
    expect(result).toBeNull();

    const reloaded = await Activity.findById(activity.id);
    expect(reloaded.read).toBe(false);
  });

  test("markActivityRead returns null for a non-existent activity", async () => {
    const userId = new mongoose.Types.ObjectId();
    const fakeId = new mongoose.Types.ObjectId();
    const result = await activityRepo.markActivityRead(fakeId, userId);
    expect(result).toBeNull();
  });

  test("markAllActivitiesRead marks only the current user's activities", async () => {
    const userId = new mongoose.Types.ObjectId();
    const otherUserId = new mongoose.Types.ObjectId();

    await activityRepo.createActivity({ userId, type: "task_created" });
    await activityRepo.createActivity({ userId, type: "task_updated" });
    await activityRepo.createActivity({ userId, type: "task_completed" });
    await activityRepo.createActivity({ userId: otherUserId, type: "task_created" });

    const modifiedCount = await activityRepo.markAllActivitiesRead(userId);
    expect(modifiedCount).toBe(3);

    const mine = await activityRepo.findActivitiesByUserId(userId);
    expect(mine.every((a) => a.read === true)).toBe(true);

    const theirs = await activityRepo.findActivitiesByUserId(otherUserId);
    expect(theirs.length).toBe(1);
    expect(theirs[0].read).toBe(false);
  });

  test("markAllActivitiesRead returns 0 when everything is already read", async () => {
    const userId = new mongoose.Types.ObjectId();
    await Activity.create({ userId, type: "task_created", read: true });
    // Activity exists with read=true; marking all should touch nothing.
    const modifiedCount = await activityRepo.markAllActivitiesRead(userId);
    expect(modifiedCount).toBe(0);
  });
});

describe("Activity Service", () => {
  test("logActivity creates activity", async () => {
    const userId = new mongoose.Types.ObjectId();
    const taskId = new mongoose.Types.ObjectId();
    const executionId = new mongoose.Types.ObjectId();

    const activity = await activityService.logActivity(
      userId, "execution_completed", taskId,
      "Execution done", { duration: 1000 }, executionId
    );

    expect(activity).toBeDefined();
    expect(activity.type).toBe("execution_completed");
    expect(activity.taskId.toString()).toBe(taskId.toString());
    expect(activity.executionId.toString()).toBe(executionId.toString());
  });

  test("getUserActivities returns activities with limit", async () => {
    const userId = new mongoose.Types.ObjectId();
    await activityService.logActivity(userId, "task_created", null, "A");
    await activityService.logActivity(userId, "task_completed", null, "B");

    const activities = await activityService.getUserActivities(userId, 1);
    expect(activities).toHaveLength(1);
  });

  test("getTaskActivities returns task-specific activities", async () => {
    const userId = new mongoose.Types.ObjectId();
    const taskId = new mongoose.Types.ObjectId();
    await activityService.logActivity(userId, "task_created", taskId, "Created");
    await activityService.logActivity(userId, "task_completed", taskId, "Done");

    const activities = await activityService.getTaskActivities(taskId, userId);
    expect(activities).toHaveLength(2);
  });

  test("getExecutionActivities returns execution activities", async () => {
    const userId = new mongoose.Types.ObjectId();
    const executionId = new mongoose.Types.ObjectId();
    await activityService.logActivity(userId, "execution_started", null, "Start", {}, executionId);

    const activities = await activityService.getExecutionActivities(executionId, userId);
    expect(activities).toHaveLength(1);
  });

  test("deleteActivity removes activity", async () => {
    const userId = new mongoose.Types.ObjectId();
    const activity = await activityService.logActivity(userId, "task_created", null, "Test");

    const deleted = await activityService.deleteActivity(activity.id, userId);
    expect(deleted).toBeDefined();
  });

  test("markActivityRead passes through to the repository", async () => {
    const userId = new mongoose.Types.ObjectId();
    const activity = await activityService.logActivity(userId, "task_created", null, "Test");

    const updated = await activityService.markActivityRead(activity.id, userId);
    expect(updated.read).toBe(true);
  });

  test("markAllActivitiesRead returns the modified count", async () => {
    const userId = new mongoose.Types.ObjectId();
    await activityService.logActivity(userId, "task_created", null, "A");
    await activityService.logActivity(userId, "task_completed", null, "B");

    const count = await activityService.markAllActivitiesRead(userId);
    expect(count).toBe(2);
  });
});

describe("Artifact Model", () => {
  test("creates artifact with all required fields", async () => {
    const userId = new mongoose.Types.ObjectId();
    const taskId = new mongoose.Types.ObjectId();
    const executionId = new mongoose.Types.ObjectId();

    const artifact = await Artifact.create({
      userId,
      taskId,
      executionId,
      type: "execution_output",
      name: "Test Output",
      content: { result: "success" },
      metadata: { source: "test" },
    });

    expect(artifact).toBeDefined();
    expect(artifact.userId.toString()).toBe(userId.toString());
    expect(artifact.type).toBe("execution_output");
    expect(artifact.name).toBe("Test Output");
    expect(artifact.content.result).toBe("success");
    expect(artifact.metadata.source).toBe("test");
  });

  test("creates artifact with defaults", async () => {
    const userId = new mongoose.Types.ObjectId();
    const artifact = await Artifact.create({
      userId,
      type: "document",
      name: "Test Doc",
    });

    expect(artifact.taskId).toBeNull();
    expect(artifact.executionId).toBeNull();
    expect(artifact.content).toEqual({});
    expect(artifact.metadata).toEqual({});
  });

  test("rejects invalid type", async () => {
    const userId = new mongoose.Types.ObjectId();
    await expect(
      Artifact.create({ userId, type: "invalid", name: "Test" })
    ).rejects.toThrow();
  });

  test("rejects empty name", async () => {
    const userId = new mongoose.Types.ObjectId();
    await expect(
      Artifact.create({ userId, type: "document", name: "" })
    ).rejects.toThrow();
  });

  test("virtual id works", async () => {
    const userId = new mongoose.Types.ObjectId();
    const artifact = await Artifact.create({ userId, type: "document", name: "Test" });
    const json = artifact.toJSON();
    expect(json.id).toBeDefined();
    expect(json._id).toBeUndefined();
  });

  test("toJSON strips userId", async () => {
    const userId = new mongoose.Types.ObjectId();
    const artifact = await Artifact.create({ userId, type: "document", name: "Test" });
    const json = artifact.toJSON();
    expect(json.userId).toBeUndefined();
  });

  test.each(VALID_ARTIFACT_TYPES)("accepts type: %s", async (type) => {
    const userId = new mongoose.Types.ObjectId();
    const artifact = await Artifact.create({ userId, type, name: `Test ${type}` });
    expect(artifact.type).toBe(type);
  });
});

describe("Artifact Repository", () => {
  test("createArtifact stores artifact", async () => {
    const userId = new mongoose.Types.ObjectId();
    const result = await artifactRepo.createArtifact({
      userId,
      type: "ai_response",
      name: "AI Output",
      content: { answer: "42" },
    });

    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.type).toBe("ai_response");
  });

  test("findArtifactsByUserId returns user artifacts sorted by newest", async () => {
    const userId = new mongoose.Types.ObjectId();
    const otherUserId = new mongoose.Types.ObjectId();

    await artifactRepo.createArtifact({ userId, type: "document", name: "First" });
    await new Promise((r) => setTimeout(r, 10));
    await artifactRepo.createArtifact({ userId, type: "report", name: "Second" });
    await artifactRepo.createArtifact({ userId: otherUserId, type: "document", name: "Other" });

    const artifacts = await artifactRepo.findArtifactsByUserId(userId, 10);
    expect(artifacts).toHaveLength(2);
    expect(artifacts[0].name).toBe("Second");
    expect(artifacts[1].name).toBe("First");
  });

  test("findArtifactsByUserId respects limit and offset", async () => {
    const userId = new mongoose.Types.ObjectId();
    for (let i = 0; i < 5; i++) {
      await artifactRepo.createArtifact({ userId, type: "document", name: `Doc ${i}` });
    }

    const limited = await artifactRepo.findArtifactsByUserId(userId, 2);
    expect(limited).toHaveLength(2);

    const offset = await artifactRepo.findArtifactsByUserId(userId, 10, 3);
    expect(offset).toHaveLength(2);
  });

  test("findArtifactsByTaskId returns task artifacts", async () => {
    const userId = new mongoose.Types.ObjectId();
    const taskId = new mongoose.Types.ObjectId();
    const otherTaskId = new mongoose.Types.ObjectId();

    await artifactRepo.createArtifact({ userId, type: "document", name: "For task", taskId });
    await artifactRepo.createArtifact({ userId, type: "document", name: "Other", taskId: otherTaskId });

    const artifacts = await artifactRepo.findArtifactsByTaskId(taskId, userId);
    expect(artifacts).toHaveLength(1);
  });

  test("findArtifactsByExecutionId returns execution artifacts", async () => {
    const userId = new mongoose.Types.ObjectId();
    const executionId = new mongoose.Types.ObjectId();

    await artifactRepo.createArtifact({ userId, type: "execution_output", name: "Output", executionId });

    const artifacts = await artifactRepo.findArtifactsByExecutionId(executionId, userId);
    expect(artifacts).toHaveLength(1);
  });

  test("findArtifactByIdAndUserId returns artifact", async () => {
    const userId = new mongoose.Types.ObjectId();
    const artifact = await artifactRepo.createArtifact({ userId, type: "document", name: "Test" });

    const found = await artifactRepo.findArtifactByIdAndUserId(artifact.id, userId);
    expect(found).toBeDefined();
    expect(found.name).toBe("Test");
  });

  test("findArtifactByIdAndUserId returns null for wrong user", async () => {
    const userId = new mongoose.Types.ObjectId();
    const otherUserId = new mongoose.Types.ObjectId();
    const artifact = await artifactRepo.createArtifact({ userId, type: "document", name: "Test" });

    const found = await artifactRepo.findArtifactByIdAndUserId(artifact.id, otherUserId);
    expect(found).toBeNull();
  });

  test("deleteArtifact removes artifact", async () => {
    const userId = new mongoose.Types.ObjectId();
    const artifact = await artifactRepo.createArtifact({ userId, type: "document", name: "Test" });

    const deleted = await artifactRepo.deleteArtifact(artifact.id, userId);
    expect(deleted).toBeDefined();

    const remaining = await artifactRepo.findArtifactsByUserId(userId);
    expect(remaining).toHaveLength(0);
  });

  test("deleteArtifact returns null for non-existent", async () => {
    const userId = new mongoose.Types.ObjectId();
    const fakeId = new mongoose.Types.ObjectId();
    const result = await artifactRepo.deleteArtifact(fakeId, userId);
    expect(result).toBeNull();
  });
});

describe("Artifact Service", () => {
  test("createArtifact creates artifact", async () => {
    const userId = new mongoose.Types.ObjectId();
    const taskId = new mongoose.Types.ObjectId();
    const executionId = new mongoose.Types.ObjectId();

    const artifact = await artifactService.createArtifact(
      userId, "execution_output", "Test Output",
      { result: "success" }, taskId, executionId, { source: "test" }
    );

    expect(artifact).toBeDefined();
    expect(artifact.type).toBe("execution_output");
    expect(artifact.taskId.toString()).toBe(taskId.toString());
    expect(artifact.executionId.toString()).toBe(executionId.toString());
  });

  test("getUserArtifacts returns artifacts with limit", async () => {
    const userId = new mongoose.Types.ObjectId();
    await artifactService.createArtifact(userId, "document", "A");
    await artifactService.createArtifact(userId, "document", "B");

    const artifacts = await artifactService.getUserArtifacts(userId, 1);
    expect(artifacts).toHaveLength(1);
  });

  test("getTaskArtifacts returns task-specific artifacts", async () => {
    const userId = new mongoose.Types.ObjectId();
    const taskId = new mongoose.Types.ObjectId();
    await artifactService.createArtifact(userId, "document", "For task", {}, taskId);
    await artifactService.createArtifact(userId, "document", "Other task", {}, new mongoose.Types.ObjectId());

    const artifacts = await artifactService.getTaskArtifacts(taskId, userId);
    expect(artifacts).toHaveLength(1);
  });

  test("getExecutionArtifacts returns execution artifacts", async () => {
    const userId = new mongoose.Types.ObjectId();
    const executionId = new mongoose.Types.ObjectId();
    await artifactService.createArtifact(userId, "execution_output", "Output", {}, null, executionId);

    const artifacts = await artifactService.getExecutionArtifacts(executionId, userId);
    expect(artifacts).toHaveLength(1);
  });

  test("getArtifactById returns artifact", async () => {
    const userId = new mongoose.Types.ObjectId();
    const artifact = await artifactService.createArtifact(userId, "document", "Test");

    const found = await artifactService.getArtifactById(artifact.id, userId);
    expect(found).toBeDefined();
    expect(found.name).toBe("Test");
  });

  test("getArtifactById returns null for wrong user", async () => {
    const userId = new mongoose.Types.ObjectId();
    const otherUserId = new mongoose.Types.ObjectId();
    const artifact = await artifactService.createArtifact(userId, "document", "Test");

    const found = await artifactService.getArtifactById(artifact.id, otherUserId);
    expect(found).toBeNull();
  });

  test("deleteArtifact removes artifact", async () => {
    const userId = new mongoose.Types.ObjectId();
    const artifact = await artifactService.createArtifact(userId, "document", "Test");

    const deleted = await artifactService.deleteArtifact(artifact.id, userId);
    expect(deleted).toBeDefined();
  });
});
