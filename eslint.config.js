import googleTypeScript from 'gts';
import {defineConfig, globalIgnores} from 'eslint/config';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

const unusedVariables = {
  argsIgnorePattern: '^_',
  varsIgnorePattern: '^_',
  caughtErrorsIgnorePattern: '^_',
  ignoreRestSiblings: true,
};

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/coverage/**',
    'examples/src/assets/**',
  ]),
  {
    files: ['**/*.{js,mjs,ts}'],
    extends: [googleTypeScript],
    languageOptions: {ecmaVersion: 'latest', sourceType: 'module'},
    linterOptions: {reportUnusedDisableDirectives: 'error'},
    rules: {'no-unused-vars': ['error', unusedVariables]},
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: false,
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', unusedVariables],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/strict-boolean-expressions': [
        'error',
        {
          allowString: false,
          allowNumber: false,
          allowNullableObject: false,
          allowNullableBoolean: false,
          allowNullableString: false,
          allowNullableNumber: false,
          allowNullableEnum: false,
          allowAny: false,
        },
      ],
    },
  },
  {
    files: ['src/**/*.{js,ts}', 'examples/src/**/*.{js,ts}'],
    languageOptions: {globals: globals.browser},
  },
  {
    files: [
      'eslint.config.js',
      'scripts/**/*.mjs',
      'test/**/*.js',
      'examples/*.ts',
      'src/progress_http_server.ts',
    ],
    languageOptions: {globals: globals.node},
  },
  // Prettier owns layout. Rules below enforce Google language conventions.
  prettier,
  {
    files: ['**/*.{js,mjs,ts}'],
    rules: {
      curly: ['error', 'all'],
      eqeqeq: ['error', 'always', {null: 'ignore'}],
      'no-var': 'error',
      'prefer-const': 'error',
      'one-var': ['error', 'never'],
      'object-shorthand': ['error', 'always'],
      'prefer-rest-params': 'error',
      'prefer-spread': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-wrappers': 'error',
      'no-throw-literal': 'error',
      'no-with': 'error',
      'no-restricted-syntax': [
        'error',
        {selector: 'ExportDefaultDeclaration', message: 'Use named exports.'},
      ],
    },
  },
  {
    files: ['eslint.config.js'],
    rules: {'no-restricted-syntax': 'off'}, // ESLint requires a default export.
  },
]);
