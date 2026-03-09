const errorHandler = (err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    status: false,
    message: err.message || 'Internal Server Error',
    data: null,
  });
};

module.exports = errorHandler;