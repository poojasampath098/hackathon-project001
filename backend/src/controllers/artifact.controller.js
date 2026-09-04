const artifactService = require("../services/artifact.service");
const cloudinaryService = require("../services/cloudinary.service");
const mongoose = require("mongoose");

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

async function createArtifact(req, res, next) {
  try {
    const { type, name, content, taskId, executionId, metadata } = req.body;
    const userId = req.user.userId;

    if (!type || typeof type !== "string") {
      const err = new Error("type is required and must be a string");
      err.statusCode = 400;
      return next(err);
    }

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      const err = new Error("name is required and must be a non-empty string");
      err.statusCode = 400;
      return next(err);
    }

    const VALID_TYPES = ["execution_output", "ai_response", "document", "report"];
    if (!VALID_TYPES.includes(type)) {
      const err = new Error(`type must be one of: ${VALID_TYPES.join(", ")}`);
      err.statusCode = 400;
      return next(err);
    }

    if (taskId && !isValidObjectId(taskId)) {
      const err = new Error("Invalid taskId");
      err.statusCode = 400;
      return next(err);
    }

    if (executionId && !isValidObjectId(executionId)) {
      const err = new Error("Invalid executionId");
      err.statusCode = 400;
      return next(err);
    }

    const artifact = await artifactService.createArtifact(
      userId, type, name.trim(), content || {}, taskId, executionId, metadata
    );

    res.status(201).json({
      success: true,
      message: "Artifact created",
      data: { artifact },
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

async function uploadArtifact(req, res, next) {
  try {
    if (!req.file) {
      const err = new Error("No file provided");
      err.statusCode = 400;
      return next(err);
    }

    const userId = req.user.userId;
    const originalName = req.file.originalname || "file";
    const fileMeta = {
      originalName,
      mimetype: req.file.mimetype || "",
      size: req.file.size,
    };

    const isImage = fileMeta.mimetype.startsWith("image/");
    const content = { ...fileMeta };
    const metadata = { ...fileMeta, uploadedFrom: "agent" };

    if (isImage) {
      if (cloudinaryService.isConfigured()) {
        const result = await cloudinaryService.uploadImage(req.file.buffer, {
          public_id: `agent_${Date.now()}`,
          resource_type: "image",
        });
        content.secureUrl = result.secure_url;
        content.publicId = result.public_id;
        metadata.secureUrl = result.secure_url;
        metadata.publicId = result.public_id;
      } else {
        content.imageAvailable = false;
        metadata.imageAvailable = false;
      }
    } else {
      content.extractableText = null;
      content.formatSupported = false;
      metadata.formatSupported = false;
    }

    const artifact = await artifactService.createArtifact(
      userId,
      "document",
      originalName,
      content,
      null,
      null,
      metadata
    );

    res.status(201).json({
      success: true,
      message: "File uploaded successfully",
      data: { artifact },
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

async function listArtifacts(req, res, next) {
  try {
    const userId = req.user.userId;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;

    const artifacts = await artifactService.getUserArtifacts(userId, limit, offset);

    res.status(200).json({
      success: true,
      data: { artifacts },
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

async function getArtifact(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    if (!isValidObjectId(id)) {
      const err = new Error("Invalid artifact ID");
      err.statusCode = 400;
      return next(err);
    }

    const artifact = await artifactService.getArtifactById(id, userId);
    if (!artifact) {
      const err = new Error("Artifact not found");
      err.statusCode = 404;
      return next(err);
    }

    res.status(200).json({
      success: true,
      data: { artifact },
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

async function downloadArtifact(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    if (!isValidObjectId(id)) {
      const err = new Error("Invalid artifact ID");
      err.statusCode = 400;
      return next(err);
    }

    const artifact = await artifactService.getArtifactById(id, userId);
    if (!artifact) {
      const err = new Error("Artifact not found");
      err.statusCode = 404;
      return next(err);
    }

    if (artifact.content === undefined || artifact.content === null) {
      const err = new Error("Artifact has no downloadable content");
      err.statusCode = 404;
      return next(err);
    }

    const filename = (artifact.name || "artifact").replace(/[^a-zA-Z0-9_\-. ]/g, "_");
    const json = JSON.stringify(artifact.content, null, 2);

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}.json"`);
    res.status(200).send(json);
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

async function getTaskArtifacts(req, res, next) {
  try {
    const { taskId } = req.params;
    const userId = req.user.userId;

    if (!isValidObjectId(taskId)) {
      const err = new Error("Invalid task ID");
      err.statusCode = 400;
      return next(err);
    }

    const artifacts = await artifactService.getTaskArtifacts(taskId, userId);

    res.status(200).json({
      success: true,
      data: { artifacts },
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

async function getExecutionArtifacts(req, res, next) {
  try {
    const { executionId } = req.params;
    const userId = req.user.userId;

    if (!isValidObjectId(executionId)) {
      const err = new Error("Invalid execution ID");
      err.statusCode = 400;
      return next(err);
    }

    const artifacts = await artifactService.getExecutionArtifacts(executionId, userId);

    res.status(200).json({
      success: true,
      data: { artifacts },
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

async function deleteArtifact(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    if (!isValidObjectId(id)) {
      const err = new Error("Invalid artifact ID");
      err.statusCode = 400;
      return next(err);
    }

    const deleted = await artifactService.deleteArtifact(id, userId);
    if (!deleted) {
      const err = new Error("Artifact not found");
      err.statusCode = 404;
      return next(err);
    }

    res.status(200).json({
      success: true,
      message: "Artifact deleted",
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

module.exports = {
  createArtifact,
  uploadArtifact,
  listArtifacts,
  getArtifact,
  downloadArtifact,
  getTaskArtifacts,
  getExecutionArtifacts,
  deleteArtifact,
};
