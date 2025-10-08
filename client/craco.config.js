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
    // Disable terser-webpack-plugin to avoid ajv-keywords formatMinimum error
    config.optimization = {
      ...config.optimization,
      minimizer: config.optimization.minimizer.filter(plugin => {
        return plugin.constructor.name !== 'TerserPlugin';
      }),
    };
  }
  
  return config;
};
