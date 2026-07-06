import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { resolve } from 'path'
import { notionApiPlugin } from './vite-plugin-notion-api'

export default defineConfig({
  plugins: [vue(), UnoCSS(), notionApiPlugin()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
