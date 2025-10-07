module.exports = {
  extends: [
    'react-app',
    'react-app/jest'
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true
    }
  },
  rules: {
    // Allow console statements in development
    'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    // Allow unused imports if they start with underscore
    'no-unused-vars': ['error', { 
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_' 
    }]
  },
  overrides: [
    {
      files: ['**/*.ts', '**/*.tsx'],
      rules: {
        // Disable JS rules for TS files
        'no-unused-vars': 'off'
      }
    }
  ]
};