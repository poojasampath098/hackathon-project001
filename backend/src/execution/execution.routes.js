const { Router } = require("express");
const { authenticate } = require("../middleware/auth.middleware");
const ctrl = require("./execution.controller");

const router = Router();

router.use(authenticate);

router.post("/", ctrl.startExecution);
router.get("/", ctrl.listUserExecutions);
router.get("/by-task", ctrl.listByTask);
router.post("/recover-stale", ctrl.recoverStale);
router.get("/:id", ctrl.getExecution);
router.post("/:id/run", ctrl.runExecution);
router.post("/:id/cancel", ctrl.cancelExecution);

module.exports = router;
