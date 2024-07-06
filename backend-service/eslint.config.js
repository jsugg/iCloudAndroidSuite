// @ts-check

import eslint from '@eslint/js';
import jestPlugin from 'eslint-plugin-jest';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // config with just ignores is the replacement for `.eslintignore`
    ignores: [
      '**/build/**',
      '**/dist/**',
      "jest.config.cjs",
      "package.json",
      "package-lock.json",
      "rollup.config.js",
      "tsconfig.json",
      "docker-compose.yml",
      "Dockerfile",
      ".env",
      ".eslintrc.js",
      ".gitignore"
    ],
  },
  {
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      jest: jestPlugin,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: true,
      },
    },
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      'unicode-bom': ['off'],
    },
  },
  {
    // disable type-aware linting on JS files
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // enable jest rules on test files
    files: ['test/**'],
    ...jestPlugin.configs['flat/recommended'],
  },
);