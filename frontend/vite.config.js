import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Allow Vite to serve files from the parent-level deployments/ folder.
  // Without this, import.meta.glob('/deployments/...') silently returns {}
  // because the folder is outside the project root (frontend/).
  server: {
    fs: {
      allow: [
        path.resolve(__dirname, '..'),   // monorepo root
        path.resolve(__dirname),         // frontend/
      ],
    },
  },
  // Make ../deployments accessible as /deployments inside Vite
  resolve: {
    alias: {
      '/deployments': path.resolve(__dirname, '../deployments'),
    },
  },
})
