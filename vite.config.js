import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// During local development (npm run dev / preview) there is no Vercel function,
// so Vite forwards /api/openai-count to OpenAI's token-counting endpoint server-side.
// In production, Vercel runs api/openai-count.js instead.
const openaiProxy = {
  '/api/openai-count': {
    target: 'https://api.openai.com',
    changeOrigin: true,
    rewrite: () => '/v1/responses/input_tokens',
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { proxy: openaiProxy },
  preview: { proxy: openaiProxy },
})
