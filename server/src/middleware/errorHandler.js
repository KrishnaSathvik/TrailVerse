const errorHandler = (err, req, res, next) => {
  console.error(err.stack);

  // Stage 14.7F4 §7 — bounded write-contract failures. Carries only a stable
  // code, a bounded category and a field path; never the offending value.
  if (err.isTripWriteContractError) {
    return res.status(err.statusCode || 400).json({
      success: false,
      error: 'Invalid trip write',
      code: err.code,
      category: err.category,
      field: err.field || null,
    });
  }

  // Stage 14.7F4 §7 — a CastError previously escaped as an unbounded 500 whose
  // message quoted the rejected value (e.g. a string conversation id). It is a
  // malformed request, so it becomes a bounded 4xx and the value is dropped.
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: 'Invalid field value',
      code: 'field_cast_failed',
      category: 'schema_validation',
      field: typeof err.path === 'string' ? err.path : null,
    });
  }

  if (err.name === 'ValidationError') {
    // Report bounded field paths and the schema's own messages — never the
    // submitted values, which Mongoose interpolates into some messages.
    const fields = Object.keys(err.errors || {});
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      code: 'schema_validation_failed',
      category: 'schema_validation',
      fields,
    });
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    return res.status(409).json({
      success: false,
      error: `A record with that ${field} already exists.`,
    });
  }

  res.status(err.statusCode || 500).json({
    success: false,
    error: err.message || 'Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = errorHandler;
