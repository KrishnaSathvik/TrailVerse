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
          development: false,
          runtime: 'automatic',
        },
      ],
    ],
    plugins: [
      // Remove console statements in production builds
      ...(isProduction ? ['transform-remove-console'] : []),
    ],
  };
};
