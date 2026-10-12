import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Where the backend listens. Override with URBANHP_API to point the pages at another instance.
const api = process.env.URBANHP_API ?? 'http://127.0.0.1:8000'

// Two separate pages: the public one at / and the admin one at /admin/.
// Without this, "/admin" (no trailing slash) would fall back to the public page.
const adminPath: Plugin = {
  name: 'admin-path',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url === '/admin' || req.url?.startsWith('/admin?')) {
        res.statusCode = 302
        res.setHeader('Location', '/admin/' + (req.url.slice(6) || ''))
        res.end()
        return
      }
      next()
    })
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    adminPath,
  ],
  build: {
    rollupOptions: {
      input: {
        user: resolve(import.meta.dirname, 'index.html'),
        admin: resolve(import.meta.dirname, 'admin/index.html'),
      },
    },
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: api,
        changeOrigin: true,
        ws: true,
      },
      '/uploads': {
        target: api,
        changeOrigin: true,
      },
    },
  },
})
