// Local UI preview with demo data: `npm run dev:mock`.
// Swaps src/lib/supabase.ts for dev/mock-backend/supabase.ts, which keeps
// demo data in the browser and never contacts Supabase or Resend. Environment
// files are not loaded, so no real keys are read. Never used for production.
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

const root = path.dirname(fileURLToPath(import.meta.url))
const realClient = path.join(root, 'src', 'lib', 'supabase.ts')
const mockClient = path.join(root, 'dev', 'mock-backend', 'supabase.ts')

function mockSupabase(): Plugin {
  return {
    name: 'tae-mock-supabase',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || !source.includes('supabase')) return null
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      if (resolved && path.normalize(resolved.id) === realClient) return mockClient
      return null
    },
  }
}

export default defineConfig({
  plugins: [mockSupabase(), react()],
  envDir: path.join(root, 'dev', 'mock-backend'),
  server: { port: 5180, strictPort: true },
})
