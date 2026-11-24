import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (mode === 'development') {
    for (const [key, value] of Object.entries(env)) process.env[key] ??= value
  }
  return {
    plugins: [tanstackStart(), nitro({ preset: 'node-server' }), react()],
  }
})
