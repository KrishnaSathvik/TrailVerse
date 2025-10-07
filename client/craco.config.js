const isProduction = process.env.NODE_ENV === 'production';

module.exports = {
  babel: {
    presets: [
      [
        '@babel/preset-env',
        {
          targets: {
            node: 'current',
          },
        },
      ],
      [
        '@babel/preset-react',
        {
          development: false,
          runtime: 'automatic',
        },
      ],
    ],
    plugins: [
      // Remove console statements in production builds
      ...(isProduction ? ['transform-remove-console'] : []),
    ],
  },
  webpack: {
    configure: (webpackConfig) => {
      // Always disable React Refresh
      webpackConfig.plugins = webpackConfig.plugins.filter(
        plugin => plugin.constructor.name !== 'ReactRefreshPlugin'
      );
      
      if (isProduction) {
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
