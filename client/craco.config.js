const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  webpack: {
    configure: (config) => {
      // Remove ForkTsChecker (which drags schema-utils v2 behavior)
      config.plugins = config.plugins.filter(
        (p) => !(p && p.constructor && p.constructor.name === 'ForkTsCheckerWebpackPlugin')
      );

      // Ensure modern terser
      if (config.optimization && Array.isArray(config.optimization.minimizer)) {
        config.optimization.minimizer = config.optimization.minimizer.map((m) => {
          if (m && m.constructor && m.constructor.name === 'TerserPlugin') {
            return new TerserPlugin({
              parallel: true,
              extractComments: false,
              terserOptions: {
                compress: { comparisons: false },
                mangle: true,
                format: { comments: false }
              }
            });
          }
          return m;
        });
      }
      return config;
    }
  }
};
