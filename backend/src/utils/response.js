function success(res, message, data, statusCode) {
  const body = { success: true, message };
  if (data !== undefined) body.data = data;
  return res.status(statusCode || 200).json(body);
}

function created(res, message, data) {
  return success(res, message, data, 201);
}

function error(res, message, statusCode) {
  return res.status(statusCode || 500).json({ success: false, message });
}

module.exports = { success, created, error };
