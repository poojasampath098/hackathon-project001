const { Router } = require("express");
const { authenticate } = require("../middleware/auth.middleware");
const ctrl = require("../controllers/analytics.controller");

const router = Router();

router.use(authenticate);

router.get("/", ctrl.getAnalytics);

module.exports = router;
