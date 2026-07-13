import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base './' : chemins relatifs, indispensable pour GitHub Pages
// (l'app est servie sous /<nom-du-repo>/ et non à la racine du domaine)
export default defineConfig({
  base: './',
  plugins: [
    react(),
    // PWA : l'app fonctionne hors-ligne (soirée sans wifi) et s'installe sur téléphone/tablette.
    // Précache tout le build, y compris les images de bouteilles (~700 Ko au total).
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.jpg', 'logo-icon.png', 'fond.jpg'],
      manifest: {
        name: 'Le Bar Clandestin',
        short_name: 'Bar Clandestin',
        description: 'Cave à whiskies personnelle : sommelier, inventaire, commande et mode soirée.',
        lang: 'fr',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#0a0705',
        theme_color: '#0a0705',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,webp,jpg,png,svg}']
      }
    })
  ]
});
