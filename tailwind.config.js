/** @type {import('tailwindcss').Config} */
export default {
  // relative: true → chemins résolus depuis ce fichier, pas depuis le cwd
  // (sinon le dev server lancé depuis un autre dossier purge tout le CSS)
  content: {
    relative: true,
    files: ['./index.html', './src/**/*.{js,jsx}', './whisky-bar-caviste.jsx']
  },
  theme: {
    extend: {}
  },
  plugins: []
};
