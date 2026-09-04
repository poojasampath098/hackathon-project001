const { Router } = require("express");
const { authenticate } = require("../middleware/auth.middleware");
const ctrl = require("../controllers/approval.controller");

const router = Router();

router.use(authenticate);

router.post("/", ctrl.requestApproval);
router.get("/", ctrl.listAll);
router.get("/pending", ctrl.listPending);
router.get("/:id", ctrl.getApproval);
router.post("/:id/approve", ctrl.approve);
router.post("/:id/reject", ctrl.reject);

module.exports = router;
