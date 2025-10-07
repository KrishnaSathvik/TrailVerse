const isProduction = process.env.NODE_ENV === 'production';

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      if (isProduction) {
        // Disable React Refresh in production
        webpackConfig.plugins = webpackConfig.plugins.filter(
          plugin => plugin.constructor.name !== 'ReactRefreshPlugin'
        );
        
        // Additional webpack optimizations for production
        webpackConfig.optimization = {
          ...webpackConfig.optimization,
          minimize: true,
        };
      }
      return webpackConfig;
    },
  },
};
