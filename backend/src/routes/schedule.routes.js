const { Router } = require("express");
const { authenticate } = require("../middleware/auth.middleware");
const ctrl = require("../controllers/schedule.controller");

const router = Router();

router.use(authenticate);

router.post("/", ctrl.createSchedule);
router.get("/", ctrl.listSchedules);
router.get("/:id", ctrl.getSchedule);
router.put("/:id", ctrl.updateSchedule);
router.post("/:id/toggle", ctrl.toggleSchedule);
router.delete("/:id", ctrl.deleteSchedule);

module.exports = router;
