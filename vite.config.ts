import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { createDevApiMiddleware } from './scripts/dev-api.mjs'

function localApiPlugin(): Plugin {
  return {
    name: 'noia-local-api',
    configureServer(server) {
      server.middlewares.use(createDevApiMiddleware())
    },
    configurePreviewServer(server) {
      server.middlewares.use(createDevApiMiddleware())
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localApiPlugin()],
})
