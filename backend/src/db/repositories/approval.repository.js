const Approval = require("../models/approval.model");

async function createApproval(data) {
  const approval = await Approval.create({
    taskId: data.taskId,
    executionId: data.executionId,
    userId: data.userId,
    approverId: data.approverId || null,
  });
  return approval.toObject();
}

async function findApprovalByIdAndUserId(approvalId, userId) {
  const approval = await Approval.findOne({ _id: approvalId, userId });
  return approval ? approval.toObject() : null;
}

async function findApprovalById(approvalId) {
  const approval = await Approval.findOne({ _id: approvalId });
  return approval ? approval.toObject() : null;
}

async function findPendingByUserId(userId) {
  const approvals = await Approval.find({ userId, status: "pending" }).sort({ createdAt: -1 });
  return approvals.map((a) => a.toObject());
}

async function findAllByUserId(userId) {
  const approvals = await Approval.find({ userId }).sort({ createdAt: -1 });
  return approvals.map((a) => a.toObject());
}

async function findPendingByExecutionId(executionId) {
  const approval = await Approval.findOne({ executionId, status: "pending" });
  return approval ? approval.toObject() : null;
}

async function findByExecutionIdAndUserId(executionId, userId) {
  const approval = await Approval.findOne({ executionId, userId });
  return approval ? approval.toObject() : null;
}

async function updateApprovalById(approvalId, updates) {
  const approval = await Approval.findOneAndUpdate(
    { _id: approvalId },
    { $set: updates },
    { returnDocument: "after" }
  );
  return approval ? approval.toObject() : null;
}

async function deleteApproval(approvalId, userId) {
  const approval = await Approval.findOneAndDelete({ _id: approvalId, userId });
  return approval ? approval.toObject() : null;
}

async function findByExecutionId(executionId) {
  const approval = await Approval.findOne({ executionId }).sort({ createdAt: -1, _id: -1 });
  return approval ? approval.toObject() : null;
}

module.exports = { createApproval, findApprovalByIdAndUserId, findApprovalById, findPendingByUserId, findAllByUserId, findPendingByExecutionId, findByExecutionIdAndUserId, findByExecutionId, updateApprovalById, deleteApproval };
