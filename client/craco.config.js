const isProduction = process.env.NODE_ENV === 'production';

module.exports = {
  babel: {
    plugins: [
      // Remove console statements in production
      ...(isProduction ? ['transform-remove-console'] : []),
    ],
  },
  webpack: {
    configure: (webpackConfig) => {
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
