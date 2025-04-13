import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  publicDir: 'app/public',
  build: {
    outDir: 'public',
  },
  plugins: [react()],
})
