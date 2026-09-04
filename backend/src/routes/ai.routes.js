const express = require("express");
const { authenticate } = require("../middleware/auth.middleware");
const { rateLimit } = require("../middleware/rateLimit.middleware");
const aiController = require("../controllers/ai.controller");

const router = express.Router();

const aiRateLimit = rateLimit({ windowMs: 60000, max: 10, message: "AI rate limit exceeded. Please wait before sending another message." });

router.post("/chat", authenticate, aiRateLimit, aiController.chat);
router.get("/chat/history", authenticate, aiController.getHistory);
router.post("/research", authenticate, aiRateLimit, aiController.research);
router.post("/generate", authenticate, aiRateLimit, aiController.generate);
router.post("/analyze/:taskId", authenticate, aiRateLimit, aiController.analyze);

module.exports = router;
