const mongoose = require("mongoose");
const approvalRepo = require("../db/repositories/approval.repository");
const taskRepo = require("../db/repositories/task.repository");
const executionRepo = require("../db/repositories/execution.repository");
const { canTransition } = require("../db/models/approval.model");

function validateObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function checkApprovalAccess(approval, actorId) {
  const requesterId = String(approval.userId);
  const actor = String(actorId);

  const hasDesignatedApprover =
    approval.approverId != null && String(approval.approverId).length > 0;

  if (hasDesignatedApprover) {
    if (String(approval.approverId) === actor) {
      return { allowed: true };
    }
    if (requesterId === actor) {
      return {
        allowed: false,
        statusCode: 403,
        message: "This request is assigned to a designated approver; you cannot approve your own request",
      };
    }
    return { allowed: false, statusCode: 404, message: "Approval not found" };
  }

  return { allowed: true };
}

async function requestApproval(taskId, executionId, userId, approverUserId) {
  if (!validateObjectId(taskId)) {
    throw Object.assign(new Error("Invalid task ID"), { statusCode: 400 });
  }
  if (!validateObjectId(executionId)) {
    throw Object.assign(new Error("Invalid execution ID"), { statusCode: 400 });
  }
  if (approverUserId !== undefined && approverUserId !== null && approverUserId !== "") {
    if (!validateObjectId(approverUserId)) {
      throw Object.assign(new Error("Invalid approver user ID"), { statusCode: 400 });
    }
    if (String(approverUserId) === String(userId)) {
      throw Object.assign(new Error("You cannot designate yourself as the approver"), { statusCode: 400 });
    }
  }

  const task = await taskRepo.findTaskByIdAndUserId(taskId, userId);
  if (!task) {
    throw Object.assign(new Error("Task not found"), { statusCode: 404 });
  }

  const execution = await executionRepo.findExecutionByIdAndUserId(executionId, userId);
  if (!execution) {
    throw Object.assign(new Error("Execution not found"), { statusCode: 404 });
  }

  const existing = await approvalRepo.findPendingByExecutionId(executionId);
  if (existing) {
    throw Object.assign(new Error("Approval already pending for this execution"), { statusCode: 409 });
  }

  return await approvalRepo.createApproval({
    taskId,
    executionId,
    userId,
    approverId: approverUserId || null,
  });
}

async function approveRequest(approvalId, userId, reason) {
  if (!validateObjectId(approvalId)) {
    throw Object.assign(new Error("Invalid approval ID"), { statusCode: 400 });
  }

  const existing = await approvalRepo.findApprovalById(approvalId);
  if (!existing) {
    throw Object.assign(new Error("Approval not found"), { statusCode: 404 });
  }

  const access = checkApprovalAccess(existing, userId);
  if (!access.allowed) {
    throw Object.assign(new Error(access.message), { statusCode: access.statusCode });
  }

  if (!canTransition(existing.status, "approved")) {
    throw Object.assign(
      new Error(`Cannot approve: approval is already ${existing.status}`),
      { statusCode: 409 }
    );
  }

  const result = await approvalRepo.updateApprovalById(approvalId, {
    status: "approved",
    reason: reason || "",
  });

  if (!result) throw Object.assign(new Error("Approval not found"), { statusCode: 404 });
  return result;
}

async function rejectRequest(approvalId, userId, reason) {
  if (!validateObjectId(approvalId)) {
    throw Object.assign(new Error("Invalid approval ID"), { statusCode: 400 });
  }

  const existing = await approvalRepo.findApprovalById(approvalId);
  if (!existing) {
    throw Object.assign(new Error("Approval not found"), { statusCode: 404 });
  }

  const access = checkApprovalAccess(existing, userId);
  if (!access.allowed) {
    throw Object.assign(new Error(access.message), { statusCode: access.statusCode });
  }

  if (!canTransition(existing.status, "rejected")) {
    throw Object.assign(
      new Error(`Cannot reject: approval is already ${existing.status}`),
      { statusCode: 409 }
    );
  }

  const result = await approvalRepo.updateApprovalById(approvalId, {
    status: "rejected",
    reason: reason || "",
  });

  if (!result) throw Object.assign(new Error("Approval not found"), { statusCode: 404 });
  return result;
}

async function getApproval(approvalId, userId) {
  if (!validateObjectId(approvalId)) {
    throw Object.assign(new Error("Invalid approval ID"), { statusCode: 400 });
  }

  const approval = await approvalRepo.findApprovalByIdAndUserId(approvalId, userId);
  if (!approval) throw Object.assign(new Error("Approval not found"), { statusCode: 404 });
  return approval;
}

async function listPendingApprovals(userId) {
  return await approvalRepo.findPendingByUserId(userId);
}

async function listApprovals(userId) {
  return await approvalRepo.findAllByUserId(userId);
}

async function getApprovalByExecutionId(executionId) {
  return await approvalRepo.findByExecutionId(executionId);
}

module.exports = { requestApproval, approveRequest, rejectRequest, getApproval, listPendingApprovals, listApprovals, getApprovalByExecutionId };
