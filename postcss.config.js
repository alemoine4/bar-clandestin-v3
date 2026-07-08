import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Chemin explicite : sans lui, Tailwind cherche sa config depuis le cwd
// (qui n'est pas forcément ce dossier quand le dev server est lancé d'ailleurs).
const dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  plugins: {
    tailwindcss: { config: path.join(dirname, 'tailwind.config.js') },
    autoprefixer: {}
  }
};
