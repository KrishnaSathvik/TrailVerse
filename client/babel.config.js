module.exports = function(api) {
  const isProduction = process.env.NODE_ENV === 'production';
  
  return {
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
          development: !isProduction,
          runtime: 'automatic',
        },
      ],
    ],
    plugins: [
      // Remove console statements in production builds
      ...(isProduction ? ['transform-remove-console'] : []),
      // Add React Refresh with skipEnvCheck for production
      ...(isProduction ? [['react-refresh/babel', { skipEnvCheck: true }]] : ['react-refresh/babel']),
    ],
  };
};
