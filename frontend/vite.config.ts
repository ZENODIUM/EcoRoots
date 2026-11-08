import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const cesiumSource = 'node_modules/cesium/Build/Cesium'

// envDir points at the project root so the single gitignored .env.local is used;
// Vite only exposes VITE_* variables to the browser (the Cesium ion token).
export default defineConfig({
  envDir: '..',
  plugins: [
    react(),
    viteStaticCopy({
      targets: ['Workers', 'ThirdParty', 'Assets', 'Widgets'].map((d) => ({ src: `${cesiumSource}/${d}`, dest: 'cesium' })),
    }),
  ],
  define: { CESIUM_BASE_URL: JSON.stringify('/cesium') },
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8000' } },
  preview: { port: 4173, proxy: { '/api': 'http://127.0.0.1:8000' } },
})
