import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const hasExplicitApiBase = Boolean(env.VITE_API_BASE_URL)
  const proxyTarget = env.VITE_DEV_API_PROXY_TARGET || 'http://localhost:3001'

  return {
    plugins: [react(), tailwindcss()],
    server: {
      allowedHosts: ['.trycloudflare.com'],
      ...(hasExplicitApiBase
        ? {}
        : {
            proxy: {
              '/api/v1': {
                target: proxyTarget,
                changeOrigin: true
              }
            }
          })
    }
  }
})
