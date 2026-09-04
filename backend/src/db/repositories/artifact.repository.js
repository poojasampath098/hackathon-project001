const Artifact = require("../models/artifact.model");

async function createArtifact(data) {
  const artifact = await Artifact.create({
    userId: data.userId,
    taskId: data.taskId || null,
    executionId: data.executionId || null,
    type: data.type,
    name: data.name,
    content: data.content || {},
    metadata: data.metadata || {},
  });
  return artifact.toObject();
}

async function findArtifactsByUserId(userId, limit, offset) {
  const query = Artifact.find({ userId }).sort({ createdAt: -1 });
  if (offset) query.skip(offset);
  if (limit) query.limit(limit);
  const artifacts = await query;
  return artifacts.map((a) => a.toObject());
}

async function findArtifactsByTaskId(taskId, userId) {
  const artifacts = await Artifact.find({ taskId, userId }).sort({ createdAt: -1 });
  return artifacts.map((a) => a.toObject());
}

async function findArtifactsByExecutionId(executionId, userId) {
  const artifacts = await Artifact.find({ executionId, userId }).sort({ createdAt: -1 });
  return artifacts.map((a) => a.toObject());
}

async function findArtifactByIdAndUserId(artifactId, userId) {
  const artifact = await Artifact.findOne({ _id: artifactId, userId });
  return artifact ? artifact.toObject() : null;
}

async function deleteArtifact(artifactId, userId) {
  const artifact = await Artifact.findOneAndDelete({ _id: artifactId, userId });
  return artifact ? artifact.toObject() : null;
}

module.exports = {
  createArtifact,
  findArtifactsByUserId,
  findArtifactsByTaskId,
  findArtifactsByExecutionId,
  findArtifactByIdAndUserId,
  deleteArtifact,
};
