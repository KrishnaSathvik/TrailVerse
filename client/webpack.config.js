const path = require('path');

module.exports = function override(config, env) {
  const isProduction = env === 'production';
  
  if (isProduction) {
    // Add plugin to remove console statements in production
    config.optimization = {
      ...config.optimization,
      minimizer: [
        ...config.optimization.minimizer,
        // You can add custom minimizer here if needed
      ],
    };
  }
  
  return config;
};
