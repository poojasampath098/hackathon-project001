const os = require("os");
const mongoose = require("mongoose");
const config = require("../core/config");
const Task = require("../db/models/task.model");
const Execution = require("../db/models/execution.model");
const Approval = require("../db/models/approval.model");
const Activity = require("../db/models/activity.model");

function getCpuUsage() {
  return new Promise((resolve) => {
    const cpus1 = os.cpus();
    setTimeout(() => {
      const cpus2 = os.cpus();
      let idleDiff = 0;
      let totalDiff = 0;
      for (let i = 0; i < cpus2.length; i++) {
        const idle1 = cpus1[i].times.idle;
        const idle2 = cpus2[i].times.idle;
        const total1 =
          cpus1[i].times.user +
          cpus1[i].times.nice +
          cpus1[i].times.sys +
          cpus1[i].times.idle +
          cpus1[i].times.irq;
        const total2 =
          cpus2[i].times.user +
          cpus2[i].times.nice +
          cpus2[i].times.sys +
          cpus2[i].times.idle +
          cpus2[i].times.irq;
        idleDiff += idle2 - idle1;
        totalDiff += total2 - total1;
      }
      const usage = totalDiff > 0 ? ((totalDiff - idleDiff) / totalDiff) * 100 : 0;
      resolve({
        cores: cpus2.length,
        model: cpus2[0] ? cpus2[0].model : "unknown",
        usagePercent: Math.round(usage * 100) / 100,
      });
    }, 100);
  });
}

function getMemoryUsage() {
  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();
  const usedBytes = totalBytes - freeBytes;
  const processMemory = process.memoryUsage();
  return {
    totalMB: Math.round(totalBytes / (1024 * 1024)),
    usedMB: Math.round(usedBytes / (1024 * 1024)),
    freeMB: Math.round(freeBytes / (1024 * 1024)),
    usagePercent: Math.round((usedBytes / totalBytes) * 10000) / 100,
    processHeapMB: Math.round(processMemory.heapUsed / (1024 * 1024)),
    processRssMB: Math.round(processMemory.rss / (1024 * 1024)),
  };
}

function getNetworkUsage() {
  const interfaces = os.networkInterfaces();
  const result = {};
  for (const [name, addresses] of Object.entries(interfaces)) {
    result[name] = addresses
      .filter((a) => !a.internal)
      .map((a) => ({
        address: a.address,
        family: a.family,
        mac: a.mac,
      }));
  }
  return result;
}

async function getGpuUsage() {
  try {
    const { execSync } = require("child_process");
    const output = execSync(
      'nvidia-smi --query-gpu=name,utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits',
      { timeout: 3000, windowsHide: true }
    ).toString().trim();
    const lines = output.split("\n");
    return lines.map((line) => {
      const [name, usage, memUsed, memTotal] = line.split(",").map((s) => s.trim());
      return {
        name,
        usagePercent: parseFloat(usage),
        memoryUsedMB: parseFloat(memUsed),
        memoryTotalMB: parseFloat(memTotal),
      };
    });
  } catch {
    return null;
  }
}

function getSystemStatus() {
  return {
    status: "operational",
    uptime: Math.round(os.uptime()),
    platform: os.platform(),
    nodeVersion: process.version,
    environment: config.nodeEnv,
    mongodbState: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  };
}

async function getTaskActivityThisWeek(userId) {
  const days = [];
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  monday.setHours(0, 0, 0, 0);

  const pad = (n) => String(n).padStart(2, "0");

  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const nextDay = new Date(date);
    nextDay.setDate(date.getDate() + 1);

    let count = 0;
    if (userId) {
      count = await Task.countDocuments({
        userId,
        createdAt: { $gte: date, $lt: nextDay },
      });
    }

    days.push({
      date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
      count,
    });
  }
  return days;
}

async function getAgentSuccessRate(userId) {
  if (!userId) return { success: 0, failed: 0, successRate: 0 };

  const success = await Execution.countDocuments({ userId, status: "completed" });
  const failed = await Execution.countDocuments({ userId, status: "failed" });
  const total = success + failed;

  return {
    success,
    failed,
    successRate: total > 0 ? Math.round((success / total) * 100) : 0,
  };
}

async function getRecentActivity(userId) {
  if (!userId) return [];
  return await Activity.find({ userId }).sort({ createdAt: -1 }).limit(10).lean();
}

function getPreviousDayWindow(now = new Date()) {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(todayStart.getDate() - 1);
  return { yesterdayStart, todayStart };
}

async function getSummary(userId) {
  const [cpu, gpu] = await Promise.all([getCpuUsage(), getGpuUsage()]);
  const memory = getMemoryUsage();
  const network = getNetworkUsage();
  const systemStatus = getSystemStatus();

  const { yesterdayStart, todayStart } = getPreviousDayWindow(new Date());

  const [
    totalTasks,
    activeTasks,
    completedTasks,
    failedTasks,
    totalExecutions,
    successfulExecutions,
    failedExecutions,
    runningExecutions,
    pendingApprovals,
    prevActiveTasks,
    prevCompletedTasks,
    prevPendingApprovals,
    prevRunningExecutions,
    taskActivityThisWeek,
    agentSuccessRate,
    recentActivity,
  ] = await Promise.all([
    Task.countDocuments({ userId }),
    Task.countDocuments({ userId, status: { $in: ["pending", "in_progress"] } }),
    Task.countDocuments({ userId, status: "completed" }),
    Task.countDocuments({ userId, status: "failed" }),
    Execution.countDocuments({ userId }),
    Execution.countDocuments({ userId, status: "completed" }),
    Execution.countDocuments({ userId, status: "failed" }),
    Execution.countDocuments({ userId, status: "running" }),
    Approval.countDocuments({ userId, status: "pending" }),
    Task.countDocuments({
      userId,
      status: { $in: ["pending", "in_progress"] },
      createdAt: { $gte: yesterdayStart, $lt: todayStart },
    }),
    Task.countDocuments({
      userId,
      status: "completed",
      updatedAt: { $gte: yesterdayStart, $lt: todayStart },
    }),
    Approval.countDocuments({
      userId,
      status: "pending",
      createdAt: { $gte: yesterdayStart, $lt: todayStart },
    }),
    Execution.countDocuments({
      userId,
      status: "running",
      startedAt: { $gte: yesterdayStart, $lt: todayStart },
    }),
    getTaskActivityThisWeek(userId),
    getAgentSuccessRate(userId),
    getRecentActivity(userId),
  ]);

  return {
    totalTasks,
    activeTasks,
    completedTasks,
    failedTasks,
    totalExecutions,
    successfulExecutions,
    failedExecutions,
    runningExecutions,
    pendingApprovals,
    trends: {
      activeTasks: { current: activeTasks, previous: prevActiveTasks },
      completedTasks: { current: completedTasks, previous: prevCompletedTasks },
      pendingApprovals: { current: pendingApprovals, previous: prevPendingApprovals },
      runningExecutions: { current: runningExecutions, previous: prevRunningExecutions },
    },
    taskActivityThisWeek,
    agentSuccessRate,
    recentActivity,
    systemStatus,
    liveExecutions: {
      cpu,
      memory,
      network,
      gpu,
    },
  };
}

module.exports = { getSummary };
