import js from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier'
import vue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'json/**', 'log/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.{ts,tsx,vue}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        parser: tseslint.parser,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'vue/multi-word-component-names': 'off',
      'vue/no-v-html': 'off',
      'no-undef': 'off',
      'no-redeclare': 'off',
      'no-console': 'warn',
      'no-debugger': 'warn',
    },
  },
  {
    files: ['**/*.vue'],
    rules: {
      'vue/max-attributes-per-line': ['warn', { singleline: 3, multiline: 1 }],
    },
  },
  eslintConfigPrettier,
)
