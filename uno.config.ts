import { defineConfig, presetUno } from 'unocss'

export default defineConfig({
  presets: [presetUno()],
  shortcuts: {
    'page-container': 'max-w-1400px mx-auto px-4',
    'card': 'bg-white rounded-lg shadow-sm border border-gray-100',
    'btn': 'px-4 py-2 rounded-md font-medium cursor-pointer transition-colors',
    'btn-primary': 'btn bg-blue-600 text-white hover:bg-blue-700',
    'btn-secondary': 'btn bg-gray-100 text-gray-700 hover:bg-gray-200',
    'btn-danger': 'btn bg-red-500 text-white hover:bg-red-600',
    'input': 'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500',
    'label': 'block text-sm font-medium text-gray-700 mb-1',
  },
  theme: {
    colors: {
      brand: {
        50: '#eff6ff',
        100: '#dbeafe',
        500: '#3b82f6',
        600: '#2563eb',
        700: '#1d4ed8',
      },
    },
  },
})
