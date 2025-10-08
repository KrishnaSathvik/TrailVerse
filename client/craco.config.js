const path = require('path');

module.exports = {
  webpack: {
    alias: {
      // Force CRA to use our stub instead of real Terser
      'terser-webpack-plugin': path.resolve(__dirname, 'scripts/noop-terser-plugin.js'),
    },
    configure: (config, { env }) => {
      // Remove ForkTsChecker no matter when it's injected
      let ForkTsCheckerWebpackPlugin = null;
      try { ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin'); } catch (_) {}

      config.plugins = (config.plugins || []).filter((plugin) => {
        const name = plugin?.constructor?.name;
        const byName = name === 'ForkTsCheckerWebpackPlugin';
        const byInstance = ForkTsCheckerWebpackPlugin && (plugin instanceof ForkTsCheckerWebpackPlugin);
        return !(byName || byInstance);
      });

      // Don't minimize (prevents webpack from trying to re-minify)
      if (env === 'production') {
        config.optimization = config.optimization || {};
        config.optimization.minimize = false;
        config.optimization.minimizer = [];
      }

      return config;
    },
  },
};
