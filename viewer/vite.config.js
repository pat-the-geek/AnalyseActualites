import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // En développement, proxy /api → Flask (port 5050)
      '/api': {
        target: 'http://localhost:5050',
        changeOrigin: true,
      },
    },
  },
})
