const analyticsService = require("../services/analytics.service");

async function getAnalytics(req, res, next) {
  try {
    const userId = req.user.userId;
    const analytics = await analyticsService.getUserAnalytics(userId);

    res.status(200).json({
      success: true,
      message: "Analytics fetched successfully",
      data: analytics,
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

module.exports = { getAnalytics };
