const { Router } = require("express");
const { authenticate } = require("../middleware/auth.middleware");
const ctrl = require("../controllers/activity.controller");

const router = Router();

router.use(authenticate);

router.get("/", ctrl.listActivities);
router.get("/task/:taskId", ctrl.getTaskActivity);
router.get("/execution/:executionId", ctrl.getExecutionActivity);
router.post("/read-all", ctrl.markAllActivitiesRead);
router.patch("/:id/read", ctrl.markActivityRead);
router.delete("/:id", ctrl.deleteActivity);

module.exports = router;
