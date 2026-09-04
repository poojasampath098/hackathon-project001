const express = require("express");
const { authenticate } = require("../middleware/auth.middleware");
const taskController = require("../controllers/task.controller");

const router = express.Router();

router.post("/", authenticate, taskController.createTask);
router.get("/", authenticate, taskController.getTasks);
router.get("/:id", authenticate, taskController.getTask);
router.put("/:id", authenticate, taskController.updateTask);
router.patch("/:id", authenticate, taskController.updateTask);
router.delete("/:id", authenticate, taskController.deleteTask);

module.exports = router;
