const path = require('path');

module.exports = function override(config, env) {
  const isProduction = env === 'production';
  
  // Disable fork-ts-checker-webpack-plugin to avoid ajv-keywords conflicts
  if (config.plugins) {
    config.plugins = config.plugins.filter(plugin => {
      return plugin.constructor.name !== 'ForkTsCheckerWebpackPlugin';
    });
  }
  
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
