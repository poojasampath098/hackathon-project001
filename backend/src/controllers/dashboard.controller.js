const dashboardService = require("../services/dashboard.service");

async function getSummary(req, res, next) {
  try {
    const data = await dashboardService.getSummary(req.user.userId);
    res.status(200).json({
      success: true,
      message: "Dashboard summary fetched successfully",
      data,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getSummary };
