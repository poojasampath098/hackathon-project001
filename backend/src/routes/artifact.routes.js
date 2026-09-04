const { Router } = require("express");
const multer = require("multer");
const { authenticate } = require("../middleware/auth.middleware");
const ctrl = require("../controllers/artifact.controller");

const router = Router();

const artifactUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

function handleArtifactUpload(req, res, next) {
  artifactUpload.single("file")(req, res, (err) => {
    if (err) {
      const error = new Error(err.code === "LIMIT_FILE_SIZE" ? "File is too large (max 5MB)" : "File upload failed");
      error.statusCode = 400;
      return next(error);
    }
    return next();
  });
}

router.use(authenticate);

router.post("/upload", handleArtifactUpload, ctrl.uploadArtifact);
router.post("/", ctrl.createArtifact);
router.get("/", ctrl.listArtifacts);
router.get("/task/:taskId", ctrl.getTaskArtifacts);
router.get("/execution/:executionId", ctrl.getExecutionArtifacts);
router.get("/:id/download", ctrl.downloadArtifact);
router.get("/:id", ctrl.getArtifact);
router.delete("/:id", ctrl.deleteArtifact);

module.exports = router;
