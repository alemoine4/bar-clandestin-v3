import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' : chemins relatifs, indispensable pour GitHub Pages
// (l'app est servie sous /<nom-du-repo>/ et non à la racine du domaine)
export default defineConfig({
  base: './',
  plugins: [react()]
});
