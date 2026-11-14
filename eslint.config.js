import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['docs/design/**', 'dist', 'coverage', 'playwright-report', 'test-results', 'node_modules', 'public/mediapipe'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['*.config.{js,ts}', 'scripts/**', 'e2e/**'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Architecture rule: src/core is pure logic — no DOM-only or MediaPipe imports.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['@mediapipe/*', '../ui/*', '../pose/*', 'dexie'] },
      ],
    },
  },
  {
    // Test helpers (src/core/testkit) never reach app code. Repeats the core patterns because a
    // later block replaces the rule's options for the files it matches.
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.test.ts', 'src/core/testkit/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['**/testkit/*', './testkit/*'] },
      ],
    },
  },
  {
    files: ['src/core/**/*.ts'],
    ignores: ['src/**/*.test.ts', 'src/core/testkit/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['@mediapipe/*', '../ui/*', '../pose/*', 'dexie', '**/testkit/*', './testkit/*'] },
      ],
    },
  },
  prettier,
);
