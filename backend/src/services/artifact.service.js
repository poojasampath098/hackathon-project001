const artifactRepo = require("../db/repositories/artifact.repository");

async function createArtifact(userId, type, name, content, taskId, executionId, metadata) {
  return await artifactRepo.createArtifact({
    userId,
    type,
    name,
    content: content || {},
    taskId: taskId || null,
    executionId: executionId || null,
    metadata: metadata || {},
  });
}

async function getUserArtifacts(userId, limit, offset) {
  return await artifactRepo.findArtifactsByUserId(userId, limit || 50, offset || 0);
}

async function getTaskArtifacts(taskId, userId) {
  return await artifactRepo.findArtifactsByTaskId(taskId, userId);
}

async function getExecutionArtifacts(executionId, userId) {
  return await artifactRepo.findArtifactsByExecutionId(executionId, userId);
}

async function getArtifactById(artifactId, userId) {
  return await artifactRepo.findArtifactByIdAndUserId(artifactId, userId);
}

async function deleteArtifact(artifactId, userId) {
  return await artifactRepo.deleteArtifact(artifactId, userId);
}

module.exports = {
  createArtifact,
  getUserArtifacts,
  getTaskArtifacts,
  getExecutionArtifacts,
  getArtifactById,
  deleteArtifact,
};
