import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('react-dom')) return 'react-dom'
          if (id.includes('react-router')) return 'react-router'
          if (id.includes('axios')) return 'axios'
          const inReactPkg =
            id.includes('/react/') ||
            id.includes('\\react\\')
          if (inReactPkg && !id.includes('react-dom') && !id.includes('react-router')) return 'react'
        },
      },
    },
  },
})
