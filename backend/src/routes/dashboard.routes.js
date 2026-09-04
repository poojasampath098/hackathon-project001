const express = require("express");
const { authenticate } = require("../middleware/auth.middleware");
const dashboardController = require("../controllers/dashboard.controller");

const router = express.Router();

router.get("/summary", authenticate, dashboardController.getSummary);

module.exports = router;
