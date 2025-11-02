module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: ['./tsconfig.json', './tsconfig.test.json'],
    sourceType: 'module'
  },
  ignorePatterns: ['*.d.ts', '*.cjs', '*.js', 'dist/**', 'node_modules/**'],
  env: {
    es2021: true,
    node: true
  },
  plugins: ['@typescript-eslint', 'import'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'plugin:import/recommended', 'prettier'],
  rules: {
    'import/extensions': ['error', 'ignorePackages', {
      js: 'always',
      ts: 'always'
    }],
    'import/no-unresolved': 'off',
    'import/order': ['error', {
      'newlines-between': 'always',
      alphabetize: { order: 'asc', caseInsensitive: true }
    }],
    '@typescript-eslint/explicit-module-boundary-types': 'off'
  },
  settings: {
    'import/resolver': {
      node: {
        extensions: ['.js', '.ts']
      }
    }
  }
};
