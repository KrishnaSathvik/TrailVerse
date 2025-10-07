const path = require('path');

module.exports = {
  webpack: {
    configure: (webpackConfig, { env, paths }) => {
      // Custom webpack configuration
      if (env === 'production') {
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
  style: {
    postcss: {
      plugins: [
        require('tailwindcss'),
        require('autoprefixer'),
      ],
    },
  },
};
