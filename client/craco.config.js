module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Remove fork-ts-checker-webpack-plugin completely
      webpackConfig.plugins = webpackConfig.plugins.filter(plugin => {
        return plugin.constructor.name !== 'ForkTsCheckerWebpackPlugin';
      });
      
      // Disable TypeScript checking entirely
      webpackConfig.resolve = webpackConfig.resolve || {};
      webpackConfig.resolve.alias = {
        ...webpackConfig.resolve.alias,
        // Disable TypeScript by aliasing it to a dummy module
      };
      
      return webpackConfig;
    },
  },
};
