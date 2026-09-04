function validate(validator) {
  return function (req, res, next) {
    const error = validator(req);

    if (error) {
      const err = new Error(error);
      err.statusCode = 400;
      return next(err);
    }

    next();
  };
}

module.exports = { validate };
