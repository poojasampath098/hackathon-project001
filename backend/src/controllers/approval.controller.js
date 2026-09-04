const approvalService = require("../services/approval.service");
const activityService = require("../services/activity.service");

async function requestApproval(req, res, next) {
  try {
    const { taskId, executionId, approverUserId } = req.body;
    const userId = req.user.userId;

    if (!taskId || !executionId) {
      const err = new Error("taskId and executionId are required");
      err.statusCode = 400;
      return next(err);
    }

    const approval = await approvalService.requestApproval(taskId, executionId, userId, approverUserId);

    activityService.logActivity(
      userId, "approval_requested", taskId,
      `Approval requested for task`,
      { approvalId: approval.id, executionId }
    ).catch(() => {});

    res.status(201).json({
      success: true,
      message: "Approval requested",
      data: { approval },
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

async function approve(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user.userId;

    const approval = await approvalService.approveRequest(id, userId, reason);

    activityService.logActivity(
      userId, "approval_granted", approval.taskId,
      `Approval granted`,
      { approvalId: id, reason: reason || "" }
    ).catch(() => {});

    res.status(200).json({
      success: true,
      message: "Approval granted",
      data: { approval },
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

async function reject(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user.userId;

    const approval = await approvalService.rejectRequest(id, userId, reason);

    activityService.logActivity(
      userId, "approval_rejected", approval.taskId,
      `Approval rejected`,
      { approvalId: id, reason: reason || "" }
    ).catch(() => {});

    res.status(200).json({
      success: true,
      message: "Approval rejected",
      data: { approval },
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

async function getApproval(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const approval = await approvalService.getApproval(id, userId);

    res.status(200).json({
      success: true,
      data: { approval },
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

async function listPending(req, res, next) {
  try {
    const userId = req.user.userId;
    const approvals = await approvalService.listPendingApprovals(userId);

    res.status(200).json({
      success: true,
      data: { approvals },
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

async function listAll(req, res, next) {
  try {
    const userId = req.user.userId;
    const approvals = await approvalService.listApprovals(userId);

    res.status(200).json({
      success: true,
      data: { approvals },
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

module.exports = { requestApproval, approve, reject, getApproval, listPending, listAll };
