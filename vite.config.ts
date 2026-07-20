import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import UnoCSS from 'unocss/vite'
import { resolve } from 'path'
import { notionApiPlugin } from './vite-plugin-notion-api.js'

export default defineConfig({
  plugins: [vue(), vueJsx(), UnoCSS(), notionApiPlugin()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
