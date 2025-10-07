const path = require('path');

module.exports = {
  webpack: {
    configure: (webpackConfig, { env, paths }) => {
      // Custom webpack configuration
      if (env === 'production') {
        // Remove React Refresh plugin in production
        webpackConfig.plugins = webpackConfig.plugins.filter(
          plugin => plugin.constructor.name !== 'ReactRefreshPlugin'
        );
        
        // Add plugin to remove console statements in production
        webpackConfig.optimization = {
          ...webpackConfig.optimization,
          minimizer: [
            ...webpackConfig.optimization.minimizer,
            // You can add custom minimizer here if needed
          ],
        };
      }
      
      return webpackConfig;
    },
  },
  babel: {
    plugins: [
      // Only include React Refresh in development
      ...(process.env.NODE_ENV === 'development' ? ['react-refresh/babel'] : []),
    ],
  },
  style: {
    postcss: {
      plugins: [
        require('tailwindcss'),
        require('autoprefixer'),
      ],
    },
  },
};
