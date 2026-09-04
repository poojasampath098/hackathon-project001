const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const config = require("./core/config");
const logger = require("./core/logger");
const { connectDatabase } = require("./db/mongodb");
const errorHandler = require("./middleware/error.middleware");
const statusRoutes = require("./routes/status.routes");
const authRoutes = require("./routes/auth.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const taskRoutes = require("./routes/task.routes");
const aiRoutes = require("./routes/ai.routes");
const executionRoutes = require("./execution/execution.routes");
const approvalRoutes = require("./routes/approval.routes");
const scheduleRoutes = require("./routes/schedule.routes");
const analyticsRoutes = require("./routes/analytics.routes");
const userRoutes = require("./routes/user.routes");
const activityRoutes = require("./routes/activity.routes");
const artifactRoutes = require("./routes/artifact.routes");
const eventRoutes = require("./routes/event.routes");
const executionManager = require("./execution/manager");
const scheduleWorker = require("./execution/schedule.worker");
const taskWorker = require("./execution/task.worker");

const app = express();

app.use(helmet());
app.use(express.json());
app.use(
  cors({
    origin: config.frontendUrl,
    credentials: true,
  })
);
app.use(morgan("dev"));

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/status", statusRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/executions", executionRoutes);
app.use("/api/approvals", approvalRoutes);
app.use("/api/schedules", scheduleRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/users", userRoutes);
app.use("/api/activities", activityRoutes);
app.use("/api/artifacts", artifactRoutes);
app.use("/api/events", eventRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Not found" });
});

app.use(errorHandler);

connectDatabase()
  .then(async () => {
    try {
      const recovered = await executionManager.recoverStaleExecutions(60000);
      if (recovered > 0) {
        logger.info(`Recovered ${recovered} stale execution(s) on startup`);
      }
    } catch (err) {
      logger.warn("Stale execution recovery failed on startup", { error: err.message });
    }

    app.listen(config.port, () => {
      logger.info(`Server running on port ${config.port}`, {
        env: config.nodeEnv,
      });
      scheduleWorker.start();
      taskWorker.startTaskWorker();
    });
  })
  .catch((err) => {
    logger.error("Failed to connect to MongoDB", err);
    process.exit(1);
  });
