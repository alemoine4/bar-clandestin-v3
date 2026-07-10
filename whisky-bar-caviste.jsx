import React, { useState, useMemo, useEffect, useRef, useCallback, useId } from 'react';
import { 
  Flame, Wine, Search, X, ChevronDown,
  CheckCircle2, AlertCircle, ArrowUpDown, Star, RefreshCw, List, ArrowLeft,
  Share2, Trash2, Heart, Download, Upload, Plus, GlassWater, Sparkles, Pencil,
  ShoppingCart, Minus, Copy, PackageCheck, Martini,
  Moon, Armchair, Zap, Cake, Compass, Users, Beef, Mountain,
  Candy, Apple, IceCream, TreePine, Hexagon, Waves, Flower2, Cookie, Settings2
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════
// CONSTANTES & CONFIGURATION
// ═══════════════════════════════════════════════════════════════
const WEIGHT_PROFILE = 3;
const WEIGHT_MOOD = 4;
const WEIGHT_FAVORITE = 2;
const DEBOUNCE_DELAY = 300;
const TOAST_DURATION = 4000;
const MAX_IMPORT_SIZE = 1024 * 1024;
const MAX_QTY = 99;
const V2_STOCK_KEY = 'whisky_v2_stock_qty';
const V2_ORDER_KEY = 'whisky_v2_order';
const V1_STOCK_KEY = 'whisky_stock_status';
const V2_PARTY_KEY = 'whisky_v2_party';
const KIOSK_DONE_TIMEOUT = 20000;
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// ═══════════════════════════════════════════════════════════════
// UTILITAIRES
// ═══════════════════════════════════════════════════════════════
const normalizeText = (str) => {
  if (typeof str !== 'string') return "";
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};

const isBrowser = typeof window !== 'undefined';

const getScrollBehavior = () => {
  if (!isBrowser || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'auto';
  return 'smooth';
};

const getFocusableElements = (container) => {
  if (!container) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR))
    .filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');
};

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const isStringArray = (value) => Array.isArray(value) && value.every(item => typeof item === 'string');

const isValidWhisky = (whisky) => {
  if (!isPlainObject(whisky)) return false;
  if (typeof whisky.id !== 'string' || typeof whisky.name !== 'string' || !whisky.name.trim()) return false;
  if (whisky.profile !== undefined && !isStringArray(whisky.profile)) return false;
  if (whisky.mood !== undefined && !isStringArray(whisky.mood)) return false;
  if (whisky.pairings !== undefined && !isStringArray(whisky.pairings)) return false;
  if (whisky.peatLevel !== undefined && (typeof whisky.peatLevel !== 'number' || whisky.peatLevel < 0 || whisky.peatLevel > 5)) return false;
  return true;
};

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

function useLocalStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      if (!isBrowser) return initialValue;
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.warn(`Erreur lecture LS ${key}`, error);
      return initialValue;
    }
  });

  const setValue = (value) => {
    setStoredValue(prev => {
      try {
        const valueToStore = value instanceof Function ? value(prev) : value;
        if (isBrowser) window.localStorage.setItem(key, JSON.stringify(valueToStore));
        return valueToStore;
      } catch (error) {
        console.error(`Erreur écriture LS ${key}`, error);
        // Prévenir l'app (quota plein, mode privé…) pour un retour visible à l'utilisateur.
        if (isBrowser) window.dispatchEvent(new CustomEvent('ls-write-error', { detail: { key } }));
        return prev;
      }
    });
  };

  return [storedValue, setValue];
}

let generatedIdCounter = 0;

const randomUnit = () => {
  if (isBrowser && window.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    return values[0] / 0xFFFFFFFF;
  }
  return ((Date.now() + generatedIdCounter) % 1000000) / 1000000;
};

const generateId = () => {
  generatedIdCounter += 1;
  if (isBrowser && window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${generatedIdCounter}`;
};

const shuffleWhiskies = (items) => {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(randomUnit() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// Moteur de score unique, partagé par le Sommelier et le Kiosque (fin de la logique dupliquée).
// Pondération : ambiance (×WEIGHT_MOOD) > arôme (×WEIGHT_PROFILE) ; bonus favori optionnel.
// `baseScore` exclut le bonus favori → sert au calcul du % de correspondance sans le gonfler.
const scoreWhisky = (whisky, selectedProfiles = [], selectedMoods = [], { favoriteBonus = false } = {}) => {
  const profileMatches = (whisky.profile || []).filter(p => selectedProfiles.includes(p));
  const moodMatches = (whisky.mood || []).filter(m => selectedMoods.includes(m));
  const baseScore = profileMatches.length * WEIGHT_PROFILE + moodMatches.length * WEIGHT_MOOD;
  const score = baseScore + (favoriteBonus && whisky.isFavorite ? WEIGHT_FAVORITE : 0);
  return { profileMatches, moodMatches, baseScore, score };
};

const isQuantityMap = (value) =>
  isPlainObject(value) && Object.values(value).every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0);

const isValidGuest = (guest) => {
  if (!isPlainObject(guest)) return false;
  if (typeof guest.id !== 'string' || typeof guest.name !== 'string' || !guest.name.trim()) return false;
  if (typeof guest.whiskyId !== 'string') return false;
  if (guest.status !== 'pending' && guest.status !== 'served') return false;
  return true;
};

const downloadBlob = (filename, content, mime) => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const formatTime = (iso) => {
  const date = new Date(iso);
  return isNaN(date.getTime()) ? '—' : date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};

const validateBackupData = (data) => {
  if (!isPlainObject(data)) return false;
  if (data.customWhiskies !== undefined && (!Array.isArray(data.customWhiskies) || !data.customWhiskies.every(isValidWhisky))) return false;
  if (data.stock !== undefined && (!isPlainObject(data.stock) || !Object.values(data.stock).every(value => typeof value === 'boolean'))) return false;
  if (data.stockQty !== undefined && !isQuantityMap(data.stockQty)) return false;
  if (data.order !== undefined && !isQuantityMap(data.order)) return false;
  if (data.favorites !== undefined && !isStringArray(data.favorites)) return false;
  if (data.party !== undefined && (!Array.isArray(data.party) || !data.party.every(isValidGuest))) return false;
  return [data.customWhiskies, data.stock, data.stockQty, data.order, data.favorites, data.party].some(v => v !== undefined);
};

// Valeur initiale du stock V2 = migration de l'ancien statut V1 (true → 1, false → 0), sinon {}.
// Sert uniquement quand la clé V2 est absente : useLocalStorage lit whisky_v2_stock_qty s'il existe
// (inutile de le relire ici). La clé V1 n'est jamais réécrite.
const readInitialStock = () => {
  if (!isBrowser) return {};
  try {
    const legacy = window.localStorage.getItem(V1_STOCK_KEY);
    if (legacy) {
      const owned = JSON.parse(legacy);
      if (isPlainObject(owned)) {
        return Object.fromEntries(Object.entries(owned).map(([id, v]) => [id, v ? 1 : 0]));
      }
    }
  } catch (error) {
    console.warn('Migration stock V1 impossible', error);
  }
  return {};
};

// ═══════════════════════════════════════════════════════════════
// CATALOGUE DE BASE
// ═══════════════════════════════════════════════════════════════
const DEFAULT_WHISKIES = [
  { 
    id: "default-1", name: "Laphroaig 10", type: "Single Malt", 
    profile: ["tourbé", "fumé", "iodé", "maritime"], 
    region: "Islay", age: "10 ans", abv: "40%",
    peatLevel: 4.5, color: "#eecfa1", isCustom: false,
    notes: "L'une des stars d'Islay avec ses 43 ppm de tourbe. Profil médicinal et marin unique.",
    tasting: {
      nose: "Profil très marin, fruits frais, notes camphrées, suie de cheminée",
      palate: "Tourbe assurée, fruits frais, cendres chaudes, goudron, épices légères",
      finish: "Moyennement longue, cendres chaudes, fruits frais, embruns"
    },
    pairings: ["Huîtres", "Saumon fumé", "Roquefort"],
    mood: ["intense", "aventure", "maritime", "apéritif"]
  },
  { 
    id: "default-2", name: "Tomatin 12", type: "Single Malt", 
    profile: ["fruité", "doux", "sherry", "équilibré"], 
    region: "Highlands", age: "12 ans", abv: "43%",
    peatLevel: 0.5, color: "#e28936", isCustom: false,
    notes: "Équilibré et sucré. Vieillissement en ex-bourbon et fûts de sherry espagnols.",
    tasting: {
      nose: "Bruyère sauvage, pin, crème caramel, pommes, poires, mangue",
      palate: "Sherry visible, fruits rouges, réglisse, amandes, vanille bourbon",
      finish: "Fruits, noix de coco, poire, vanille"
    },
    pairings: ["Tarte aux fruits", "Chocolat noir", "Digestif"],
    mood: ["gourmand", "digestif", "calme"]
  },
  { 
    id: "default-3", name: "Powers Gold Label", type: "Irish Whiskey", 
    profile: ["fruité", "épicé", "doux", "miel"], 
    region: "Dublin/Midleton", age: "NAS", abv: "40%",
    peatLevel: 0, color: "#f3c246", isCustom: false,
    notes: "Fruité et épicé. Première marque d'Irish whiskey embouteillée (1886).",
    tasting: {
      nose: "Miel, caramel, vanille, cannelle, pain de seigle",
      palate: "Melon et miel, vanille, caramel, sucre roux, noix de muscade",
      finish: "Longueur moyenne, épices de cuisson, caramel"
    },
    pairings: ["Cocktails", "Bière", "Charcuterie"],
    mood: ["convivial", "apéritif", "accessible", "cocktail"]
  },
  { 
    id: "default-4", name: "Glenmorangie Triple Cask", type: "Single Malt", 
    profile: ["épicé", "fruité", "boisé", "doux"], 
    region: "Highlands", age: "NAS", abv: "40%",
    peatLevel: 0, color: "#f0d588", isCustom: false,
    notes: "Notes épicées et fruitées. Vieilli en ex-bourbon, chêne neuf toasté et ex-rye.",
    tasting: {
      nose: "Prunes, poires mûres, chocolat cerise, café, cannelle sucrée",
      palate: "Pommes rouges, cerises, caramel noir, bois aromatique, poivre",
      finish: "Sucrée, finissant légèrement sec avec miel et foin"
    },
    pairings: ["Viandes grillées", "Chocolat noir", "Fromages à pâte dure"],
    mood: ["découverte", "épicé", "dégustation"]
  },
  { 
    id: "default-5", name: "Glenmorangie Lasanta 12", type: "Single Malt", 
    profile: ["sherry", "doux", "riche", "épicé"], 
    region: "Highlands", age: "12 ans", abv: "43%",
    peatLevel: 0, color: "#bf6324", isCustom: false,
    notes: "Influence de sherry, doux et riche. Finition Oloroso et Pedro Ximénez.",
    tasting: {
      nose: "Épices chaudes, chocolat raisins secs, nid d'abeille, toffee",
      palate: "Sherry sucré, sultanes, orange, noix, butterscotch",
      finish: "Longue, orange épicée, noisettes enrobées de chocolat"
    },
    pairings: ["Foie gras", "Desserts au chocolat", "Noix"],
    mood: ["gourmand", "digestif", "hiver", "cosy"]
  },
  { 
    id: "default-6", name: "Aerstone Land Cask 10", type: "Single Malt", 
    profile: ["fumé", "tourbé", "salin", "terreux"], 
    region: "Lowlands", age: "10 ans", abv: "40%",
    peatLevel: 3.5, color: "#e8b923", isCustom: false,
    notes: "Fumé et tourbé. Vieillissement en entrepôts côtiers.",
    tasting: {
      nose: "Fumée avec notes sucrées, charbon, fruits d'agrumes",
      palate: "Tourbe sucrée, algues marines, fumée brûlante, notes terreuses",
      finish: "Médicinal et salé, amertume, fudge crémeux sucré"
    },
    pairings: ["Poissons fumés", "Barbecue", "Plats épicés"],
    mood: ["fumé", "aventure", "soirée"]
  },
  { 
    id: "default-7", name: "Thor Boyo", type: "French Whisky", 
    profile: ["épicé", "fruité", "jeune"], 
    region: "Normandie", age: "3 ans", abv: "42%",
    peatLevel: 1.5, color: "#f6e6b0", isCustom: false,
    notes: "Whisky fermier normand. Jeune mais expressif, particularité française.",
    tasting: {
      nose: "Fruité, notes épicées marquées",
      palate: "Bois léger, nombreuses épices, beaucoup de fruits (pêche)",
      finish: "Jeune, vive et expressive"
    },
    pairings: ["Camembert", "Tarte aux pommes", "Charcuterie"],
    mood: ["découverte", "curiosité", "régional", "apéritif"]
  },
  { 
    id: "default-8", name: "Bushmills Original", type: "Irish Whiskey", 
    profile: ["fruité", "léger", "accessible", "doux"], 
    region: "Irlande du Nord", age: "NAS", abv: "40%",
    peatLevel: 0, color: "#f4d984", isCustom: false,
    notes: "Fruité, léger. Triple distillée. Heritage 1608.",
    tasting: {
      nose: "Pomme verte, citron, vanille légère, arômes de grain",
      palate: "Pomme verte dominante, vanille, caramel, épices",
      finish: "Crisp et fraîche, note épicée légère"
    },
    pairings: ["Irish Coffee", "Cocktails", "Saumon"],
    mood: ["apéritif", "cocktail", "été", "facile"]
  },
  { 
    id: "default-9", name: "Glenfarclas 12", type: "Single Malt", 
    profile: ["sherry", "équilibré", "fruité", "épicé"], 
    region: "Speyside", age: "12 ans", abv: "43%",
    peatLevel: 0.5, color: "#d9812f", isCustom: false,
    notes: "Influence de sherry, équilibré. Le style Speyside traditionnel.",
    tasting: {
      nose: "Fruits sherry frais, douceur épicée, chêne savonneux",
      palate: "Corsée, fruits sherry, chêne, trace de tourbe",
      finish: "Longue et riche, épices persistantes"
    },
    pairings: ["Gibier", "Fromages affinés", "Desserts aux fruits"],
    mood: ["tradition", "digestif", "hiver", "cosy"]
  },
  { 
    id: "default-10", name: "Knockando 12", type: "Single Malt", 
    profile: ["léger", "fruité", "doux", "noisette"], 
    region: "Speyside", age: "12 ans", abv: "43%",
    peatLevel: 0, color: "#eddca2", isCustom: false,
    notes: "Léger et fruité. Vieillissement fûts de bourbon anciens.",
    tasting: {
      nose: "Amande douce et noisette",
      palate: "Équilibré, léger, fruité, chocolat au lait, brioche",
      finish: "Crémeuse avec note de toffee"
    },
    pairings: ["Apéritif léger", "Sushi", "Fruits frais"],
    mood: ["apéritif", "léger", "débutant", "été"]
  },
  { 
    id: "default-11", name: "Compass Box Peat Monster", type: "Blended Malt", 
    profile: ["tourbé", "fumé", "maritime", "cendré"], 
    region: "Islay/Speyside", age: "10-16 ans", abv: "46%",
    peatLevel: 4, color: "#e8c97d", isCustom: false,
    notes: "Extrêmement tourbé et fumé. 99% Islay (Caol Ila, Laphroaig).",
    tasting: {
      nose: "Tourbe élégante, cendres chaudes, notes maritimes, citron confit",
      palate: "Cendres, sel marin, iodé, camphré, fruits frais, vanille",
      finish: "Longue, épices, fruits frais, cendres"
    },
    pairings: ["Fromage bleu", "Haddock fumé", "Chocolat salé"],
    mood: ["intense", "tourbé", "aventure", "soirée"]
  },
  { 
    id: "default-12", name: "Monkey Shoulder", type: "Blended Malt", 
    profile: ["doux", "rond", "vanille", "malté"], 
    region: "Speyside", age: "NAS", abv: "40%",
    peatLevel: 0, color: "#cca045", isCustom: false,
    notes: "Doux, lisse, moderne. Assemblage de 3 Speysides.",
    tasting: {
      nose: "Miel, ananas trop mûr, vanille, cacao, orange zestée",
      palate: "Maltée, biscuitée, vanille crémeuse, marmelade, épices",
      finish: "Biscuit malt, épices, agrumes frais"
    },
    pairings: ["Cocktails", "Old Fashioned", "Desserts vanille"],
    mood: ["cocktail", "soirée", "polyvalent", "décontracté"]
  },
  { 
    id: "default-13", name: "Jack Daniel's Old No. 7", type: "Tennessee Whiskey", 
    profile: ["caramel", "vanille", "doux", "maïs"], 
    region: "Tennessee", age: "NAS", abv: "40%",
    peatLevel: 0, color: "#a0502a", isCustom: false,
    notes: "Lisse et mellow. Filtration charbon d'érable. Icône US.",
    tasting: {
      nose: "Fumée légère, banane, vanille, chêne toasté",
      palate: "Maïs sucré, caramel, sirop d'érable, noix toastées",
      finish: "Chaude, notes de chêne, vanille"
    },
    pairings: ["Barbecue", "Ribs", "Burger", "Cola"],
    mood: ["barbecue", "américain", "cocktail", "décontracté"]
  },
  { 
    id: "default-14", name: "Compass Box Spice Tree", type: "Blended Malt", 
    profile: ["épicé", "boisé", "riche", "vanille"], 
    region: "Highlands", age: "NAS", abv: "46%",
    peatLevel: 0, color: "#b07332", isCustom: false,
    notes: "Épicé, bois riche, plein. Fûts de chêne français toastés.",
    tasting: {
      nose: "Audacieux, chêne chaud, épices, fruit rouge séché, miel",
      palate: "Corsée, texture veloutée, figues, clou de girofle, poivre noir",
      finish: "Longue, riche, chocolat noir, vanille, chaleur"
    },
    pairings: ["Plats en sauce", "Fromages forts", "Cigare"],
    mood: ["hiver", "épicé", "complexe", "dégustation"]
  }
];

// Illustrations non officielles (sans marque lisible) des bouteilles par défaut → public/bottles/.
// Appliqué en dérivation dans allWhiskies (les bouteilles ajoutées manuellement n'ont pas d'image → fallback propre).
const BOTTLE_IMAGE_BY_ID = {
  'default-1': 'bottles/laphroaig-10.webp',
  'default-2': 'bottles/tomatin-12.webp',
  'default-3': 'bottles/powers-gold-label.webp',
  'default-4': 'bottles/glenmorangie-triple-cask.webp',
  'default-5': 'bottles/glenmorangie-lasanta-12.webp',
  'default-6': 'bottles/aerstone-land-cask-10.webp',
  'default-7': 'bottles/thor-boyo.webp',
  'default-8': 'bottles/bushmills-original.webp',
  'default-9': 'bottles/glenfarclas-12.webp',
  'default-10': 'bottles/knockando-12.webp',
  'default-11': 'bottles/compass-box-peat-monster.webp',
  'default-12': 'bottles/monkey-shoulder.webp',
  'default-13': 'bottles/jack-daniels-old-no-7.webp',
  'default-14': 'bottles/compass-box-spice-tree.webp',
};

// Icônes Lucide (monochromes) plutôt que des emoji multicolores dépendants de l'OS,
// pour un rendu premium et cohérent avec la navigation. Certains arômes sont des approximations
// (Lucide n'a pas d'icône « sherry » ou « miel » dédiée).
const TASTE_PROFILES = [
  { id: "fumé", label: "Fumé", Icon: Flame },
  { id: "tourbé", label: "Tourbé", Icon: Mountain },
  { id: "doux", label: "Doux", Icon: Candy },
  { id: "épicé", label: "Épicé", Icon: Zap },
  { id: "fruité", label: "Fruité", Icon: Apple },
  { id: "vanille", label: "Vanille", Icon: IceCream },
  { id: "sherry", label: "Sherry", Icon: Wine },
  { id: "boisé", label: "Boisé", Icon: TreePine },
  { id: "miel", label: "Miel", Icon: Hexagon },
  { id: "maritime", label: "Maritime", Icon: Waves },
  { id: "floral", label: "Floral", Icon: Flower2 },
  { id: "chocolat", label: "Chocolat", Icon: Cookie },
];

const MOODS = [
  { id: "apéritif", label: "Apéritif", Icon: GlassWater },
  { id: "digestif", label: "Digestif", Icon: Moon },
  { id: "décontracté", label: "Décontracté", Icon: Armchair },
  { id: "intense", label: "Intense", Icon: Zap },
  { id: "cosy", label: "Cosy", Icon: Flame },
  { id: "gourmand", label: "Gourmand", Icon: Cake },
  { id: "découverte", label: "Découverte", Icon: Compass },
  { id: "convivial", label: "Convivial", Icon: Users },
  { id: "cocktail", label: "Cocktail", Icon: Martini },
  { id: "barbecue", label: "Barbecue", Icon: Beef },
  { id: "aventure", label: "Aventure", Icon: Mountain }
];

const WHISKY_TYPES = [
  "Single Malt", "Blended Malt", "Blended Scotch", "Irish Whiskey", 
  "Bourbon", "Tennessee Whiskey", "Rye", "Japanese Whisky", "French Whisky", "Autre"
];

const REGIONS = [
  "Islay", "Speyside", "Highlands", "Lowlands", "Campbeltown", "Islands",
  "Irlande", "Irlande du Nord", "Kentucky", "Tennessee", "Japon", "France", "Autre"
];

// ═══════════════════════════════════════════════════════════════
// UI COMPONENTS
// ═══════════════════════════════════════════════════════════════

const ToastContainer = ({ toasts, removeToast }) => (
  <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 w-full max-w-[90vw] sm:max-w-sm pointer-events-none items-end pr-4 sm:pr-0" aria-live="polite" aria-atomic="true">
    {toasts.map(toast => (
      <div 
        key={toast.id} 
        role={toast.type === 'error' ? 'alert' : 'status'}
        className={`pointer-events-auto px-6 py-4 rounded-md shadow-2xl flex items-center gap-4 transition-all duration-500 animate-slideIn w-full border ${
          toast.type === 'error' 
            ? 'bg-red-950 text-red-100 border-red-500' 
            : 'bg-stone-900 text-amber-50 border-amber-500'
        }`}
      >
        {toast.type === 'error' ? <AlertCircle size={20} className="shrink-0 text-red-400" aria-hidden="true" /> : <CheckCircle2 size={20} className="shrink-0 text-amber-400" aria-hidden="true" />}
        <span className="font-serif tracking-wide text-sm flex-1">{toast.message}</span>
        <button type="button" onClick={() => removeToast(toast.id)} className="opacity-80 hover:opacity-100 p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center hover:bg-white/10 rounded transition-colors" aria-label="Fermer la notification">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    ))}
  </div>
);

const PeatScale = ({ level }) => {
  const numLevel = Number(level);
  if (isNaN(numLevel) || numLevel <= 0) return null;

  return (
    <div className="flex flex-col items-center gap-1 group" role="img" title={`Tourbe: ${numLevel}/5`} aria-label={`Tourbe ${numLevel} sur 5`}>
      <div className="flex gap-0.5" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((step) => (
          <div key={step} className={`h-1.5 w-3 rounded-full transition-all duration-300 ${
            numLevel >= step ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 'bg-stone-600'
          }`} />
        ))}
      </div>
      <span className="text-[9px] uppercase tracking-widest text-stone-300 font-bold group-hover:text-amber-500 transition-colors">Tourbe</span>
    </div>
  );
};

const ColorBadge = ({ color }) => (
  <div className="relative w-5 h-5 group" role="img" aria-label="Robe du whisky">
    <div className="absolute inset-0 rounded-full blur-[2px] opacity-50 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: color || 'var(--whisky-gold)' }}></div>
    <div className="relative w-5 h-5 rounded-full border border-stone-500 shadow-inner shrink-0" style={{ backgroundColor: color || 'var(--whisky-gold)' }} title="Robe" />
  </div>
);

const SearchInput = ({ value, onChange, onClear, label = "Rechercher une bouteille", fullWidth = false }) => {
  const inputRef = useRef(null);
  const inputId = useId();
  return (
    <div className={`relative group ${fullWidth ? 'w-full' : 'w-full sm:w-auto'}`}>
      <label htmlFor={inputId} className="sr-only">{label}</label>
      <input
        id={inputId}
        ref={inputRef}
        type="text"
        placeholder={`${label}...`}
        value={value}
        onChange={onChange}
        className={`bg-stone-900/80 border border-stone-600 text-amber-50 min-h-[48px] py-3 pl-10 pr-12 rounded text-sm focus-visible:outline-none focus-visible:border-amber-500 focus-visible:ring-2 focus-visible:ring-amber-500/40 transition-all placeholder:text-stone-300 font-serif ${fullWidth ? 'w-full' : 'w-full sm:w-64'}`}
      />
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-300 group-focus-within:text-amber-500 transition-colors" aria-hidden="true" />
      {value && (
        <button type="button" onClick={() => { onClear(); inputRef.current?.focus(); }} className="absolute right-0 top-1/2 -translate-y-1/2 p-2 min-h-[44px] min-w-[44px] rounded hover:bg-stone-800 text-stone-300" aria-label="Effacer la recherche">
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
};

const FilterButton = React.memo(({ active, onClick, Icon, label, className = '' }) => (
  <button
    type="button"
    aria-pressed={active}
    aria-label={`${active ? 'Retirer' : 'Ajouter'} le filtre ${label}`}
    onClick={onClick}
    className={`flex flex-col items-center gap-3 p-5 rounded-sm transition-all duration-300 border group relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--whisky-bg)] ${className}
      ${active
        ? 'bg-stone-900 border-amber-500 text-amber-300 shadow-[0_4px_20px_-8px_rgba(245,158,11,0.55)]'
        : 'bg-stone-900/40 border-stone-600/60 hover:bg-stone-800/50 hover:border-stone-500'
      }`}
  >
    {Icon && (
      <Icon
        size={26}
        strokeWidth={1.5}
        className={`transition-all duration-300 ${active ? 'text-amber-400 scale-110 drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]' : 'text-stone-300 group-hover:text-amber-200'}`}
        aria-hidden="true"
      />
    )}
    <span className={`text-[11px] uppercase tracking-[0.2em] font-medium transition-colors ${active ? 'text-amber-300 font-bold' : 'text-stone-200 group-hover:text-white'}`}>
      {label}
    </span>
    {active && <div className="absolute inset-0 border border-amber-500/20 rounded-sm pointer-events-none" aria-hidden="true" />}
  </button>
));

const Modal = ({ isOpen, onClose, title, children, wide = false }) => {
  const titleId = useId();
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!isOpen || !isBrowser) return undefined;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => {
      const focusable = getFocusableElements(dialogRef.current);
      (focusable[0] || dialogRef.current)?.focus();
    });

    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, [isOpen]);

  const handleKeyDown = useCallback((event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = getFocusableElements(dialogRef.current);
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, [onClose]);

  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4 animate-fadeIn" onClick={onClose}>
      <div 
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={`bg-[var(--whisky-surface)] border border-amber-700/60 p-6 md:p-10 max-h-[90vh] overflow-auto rounded shadow-2xl ${wide ? 'max-w-3xl' : 'max-w-lg'} w-full relative custom-scrollbar focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500`}
        onClick={e => e.stopPropagation()}
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-amber-700 opacity-70" aria-hidden="true"></div>
        <button type="button" onClick={onClose} className="absolute top-4 right-4 text-stone-300 hover:text-amber-400 transition-colors p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center" aria-label="Fermer la fenêtre">
          <X size={24} strokeWidth={1.5} aria-hidden="true" />
        </button>
        {title && <h2 id={titleId} className="text-3xl text-amber-300 font-light mb-8 font-serif tracking-wide text-center pr-10">{title}</h2>}
        {children}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// ÉCRAN "SERVIR CE WHISKY" (Mode Dégustation)
// ═══════════════════════════════════════════════════════════════
const ServingScreen = ({ whisky, onClose }) => {
  const titleId = useId();
  const screenRef = useRef(null);

  useEffect(() => {
    if (!whisky || !isBrowser) return undefined;
    const previousFocus = document.activeElement;
    window.requestAnimationFrame(() => screenRef.current?.focus());
    return () => previousFocus?.focus?.();
  }, [whisky]);

  const handleKeyDown = useCallback((event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  }, [onClose]);

  if (!whisky) return null;

  return (
    <div
      ref={screenRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-50 bg-[var(--whisky-bg)] flex flex-col items-center overflow-auto animate-fadeIn custom-scrollbar focus-visible:outline-none"
    >
      {/* Background Ambience */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[50vw] h-[45vh] bg-amber-600/5 blur-[80px] rounded-full pointer-events-none" aria-hidden="true" />
      
      <button 
        type="button"
        onClick={onClose} 
        className="fixed top-4 left-4 sm:top-8 sm:left-8 z-20 flex items-center gap-3 px-5 py-2.5 min-h-[44px] border border-stone-600 text-stone-300 hover:text-amber-400 hover:border-amber-700 bg-black/80 rounded-full text-xs font-bold uppercase tracking-widest transition-all"
      >
        <ArrowLeft size={14} aria-hidden="true" /> Retour au bar
      </button>

      <div className="relative z-10 max-w-4xl w-full text-center px-6 py-20 md:py-28">
        <div className="mb-12 relative inline-block">
          <div className="absolute inset-0 bg-amber-500/20 blur-xl rounded-full" aria-hidden="true"></div>
          <GlassWater size={80} className="relative text-amber-400 drop-shadow-[0_0_15px_rgba(245,158,11,0.25)]" strokeWidth={0.5} aria-hidden="true" />
        </div>

        <div className="inline-flex items-center gap-2 px-4 py-1 border-b border-amber-600/70 text-amber-400 text-[10px] font-bold tracking-[0.3em] uppercase mb-12">
           Dégustation en cours
        </div>

        <h1 id={titleId} className="text-5xl md:text-7xl font-thin text-[var(--whisky-cream)] tracking-normal mb-8 drop-shadow-2xl font-serif break-words">
          {whisky.name}
        </h1>

        <div className="flex flex-wrap justify-center gap-6 mb-16 items-center">
          <ColorBadge color={whisky.color} />
          <div className="h-1 w-1 bg-stone-500 rounded-full" aria-hidden="true"></div>
          <span className="text-amber-400 font-serif text-xl italic">{whisky.type}</span>
          <div className="h-1 w-1 bg-stone-500 rounded-full" aria-hidden="true"></div>
          <span className="text-stone-300 font-serif text-xl">{whisky.region}</span>
          <div className="h-1 w-1 bg-stone-500 rounded-full" aria-hidden="true"></div>
          <span className="text-stone-300 font-bold tracking-wider">{whisky.abv}</span>
        </div>

        <div className="max-w-2xl mx-auto mb-20 relative">
          <span className="absolute -top-6 -left-4 text-6xl text-amber-800/30 font-serif" aria-hidden="true">"</span>
          <p className="text-[var(--whisky-note)] text-2xl md:text-3xl font-light italic leading-relaxed font-serif">
            {whisky.notes || 'Un whisky à découvrir...'}
          </p>
          <span className="absolute -bottom-10 -right-4 text-6xl text-amber-800/30 font-serif" aria-hidden="true">"</span>
        </div>

        {whisky.tasting && (whisky.tasting.nose || whisky.tasting.palate || whisky.tasting.finish) && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border-t border-b border-stone-700 bg-stone-900/20 divide-y md:divide-y-0 md:divide-x divide-stone-700 mb-20">
            <div className="p-8 group hover:bg-stone-900/40 transition-colors">
              <h4 className="text-amber-500 text-[10px] tracking-[0.3em] mb-4 font-bold uppercase group-hover:text-amber-400 transition-colors">Nez</h4>
              <p className="text-[var(--whisky-muted-gold)] leading-loose font-serif text-lg">{whisky.tasting?.nose || "—"}</p>
            </div>
            <div className="p-8 group hover:bg-stone-900/40 transition-colors">
              <h4 className="text-amber-500 text-[10px] tracking-[0.3em] mb-4 font-bold uppercase group-hover:text-amber-400 transition-colors">Bouche</h4>
              <p className="text-[var(--whisky-muted-gold)] leading-loose font-serif text-lg">{whisky.tasting?.palate || "—"}</p>
            </div>
            <div className="p-8 group hover:bg-stone-900/40 transition-colors">
              <h4 className="text-amber-500 text-[10px] tracking-[0.3em] mb-4 font-bold uppercase group-hover:text-amber-400 transition-colors">Finale</h4>
              <p className="text-[var(--whisky-muted-gold)] leading-loose font-serif text-lg">{whisky.tasting?.finish || "—"}</p>
            </div>
          </div>
        )}

        {whisky.pairings && whisky.pairings.length > 0 && (
          <div className="mb-20">
            <h4 className="text-stone-300 text-[10px] tracking-[0.3em] mb-6 font-bold uppercase">Accords Parfaits</h4>
            <div className="flex flex-wrap justify-center gap-4">
              {whisky.pairings.map((p, i) => (
                <span key={i} className="text-[var(--whisky-gold)] text-sm px-6 py-2 border border-amber-900/30 rounded-full font-serif italic bg-amber-950/10">{p}</span>
              ))}
            </div>
          </div>
        )}

        <div className="text-stone-300 text-xs tracking-widest uppercase">
          Sláinte • Kanpai • Santé
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// MODE INVITÉ (KIOSQUE SOIRÉE)
// ═══════════════════════════════════════════════════════════════
const GuestKiosk = ({ whiskies, guests, onChoose, onExit }) => {
  const [step, setStep] = useState('name');
  const [guestName, setGuestName] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, DEBOUNCE_DELAY);
  const [selectedTags, setSelectedTags] = useState([]);
  const [showAllFilters, setShowAllFilters] = useState(false);
  const isTagActive = (type, id) => selectedTags.some(t => t.type === type && t.id === id);
  const toggleTag = (type, id) => setSelectedTags(prev => (
    prev.some(t => t.type === type && t.id === id)
      ? prev.filter(t => !(t.type === type && t.id === id))
      : [...prev, { type, id }]
  ));
  const [lastChoice, setLastChoice] = useState(null);
  const screenRef = useRef(null);
  const nameId = useId();

  useEffect(() => {
    if (!isBrowser) return undefined;
    const previousFocus = document.activeElement;
    window.requestAnimationFrame(() => {
      const input = screenRef.current?.querySelector('input');
      (input || screenRef.current)?.focus();
    });
    return () => previousFocus?.focus?.();
  }, []);

  useEffect(() => {
    if (step !== 'done') return undefined;
    const timeout = setTimeout(() => {
      setStep('name');
      setGuestName('');
      setSearch('');
    }, KIOSK_DONE_TIMEOUT);
    return () => clearTimeout(timeout);
  }, [step]);

  // Piège de focus + Échap : le kiosque est un vrai modal, on ne doit pas pouvoir
  // tabuler vers l'app barman derrière (celle-ci est aussi passée en `inert`).
  const handleKeyDown = useCallback((event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onExit();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = getFocusableElements(screenRef.current);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, [onExit]);

  const currentGuest = useMemo(() => {
    const norm = normalizeText(guestName.trim());
    return norm ? guests.find(g => normalizeText(g.name) === norm) : null;
  }, [guestName, guests]);

  const currentChoiceName = currentGuest
    ? (whiskies.find(w => w.id === currentGuest.whiskyId)?.name || null)
    : null;

  // Filtres invité : les ambiances les plus présentes dans la cave (grand public) + quelques arômes clés,
  // dérivés du stock. Chaque filtre porte son type pour savoir dans quel champ chercher.
  // Filtres invité groupés par catégorie, triés par fréquence dans la cave.
  // Restreints au référentiel curé (les bouteilles peuvent porter des tags libres
  // type « soirée »/« hiver » qu'on n'expose pas aux invités).
  const FEATURED_COUNT = 4;
  const kioskFilterGroups = useMemo(() => {
    const build = (key, catalogue) => {
      const known = new Set(catalogue.map(c => c.id));
      const freq = new Map();
      whiskies.forEach(w => (w[key] || []).forEach(v => { if (known.has(v)) freq.set(v, (freq.get(v) || 0) + 1); }));
      return [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => catalogue.find(c => c.id === id));
    };
    return { moods: build('mood', MOODS), profiles: build('profile', TASTE_PROFILES) };
  }, [whiskies]);

  const hasHiddenFilters = kioskFilterGroups.moods.length > FEATURED_COUNT || kioskFilterGroups.profiles.length > FEATURED_COUNT;

  const filteredWhiskies = useMemo(() => {
    const q = normalizeText(debouncedSearch);
    const bySearch = whiskies.filter(w => !q
      || normalizeText(w.name).includes(q) || normalizeText(w.type).includes(q) || normalizeText(w.region).includes(q));
    if (selectedTags.length === 0) return bySearch;
    // Même moteur de score que le Sommelier (scoreWhisky) : une bouteille apparaît si elle
    // matche AU MOINS un filtre, classée par pertinence (jamais de résultat vide, pas de ET strict).
    const selProfiles = selectedTags.filter(t => t.type === 'profile').map(t => t.id);
    const selMoods = selectedTags.filter(t => t.type === 'mood').map(t => t.id);
    return bySearch
      .map(w => ({ w, score: scoreWhisky(w, selProfiles, selMoods, { favoriteBonus: true }).score }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(x => x.w);
  }, [whiskies, debouncedSearch, selectedTags]);

  const handleNameSubmit = (e) => {
    e.preventDefault();
    if (guestName.trim()) setStep('choose');
  };

  const handlePick = (whisky) => {
    onChoose(guestName.trim(), whisky.id);
    setLastChoice({ name: guestName.trim(), whisky: whisky.name, imageSrc: whisky.imageSrc });
    setStep('done');
  };

  const handleSurprise = () => {
    const pool = filteredWhiskies.length > 0 ? filteredWhiskies : whiskies;
    if (pool.length === 0) return;
    handlePick(pool[Math.floor(randomUnit() * pool.length)]);
  };

  const resetToName = () => {
    setStep('name');
    setGuestName('');
    setSearch('');
    setSelectedTags([]);
    setShowAllFilters(false);
  };

  return (
    <div
      ref={screenRef}
      role="dialog"
      aria-modal="true"
      aria-label="Le Bar Clandestin — choix des invités"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-50 bg-[var(--whisky-bg)] overflow-auto custom-scrollbar focus-visible:outline-none"
    >
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[50vw] h-[45vh] bg-amber-600/5 blur-[80px] rounded-full pointer-events-none" aria-hidden="true" />

      <button
        type="button"
        onClick={onExit}
        className="fixed top-4 right-4 z-[60] p-2 min-h-[48px] min-w-[48px] inline-flex items-center justify-center rounded-full border border-stone-600 bg-black/70 text-stone-200 hover:text-amber-300 hover:border-amber-500 shadow-lg transition-colors"
        aria-label="Fermer le mode invité et revenir au barman"
        title="Fermer (barman)"
      >
        <X size={22} aria-hidden="true" />
      </button>

      <div className="relative z-10 max-w-3xl mx-auto px-6 py-14 md:py-20 text-center min-h-screen flex flex-col animate-fadeIn">
        <div className="flex-1">
          <img src="logo.jpg" alt="" width="512" height="512" className="w-20 h-20 mx-auto rounded-[22%] border border-amber-800/40 shadow-2xl mb-6" aria-hidden="true" />

          {step === 'name' && (
            <div className="animate-fadeIn">
              <h1 className="text-4xl md:text-5xl font-thin text-[var(--whisky-gold)] font-serif mb-3">Bienvenue au Bar Clandestin</h1>
              <p className="text-stone-300 text-sm uppercase tracking-[0.2em] mb-10">Dis-moi qui tu es, je te sers</p>

              <form onSubmit={handleNameSubmit} className="max-w-sm mx-auto mb-10">
                <label htmlFor={nameId} className="sr-only">Ton prénom</label>
                <input
                  id={nameId}
                  type="text"
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  placeholder="Ton prénom..."
                  maxLength={40}
                  autoComplete="off"
                  autoFocus
                  enterKeyHint="go"
                  className="w-full px-6 py-4 bg-stone-900/80 border border-stone-600 text-amber-50 text-xl text-center font-serif rounded focus-visible:outline-none focus-visible:border-amber-500 focus-visible:ring-2 focus-visible:ring-amber-500/40 placeholder:text-stone-400 mb-4"
                />
                <button
                  type="submit"
                  disabled={!guestName.trim()}
                  className="w-full py-4 min-h-[48px] bg-amber-500 text-black font-bold rounded hover:bg-amber-400 transition-colors uppercase text-sm tracking-widest disabled:opacity-40 disabled:pointer-events-none"
                >
                  Choisir mon whisky
                </button>
              </form>

              {guests.length > 0 && (
                <div className="max-w-lg mx-auto">
                  <p className="text-stone-300 text-[11px] uppercase tracking-[0.25em] font-bold mb-4">Déjà passés au bar</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {guests.map(g => {
                      const choiceName = whiskies.find(w => w.id === g.whiskyId)?.name;
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => { setGuestName(g.name); setStep('choose'); }}
                          className="px-5 py-2.5 min-h-[52px] rounded-2xl border border-stone-600 hover:border-amber-500 transition-colors text-left"
                        >
                          <span className="block font-serif text-base text-stone-100">{g.name}</span>
                          {choiceName && <span className="block text-[11px] text-amber-300/90">{choiceName}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 'choose' && (
            <div className="animate-fadeIn text-left">
              <div className="flex justify-center mb-8">
                <button
                  type="button"
                  onClick={resetToName}
                  className="inline-flex items-center gap-2 px-6 py-3 min-h-[48px] border border-stone-600 rounded-full text-stone-200 hover:text-amber-300 hover:border-amber-500 text-xs font-bold uppercase tracking-widest transition-colors"
                >
                  <ArrowLeft size={16} aria-hidden="true" /> Changer de prénom
                </button>
              </div>

              <div className="text-center mb-8">
                <h1 className="text-3xl md:text-4xl font-thin text-[var(--whisky-cream)] font-serif mb-2">
                  Pour <span className="text-[var(--whisky-gold)]">{guestName.trim()}</span>
                </h1>
                {currentChoiceName ? (
                  <p className="text-amber-300/90 text-sm font-serif italic">Ton choix actuel : {currentChoiceName} — tape une carte pour en changer.</p>
                ) : (
                  <p className="text-stone-300 text-sm uppercase tracking-[0.2em]">Choisis une ou plusieurs envies, ou pioche direct une bouteille</p>
                )}
              </div>

              {(kioskFilterGroups.moods.length > 0 || kioskFilterGroups.profiles.length > 0) && (() => {
                // Gabarit uniforme : largeur fixe pour aligner les puces d'une même catégorie.
                const chipBase = (isActive, extra = '') => `inline-flex items-center justify-center gap-2 px-4 py-3 min-h-[52px] rounded-full text-sm font-bold border transition-colors ${extra} ${isActive ? 'bg-amber-500 border-amber-500 text-black' : 'border-stone-500 text-stone-200 hover:border-amber-500'}`;
                const renderGroup = (label, items, type) => {
                  if (items.length === 0) return null;
                  let shown = showAllFilters ? items : items.slice(0, FEATURED_COUNT);
                  // Garder les puces actives visibles même repliées (sinon filtre appliqué mais invisible).
                  if (!showAllFilters) {
                    items.forEach(i => { if (isTagActive(type, i.id) && !shown.includes(i)) shown = [...shown, i]; });
                  }
                  return (
                    <div>
                      <p className="text-stone-300 text-[11px] uppercase tracking-[0.25em] font-bold mb-3">{label}</p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {shown.map(f => {
                          const active = isTagActive(type, f.id);
                          return (
                            <button
                              key={f.id}
                              type="button"
                              aria-pressed={active}
                              onClick={() => toggleTag(type, f.id)}
                              className={chipBase(active, 'w-[calc(50%-0.25rem)] sm:w-40')}
                            >
                              <f.Icon size={16} strokeWidth={1.5} aria-hidden="true" /> {f.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                };
                const hasFilters = selectedTags.length > 0;
                return (
                  <div className="mb-6 max-w-3xl mx-auto space-y-5">
                    <div className="flex justify-center">
                      {hasFilters ? (
                        <button
                          type="button"
                          onClick={() => setSelectedTags([])}
                          aria-label="Effacer les envies sélectionnées"
                          className="inline-flex items-center justify-center gap-2 px-6 py-3 min-h-[52px] rounded-full text-sm font-bold border border-amber-600 text-amber-300 hover:bg-amber-950/40 transition-colors"
                        >
                          <X size={16} strokeWidth={2} aria-hidden="true" /> Effacer les envies ({selectedTags.length})
                        </button>
                      ) : (
                        <span
                          role="status"
                          className="inline-flex items-center justify-center gap-2 px-6 py-3 min-h-[52px] rounded-full text-sm font-bold border border-amber-500 bg-amber-500 text-black"
                        >
                          <GlassWater size={16} strokeWidth={1.5} aria-hidden="true" /> Toutes les bouteilles
                        </span>
                      )}
                    </div>
                    {renderGroup('Ambiance', kioskFilterGroups.moods, 'mood')}
                    {renderGroup('Arôme', kioskFilterGroups.profiles, 'profile')}
                    {hasHiddenFilters && (
                      <div className="flex justify-center">
                        <button
                          type="button"
                          onClick={() => setShowAllFilters(v => !v)}
                          aria-expanded={showAllFilters}
                          className="inline-flex items-center gap-2 px-4 py-2 min-h-[44px] text-stone-300 hover:text-amber-300 text-xs uppercase tracking-widest font-bold transition-colors"
                        >
                          <ChevronDown size={16} className={`transition-transform ${showAllFilters ? 'rotate-180' : ''}`} aria-hidden="true" />
                          {showAllFilters ? 'Moins de filtres' : 'Plus de filtres'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="flex flex-col sm:flex-row items-stretch justify-center gap-3 mb-8 max-w-2xl mx-auto">
                <div className="w-full sm:flex-1">
                  <SearchInput value={search} onChange={e => setSearch(e.target.value)} onClear={() => setSearch('')} label="Rechercher un whisky" fullWidth />
                </div>
                <button
                  type="button"
                  onClick={handleSurprise}
                  className="w-full sm:w-auto shrink-0 inline-flex items-center justify-center gap-3 px-8 py-3 min-h-[48px] border border-amber-400 text-amber-200 hover:text-black hover:bg-amber-500 rounded-full uppercase text-sm font-bold tracking-widest transition-colors"
                >
                  <Sparkles size={18} aria-hidden="true" /> Surprends-moi
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="list">
                {filteredWhiskies.map(w => {
                  const isCurrent = currentGuest?.whiskyId === w.id;
                  const activeProfileIds = selectedTags.filter(t => t.type === 'profile').map(t => t.id);
                  const activeMoodIds = selectedTags.filter(t => t.type === 'mood').map(t => t.id);
                  // On filtre d'abord aux tags connus, puis on remonte ceux qui matchent le filtre actif,
                  // pour que la raison du match soit toujours visible sur la carte (bug : slice avant filtre cachait le tag matché).
                  const matchedMoodChips = (w.mood || [])
                    .filter(id => activeMoodIds.includes(id))
                    .map(id => MOODS.find(m => m.id === id))
                    .filter(Boolean)
                    .map(m => ({ ...m, matched: true }));
                  const profileChips = (w.profile || [])
                    .map(pid => TASTE_PROFILES.find(t => t.id === pid))
                    .filter(Boolean)
                    .map(p => ({ ...p, matched: activeProfileIds.includes(p.id) }))
                    .sort((a, b) => (b.matched ? 1 : 0) - (a.matched ? 1 : 0));
                  const chips = [...matchedMoodChips, ...profileChips].slice(0, 3);
                  return (
                    <button
                      key={w.id}
                      type="button"
                      role="listitem"
                      onClick={() => handlePick(w)}
                      className={`text-left p-5 rounded transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 border ${
                        isCurrent
                          ? 'border-amber-500 bg-amber-950/40 shadow-[0_0_20px_-5px_rgba(245,158,11,0.3)]'
                          : 'border-stone-600/60 bg-[var(--whisky-surface)] hover:border-amber-500 hover:bg-stone-800/60'
                      }`}
                    >
                      {/* Rangée haute : nom + méta à gauche, bouteille (ou pastille de robe en fallback) en haut à droite.
                          Rangée basse : étiquettes sur TOUTE la largeur de la carte (l'image ne les comprime plus). */}
                      <div className="flex gap-4 items-start mb-3">
                        <div className="flex-1 min-w-0">
                          {isCurrent && (
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-300 mb-2">
                              <CheckCircle2 size={14} aria-hidden="true" /> Ton choix actuel
                            </span>
                          )}
                          <span className="block font-serif text-2xl text-stone-100 group-hover:text-amber-200 transition-colors mb-1">{w.name}</span>
                          <p className="text-sm text-stone-300">{w.type} • {w.region}</p>
                        </div>
                        {w.imageSrc ? (
                          <img
                            src={w.imageSrc}
                            alt=""
                            aria-hidden="true"
                            loading="lazy"
                            width="512"
                            height="768"
                            className="shrink-0 h-20 w-auto object-contain drop-shadow-[0_6px_14px_rgba(0,0,0,0.6)]"
                          />
                        ) : (
                          <ColorBadge color={w.color} />
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <span className="flex flex-wrap gap-1.5">
                          {chips.map((c, i) => (
                            <span key={i} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs ${c.matched ? 'bg-amber-500/20 border-amber-500 text-amber-100 font-bold' : 'bg-stone-800/80 border-stone-600 text-stone-200'}`}>
                              <c.Icon size={13} strokeWidth={1.5} className={c.matched ? 'text-amber-300' : 'text-amber-300/80'} aria-hidden="true" /> {c.label}
                            </span>
                          ))}
                        </span>
                        {w.peatLevel > 0 && <span className="text-xs text-amber-400 font-bold uppercase tracking-wider">Tourbe {w.peatLevel}/5</span>}
                      </div>
                    </button>
                  );
                })}
                {filteredWhiskies.length === 0 && (
                  <p className="col-span-full text-center text-stone-300 font-serif italic py-10">Aucune bouteille ne correspond.</p>
                )}
              </div>
            </div>
          )}

          {step === 'done' && lastChoice && (
            <div className="animate-fadeIn py-10" role="status">
              {lastChoice.imageSrc ? (
                <img
                  src={lastChoice.imageSrc}
                  alt=""
                  aria-hidden="true"
                  width="512"
                  height="768"
                  className="h-40 md:h-48 w-auto mx-auto mb-6 object-contain drop-shadow-[0_10px_24px_rgba(0,0,0,0.7)]"
                />
              ) : (
                <CheckCircle2 size={64} className="mx-auto text-amber-400 mb-8" strokeWidth={1} aria-hidden="true" />
              )}
              <h1 className="text-4xl md:text-5xl font-thin text-[var(--whisky-cream)] font-serif mb-4">
                C'est noté, <span className="text-[var(--whisky-gold)]">{lastChoice.name}</span> !
              </h1>
              <p className="text-2xl text-[var(--whisky-muted-gold)] font-serif italic mb-12">Ton {lastChoice.whisky} arrive.</p>
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <button
                  type="button"
                  onClick={resetToName}
                  className="px-10 py-4 min-h-[52px] bg-amber-500 text-black font-bold rounded hover:bg-amber-400 transition-colors uppercase text-sm tracking-widest"
                >
                  Invité suivant
                </button>
                <button
                  type="button"
                  onClick={() => setStep('choose')}
                  className="px-10 py-4 min-h-[52px] border border-stone-500 text-stone-200 hover:border-amber-500 hover:text-amber-300 rounded transition-colors uppercase text-sm tracking-widest"
                >
                  Changer mon choix
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="pt-10">
          <button type="button" onClick={onExit} className="text-stone-500 hover:text-stone-300 text-[10px] uppercase tracking-[0.25em] min-h-[44px] px-4 transition-colors">
            Accès barman
          </button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// FORMULAIRE AJOUT BOUTEILLE
// ═══════════════════════════════════════════════════════════════
const AddWhiskyForm = ({ onAdd, onCancel, initialWhisky = null }) => {
  const [form, setForm] = useState(() => ({
    name: initialWhisky?.name || '',
    type: initialWhisky?.type || 'Single Malt',
    region: initialWhisky?.region || 'Speyside',
    age: initialWhisky?.age || '',
    abv: initialWhisky?.abv || '40%',
    peatLevel: initialWhisky?.peatLevel ?? 0,
    color: initialWhisky?.color || '#cca045',
    notes: initialWhisky?.notes || '',
    tasting: {
      nose: initialWhisky?.tasting?.nose || '',
      palate: initialWhisky?.tasting?.palate || '',
      finish: initialWhisky?.tasting?.finish || ''
    },
    profile: initialWhisky?.profile || [],
    mood: initialWhisky?.mood || []
  }));
  const [pairingsText, setPairingsText] = useState(() => (initialWhisky?.pairings || []).join(', '));

  const toggleInList = (key, id) => setForm(p => ({
    ...p,
    [key]: p[key].includes(id) ? p[key].filter(x => x !== id) : [...p[key], id]
  }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const pairings = pairingsText.split(',').map(s => s.trim()).filter(Boolean);
    onAdd({
      ...form,
      id: initialWhisky ? initialWhisky.id : `custom-${generateId()}`,
      isCustom: true,
      pairings: pairings.length > 0 ? pairings : ['À découvrir']
    });
  };

  const inputClass = "w-full px-4 py-3 bg-stone-900/80 border border-stone-600 text-amber-50 focus-visible:outline-none focus-visible:border-amber-500 focus-visible:ring-2 focus-visible:ring-amber-500/35 rounded transition-colors placeholder:text-stone-300 font-serif";
  const labelClass = "block text-amber-400 text-xs uppercase tracking-widest mb-2 font-bold";
  const chipClass = (active) => `px-4 py-2 min-h-[44px] rounded-full text-[11px] uppercase tracking-wider font-bold border transition-all duration-300 inline-flex items-center gap-1.5 ${
    active
      ? 'bg-amber-900/30 border-amber-600 text-amber-300'
      : 'bg-transparent border-stone-600 text-stone-300 hover:border-stone-500 hover:text-stone-100'
  }`;

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div>
        <label htmlFor="whisky-name" className={labelClass}>Nom de la bouteille</label>
        <input id="whisky-name" name="name" className={inputClass} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Lagavulin 16, Nikka..." maxLength={80} autoFocus required aria-required="true" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <label htmlFor="whisky-type" className={labelClass}>Type</label>
          <select id="whisky-type" name="type" className={inputClass} value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
            {WHISKY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="whisky-region" className={labelClass}>Région</label>
          <select id="whisky-region" name="region" className={inputClass} value={form.region} onChange={e => setForm(p => ({ ...p, region: e.target.value }))}>
            {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <label htmlFor="whisky-age" className={labelClass}>Âge</label>
          <input id="whisky-age" name="age" className={inputClass} value={form.age} onChange={e => setForm(p => ({ ...p, age: e.target.value }))} placeholder="Ex: 12 ans, NAS" />
        </div>
        <div>
          <label htmlFor="whisky-abv" className={labelClass}>Degré (ABV)</label>
          <input id="whisky-abv" name="abv" className={inputClass} value={form.abv} onChange={e => setForm(p => ({ ...p, abv: e.target.value }))} placeholder="Ex: 43%" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-6 items-end">
        <div>
          <label htmlFor="whisky-peat" className={labelClass}>Niveau de tourbe: {form.peatLevel}/5</label>
          <input id="whisky-peat" name="peatLevel" type="range" min="0" max="5" step="0.5" value={form.peatLevel} onChange={e => setForm(p => ({ ...p, peatLevel: parseFloat(e.target.value) }))} className="w-full h-2 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-amber-500" />
        </div>
        <div>
          <label htmlFor="whisky-color" className={labelClass}>Robe</label>
          <input id="whisky-color" name="color" type="color" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))} className="h-11 w-16 bg-stone-900/80 border border-stone-600 rounded cursor-pointer p-1" />
        </div>
      </div>

      <fieldset>
        <legend className={labelClass}>Profil aromatique</legend>
        <div className="flex flex-wrap gap-2">
          {TASTE_PROFILES.map(p => (
            <button key={p.id} type="button" aria-pressed={form.profile.includes(p.id)} onClick={() => toggleInList('profile', p.id)} className={chipClass(form.profile.includes(p.id))}>
              <p.Icon size={14} strokeWidth={1.5} aria-hidden="true" /> {p.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className={labelClass}>Ambiances</legend>
        <div className="flex flex-wrap gap-2">
          {MOODS.map(m => (
            <button key={m.id} type="button" aria-pressed={form.mood.includes(m.id)} onClick={() => toggleInList('mood', m.id)} className={chipClass(form.mood.includes(m.id))}>
              <m.Icon size={14} strokeWidth={1.5} aria-hidden="true" /> {m.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="whisky-notes" className={labelClass}>Description (citation sur la carte)</label>
        <input id="whisky-notes" name="notes" className={inputClass} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Ex: Tourbe puissante et fruits mûrs..." />
      </div>

      <div>
        <label htmlFor="whisky-pairings" className={labelClass}>Accords (séparés par des virgules)</label>
        <input id="whisky-pairings" name="pairings" className={inputClass} value={pairingsText} onChange={e => setPairingsText(e.target.value)} placeholder="Ex: Huîtres, Chocolat noir, Roquefort" />
      </div>

      <div className="space-y-4">
        <div className={labelClass}>Notes de dégustation</div>
        <div className="grid grid-cols-1 gap-3">
          <label htmlFor="whisky-nose" className="sr-only">Nez</label>
          <input id="whisky-nose" name="nose" className={inputClass} value={form.tasting.nose} onChange={e => setForm(p => ({ ...p, tasting: { ...p.tasting, nose: e.target.value } }))} placeholder="Nez..." />
          <label htmlFor="whisky-palate" className="sr-only">Bouche</label>
          <input id="whisky-palate" name="palate" className={inputClass} value={form.tasting.palate} onChange={e => setForm(p => ({ ...p, tasting: { ...p.tasting, palate: e.target.value } }))} placeholder="Bouche..." />
          <label htmlFor="whisky-finish" className="sr-only">Finale</label>
          <input id="whisky-finish" name="finish" className={inputClass} value={form.tasting.finish} onChange={e => setForm(p => ({ ...p, tasting: { ...p.tasting, finish: e.target.value } }))} placeholder="Finale..." />
        </div>
      </div>

      <div className="flex gap-4 pt-6 border-t border-stone-700">
        <button type="button" onClick={onCancel} className="flex-1 py-3 border border-stone-600 text-stone-300 rounded hover:bg-stone-800 transition-colors uppercase text-xs tracking-widest font-bold">Annuler</button>
        <button type="submit" className="flex-1 py-3 bg-amber-500 text-black font-bold rounded hover:bg-amber-400 transition-colors uppercase text-xs tracking-widest shadow-lg shadow-amber-900/20">{initialWhisky ? 'Enregistrer' : 'Ajouter'}</button>
      </div>
    </form>
  );
};

// ═══════════════════════════════════════════════════════════════
// RECOMMENDATION CARD (THE GOLDEN TICKET)
// ═══════════════════════════════════════════════════════════════
const RecommendationCard = ({ whisky, matchScore, isRandomPick, onFavorite, isFavorite, onServe }) => {
  if (!whisky) return null;

  return (
    <div className="group relative w-full perspective">
      <div className="absolute inset-0 bg-amber-500/10 blur-2xl rounded-full opacity-20 group-hover:opacity-30 transition-opacity" aria-hidden="true"></div>
      
      <div className="bg-[var(--whisky-panel)] border border-amber-600/30 p-8 md:p-12 text-center relative animate-fadeIn shadow-[0_20px_50px_-12px_rgba(0,0,0,1)] rounded-sm overflow-hidden isolate">
        {/* Decorative corner lines */}
        <div className="absolute top-4 left-4 w-16 h-16 border-t border-l border-amber-800/50" aria-hidden="true"></div>
        <div className="absolute bottom-4 right-4 w-16 h-16 border-b border-r border-amber-800/50" aria-hidden="true"></div>
        
        <div className="flex justify-between items-start absolute top-0 left-0 w-full p-6 z-20">
          <div className="inline-block px-3 py-1 bg-amber-950/70 border border-amber-700/70 text-amber-300 text-[10px] font-bold tracking-[0.2em] uppercase">
            {isRandomPick ? "Le Hasard" : "L'Élu"}
          </div>
          
          <div className="flex items-center gap-3">
            <button type="button" onClick={(e) => { e.stopPropagation(); onFavorite(whisky.id); }} className="p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center bg-black/70 rounded-full hover:bg-stone-800 transition-colors border border-white/10" aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}>
              <Heart size={18} className={isFavorite ? "fill-red-500 text-red-500" : "text-stone-300"} aria-hidden="true" />
            </button>
            {!isRandomPick && matchScore > 0 && (
              <div className="flex flex-col items-center justify-center w-12 h-12 rounded-full border border-green-700/70 bg-green-950/30" aria-label={`Correspondance ${matchScore} pour cent`}>
                <span className="text-sm font-bold text-green-400">{matchScore}%</span>
              </div>
            )}
          </div>
        </div>
        
        <div className="mt-12 mb-8 relative">
          <h2 className="text-4xl md:text-6xl font-thin text-[var(--whisky-highlight)] mb-2 tracking-normal font-serif z-10 relative break-words">
            {whisky.name}
          </h2>
          <div className="h-px w-32 bg-gradient-to-r from-transparent via-[#d4af37]/70 to-transparent mx-auto mt-6" aria-hidden="true"></div>
        </div>
        
        <div className="flex flex-wrap justify-center gap-4 sm:gap-6 mb-10 text-xs tracking-widest uppercase text-stone-300 font-bold">
          <span>{whisky.type}</span>
          <span className="text-amber-500" aria-hidden="true">•</span>
          <span>{whisky.region}</span>
          <span className="text-amber-500" aria-hidden="true">•</span>
          <span>{whisky.abv}</span>
        </div>

        <p className="text-[var(--whisky-muted-gold)] text-xl italic mb-12 max-w-lg mx-auto leading-relaxed font-serif relative">
          <span className="text-4xl text-amber-800/30 absolute -left-4 -top-4" aria-hidden="true">"</span>
          {whisky.notes || 'Un whisky à découvrir...'}
          <span className="text-4xl text-amber-800/30 absolute -right-4 bottom-0" aria-hidden="true">"</span>
        </p>

        {whisky.reasons && whisky.reasons.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2 mb-10">
            {whisky.reasons.map((reason, i) => (
              <span key={i} className="px-3 py-1 bg-stone-900 border border-stone-700 text-stone-300 text-[10px] uppercase tracking-wider rounded-full flex items-center gap-2">
                <Sparkles size={10} className="text-amber-500" aria-hidden="true" /> {reason}
              </span>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => onServe(whisky)}
          className="group relative inline-flex items-center gap-4 px-12 py-4 min-h-[48px] bg-transparent border border-amber-400 text-amber-200 hover:text-amber-50 font-bold text-sm tracking-[0.2em] uppercase transition-all overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--whisky-panel)]"
        >
          <div className="absolute inset-0 bg-amber-700/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" aria-hidden="true"></div>
          <GlassWater size={18} className="relative z-10" aria-hidden="true" />
          <span className="relative z-10">Déguster</span>
        </button>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// WHISKY CARD (POUR LES LISTES ET ALTERNATIVES)
// ═══════════════════════════════════════════════════════════════
const WhiskyCard = React.memo(({ whisky, isExpanded, onToggle, rank, onPromote, onFavorite, isFavorite, onServe }) => {
  const cardRef = useRef(null);

  useEffect(() => {
    if (isExpanded && cardRef.current) {
      const timeout = setTimeout(() => cardRef.current?.scrollIntoView({ behavior: getScrollBehavior(), block: 'center' }), 150);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [isExpanded]);

  return (
    <article 
      ref={cardRef}
      className={`bg-[var(--whisky-surface)] transition-all duration-500 overflow-hidden relative group border-t border-b sm:border border-stone-700/60
        ${isExpanded ? 'border-amber-900/50 bg-stone-950 shadow-2xl z-10 scale-[1.02] sm:rounded' : 'hover:bg-stone-900/30 sm:rounded hover:border-stone-600'}`}
    >
      <div className="p-6 md:p-8">
        <div className="flex justify-between items-start gap-4">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isExpanded}
            className="flex-1 text-left rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--whisky-surface)]"
          >
            <div className="flex items-center gap-3 mb-1">
              {rank && <span className="text-amber-500 font-serif text-lg italic">#{rank}</span>}
              <h3 className={`text-xl md:text-2xl font-serif tracking-wide transition-colors ${isFavorite ? 'text-amber-100' : 'text-[var(--whisky-body)] group-hover:text-white'}`}>
                {whisky.name}
              </h3>
              {whisky.isCustom && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 box-shadow-glow" aria-label="Ajouté manuellement"></span>}
            </div>
            <div className="flex items-center gap-3 text-xs text-stone-300 uppercase tracking-wider font-medium">
              <span>{whisky.type}</span>
              <span className="w-0.5 h-0.5 bg-stone-500 rounded-full" aria-hidden="true"></span>
              <span>{whisky.region}</span>
            </div>
          </button>
          
          <div className="flex flex-col items-end gap-2">
            <ColorBadge color={whisky.color} />
            <span className="text-amber-400 text-xs font-bold font-serif">{whisky.abv}</span>
          </div>
        </div>

        <div className={`grid transition-all duration-500 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100 mt-6 pt-6 border-t border-stone-700/50' : 'grid-rows-[0fr] opacity-0 mt-0 pt-0'}`}>
          <div className="overflow-hidden">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
              <p className="text-stone-300 text-lg font-serif italic max-w-lg">"{whisky.notes}"</p>
              <PeatScale level={whisky.peatLevel} />
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-sm">
              <div className="space-y-1">
                <span className="text-amber-500 text-[10px] uppercase tracking-widest font-bold">Nez</span>
                <p className="text-stone-300 font-serif">{whisky.tasting?.nose || "—"}</p>
              </div>
              <div className="space-y-1">
                <span className="text-amber-500 text-[10px] uppercase tracking-widest font-bold">Bouche</span>
                <p className="text-stone-300 font-serif">{whisky.tasting?.palate || "—"}</p>
              </div>
              <div className="space-y-1">
                <span className="text-amber-500 text-[10px] uppercase tracking-widest font-bold">Finale</span>
                <p className="text-stone-300 font-serif">{whisky.tasting?.finish || "—"}</p>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-3 mt-8">
              {onServe && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onServe(whisky); }}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] bg-amber-900/20 border border-amber-700/50 rounded hover:bg-amber-900/40 text-amber-300 hover:text-amber-200 text-xs uppercase tracking-widest transition-colors shadow-lg shadow-amber-900/10"
                >
                  <GlassWater size={16} aria-hidden="true" /> 
                  <span className="font-bold">Déguster</span>
                </button>
              )}

              <button 
                type="button"
                onClick={(e) => { e.stopPropagation(); onFavorite(whisky.id); }}
                aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                title={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                className="flex items-center justify-center gap-2 px-3 py-3 border border-stone-600 rounded hover:border-red-500/70 hover:bg-red-950/20 text-xs uppercase tracking-widest transition-colors text-stone-300 hover:text-red-400 min-w-[44px] min-h-[44px]"
              >
                <Heart size={16} className={isFavorite ? "fill-red-500 text-red-500" : ""} aria-hidden="true" /> 
                <span className="hidden sm:inline">{isFavorite ? 'Favori' : 'Favoris'}</span>
              </button>

              {onPromote && (
                <button 
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onPromote(whisky.id); }}
                  aria-label="Mettre en avant"
                  title="Mettre en avant"
                  className="flex items-center justify-center gap-2 px-3 py-3 bg-amber-900/20 border border-amber-700/50 rounded hover:bg-amber-900/30 text-amber-300 text-xs uppercase tracking-widest transition-colors min-w-[44px] min-h-[44px]"
                >
                  <Star size={16} aria-hidden="true" /> 
                  <span className="hidden sm:inline">Mettre en avant</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {!isExpanded && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 opacity-60 group-hover:opacity-100 transition-opacity text-stone-300" aria-hidden="true">
          <ChevronDown size={16} />
        </div>
      )}
    </article>
  );
});

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════
export default function WhiskyBarApp() {
  const [view, setView] = useState('home');
  const [expandedWhiskyId, setExpandedWhiskyId] = useState(null);
  const [sortOption, setSortOption] = useState('name');
  const [showRandom, setShowRandom] = useState(false);
  const [randomPickIds, setRandomPickIds] = useState([]);
  const [showBrowseMode, setShowBrowseMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, DEBOUNCE_DELAY);
  const [promotedWhiskyId, setPromotedWhiskyId] = useState(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingWhisky, setEditingWhisky] = useState(null);
  const [servingWhisky, setServingWhisky] = useState(null);
  
  const [toasts, setToasts] = useState([]);
  const toastTimersRef = useRef(new Map());

  useEffect(() => () => {
    toastTimersRef.current.forEach(clearTimeout);
    toastTimersRef.current.clear();
  }, []);

  const addToast = useCallback((message, type = 'success') => {
    const id = generateId();
    setToasts(prev => [...prev, { id, message, type }]);
    const timeout = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      toastTimersRef.current.delete(id);
    }, TOAST_DURATION);
    toastTimersRef.current.set(id, timeout);
  }, []);
  const removeToast = useCallback((id) => {
    const timeout = toastTimersRef.current.get(id);
    if (timeout) clearTimeout(timeout);
    toastTimersRef.current.delete(id);
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // A1 — retour visible si une écriture localStorage échoue (quota plein, navigation privée…).
  useEffect(() => {
    if (!isBrowser) return undefined;
    const onWriteError = () => addToast("Sauvegarde impossible : stockage plein ou indisponible", "error");
    window.addEventListener('ls-write-error', onWriteError);
    return () => window.removeEventListener('ls-write-error', onWriteError);
  }, [addToast]);

  const [customWhiskies, setCustomWhiskies] = useLocalStorage('whisky_custom_bottles', []);
  const initialStockRef = useRef(null);
  if (initialStockRef.current === null) initialStockRef.current = readInitialStock();
  const [stockQty, setStockQty] = useLocalStorage(V2_STOCK_KEY, initialStockRef.current);
  const [orderList, setOrderList] = useLocalStorage(V2_ORDER_KEY, {});
  const [partyGuests, setPartyGuests] = useLocalStorage(V2_PARTY_KEY, []);
  const [barMode, setBarMode] = useState(false);
  const [editingGuestId, setEditingGuestId] = useState(null);
  const [favorites, setFavorites] = useLocalStorage('whisky_favorites', []);
  const [selectedProfiles, setSelectedProfiles] = useLocalStorage('whisky_selectedProfiles', []);
  const [selectedMoods, setSelectedMoods] = useLocalStorage('whisky_selectedMoods', []);

  const allWhiskies = useMemo(() => {
    const combined = [...DEFAULT_WHISKIES, ...customWhiskies];
    return combined.map(w => {
      const qty = Object.prototype.hasOwnProperty.call(stockQty, w.id) ? stockQty[w.id] : 1;
      return {
        ...w,
        qty,
        owned: qty > 0,
        isFavorite: favorites.includes(w.id),
        imageSrc: BOTTLE_IMAGE_BY_ID[w.id] || w.imageSrc || null
      };
    });
  }, [customWhiskies, stockQty, favorites]);

  const totalOwned = useMemo(() => allWhiskies.filter(w => w.owned).length, [allWhiskies]);
  const totalBottles = useMemo(() => allWhiskies.reduce((sum, w) => sum + w.qty, 0), [allWhiskies]);
  const orderCount = useMemo(() => Object.values(orderList).reduce((sum, q) => sum + q, 0), [orderList]);

  const toggleProfile = useCallback((id) => {
    setShowRandom(false);
    setShowBrowseMode(false);
    setPromotedWhiskyId(null);
    setSelectedProfiles(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  }, [setSelectedProfiles]);

  const toggleMood = useCallback((id) => {
    setShowRandom(false);
    setShowBrowseMode(false);
    setPromotedWhiskyId(null);
    setSelectedMoods(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
  }, [setSelectedMoods]);

  const resetSelection = useCallback(() => {
    setSelectedProfiles([]);
    setSelectedMoods([]);
    setShowRandom(false);
    setPromotedWhiskyId(null);
    setShowBrowseMode(false);
    setSearchQuery('');
  }, [setSelectedProfiles, setSelectedMoods]);

  const adjustQty = useCallback((id, delta) => {
    setStockQty(prev => {
      const current = Object.prototype.hasOwnProperty.call(prev, id) ? prev[id] : 1;
      const next = Math.max(0, Math.min(MAX_QTY, current + delta));
      return { ...prev, [id]: next };
    });
  }, [setStockQty]);

  const adjustOrder = useCallback((id, delta) => {
    setOrderList(prev => {
      const current = prev[id] || 0;
      const next = Math.max(0, Math.min(MAX_QTY, current + delta));
      const updated = { ...prev };
      if (next === 0) delete updated[id];
      else updated[id] = next;
      return updated;
    });
  }, [setOrderList]);

  const addToOrder = useCallback((id) => {
    adjustOrder(id, 1);
    addToast("Ajouté au bon de commande");
  }, [adjustOrder, addToast]);

  const removeFromOrder = useCallback((id) => {
    setOrderList(prev => {
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });
  }, [setOrderList]);

  const toggleFavorite = useCallback((id) => {
    setFavorites(prev => {
      const isFav = prev.includes(id);
      addToast(isFav ? "Retiré des favoris" : "Ajouté aux favoris");
      return isFav ? prev.filter(fid => fid !== id) : [...prev, id];
    });
  }, [setFavorites, addToast]);

  const handleAddWhisky = useCallback((newWhisky) => {
    setCustomWhiskies(prev => [...prev, newWhisky]);
    setShowAddModal(false);
    addToast(`${newWhisky.name} ajouté à la cave !`);
  }, [setCustomWhiskies, addToast]);

  const handleUpdateWhisky = useCallback((updatedWhisky) => {
    setCustomWhiskies(prev => prev.map(w => w.id === updatedWhisky.id ? updatedWhisky : w));
    setEditingWhisky(null);
    addToast(`${updatedWhisky.name} mis à jour`);
  }, [setCustomWhiskies, addToast]);

  const handleDeleteWhisky = useCallback((id) => {
    const whisky = allWhiskies.find(w => w.id === id);
    if (!whisky?.isCustom) return;
    
    if (window.confirm(`Supprimer définitivement "${whisky.name}" ?`)) {
      setCustomWhiskies(prev => prev.filter(w => w.id !== id));
      setStockQty(prev => {
        const updated = { ...prev };
        delete updated[id];
        return updated;
      });
      removeFromOrder(id);
      setFavorites(prev => prev.filter(fid => fid !== id));
      addToast(`${whisky.name} supprimé`);
    }
  }, [allWhiskies, setCustomWhiskies, setStockQty, removeFromOrder, setFavorites, addToast]);

  const handleResetAllStock = useCallback(() => {
    if (window.confirm("Réinitialiser tout le stock par défaut ?")) {
      setStockQty({});
      addToast("Stock réinitialisé");
    }
  }, [setStockQty, addToast]);

  const handleExportData = () => {
    const data = {
      customWhiskies,
      stockQty,
      order: orderList,
      favorites,
      party: partyGuests,
      timestamp: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `whisky-cave-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    addToast("Sauvegarde téléchargée !");
  };

  const handleImportData = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > MAX_IMPORT_SIZE) {
      addToast("Fichier trop volumineux", "error");
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target.result);
        if (validateBackupData(json)) {
          if (json.customWhiskies) {
            // A2 — garantir des ids uniques et distincts du catalogue par défaut
            // (une collision « default-* » ou un doublon casserait les clés React / les lookups).
            const reservedIds = new Set(DEFAULT_WHISKIES.map(w => w.id));
            setCustomWhiskies(json.customWhiskies.map(w => {
              const id = (reservedIds.has(w.id)) ? `custom-${generateId()}` : w.id;
              reservedIds.add(id);
              return { ...w, id, isCustom: true };
            }));
          }
          if (json.stockQty) setStockQty(json.stockQty);
          else if (json.stock) setStockQty(Object.fromEntries(Object.entries(json.stock).map(([id, v]) => [id, v ? 1 : 0])));
          if (json.order) setOrderList(json.order);
          if (json.favorites) setFavorites(json.favorites);
          if (json.party) setPartyGuests(json.party);
          addToast("Données importées !");
        } else {
          throw new Error("Format invalide");
        }
      } catch {
        addToast("Fichier invalide", "error");
      }
    };
    reader.onerror = () => addToast("Lecture du fichier impossible", "error");
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleShareList = useCallback(async () => {
    const owned = allWhiskies.filter(w => w.owned);
    const text = "🥃 Ma Cave à Whiskies\n\n" + owned.map(w => `• ${w.name} ×${w.qty} (${w.type}, ${w.abv})`).join('\n');
    
    try {
      if (navigator.share) {
        await navigator.share({ title: "Ma Cave à Whiskies", text });
        addToast("Liste partagée !");
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        addToast("Liste copiée !");
      } else {
        throw new Error("Partage indisponible");
      }
    } catch {
      addToast("Partage indisponible", "error");
    }
  }, [allWhiskies, addToast]);

  const orderEntries = useMemo(() => (
    Object.entries(orderList)
      .map(([id, q]) => ({ whisky: allWhiskies.find(w => w.id === id), quantity: q }))
      .filter(entry => entry.whisky)
      .sort((a, b) => a.whisky.name.localeCompare(b.whisky.name))
  ), [orderList, allWhiskies]);

  const outOfStock = useMemo(() => (
    allWhiskies.filter(w => w.qty === 0 && !orderList[w.id]).sort((a, b) => a.name.localeCompare(b.name))
  ), [allWhiskies, orderList]);

  const buildOrderText = useCallback(() => {
    const lines = orderEntries.map(({ whisky, quantity }) => `• ${quantity} × ${whisky.name} (${whisky.type}${whisky.abv ? `, ${whisky.abv}` : ''})`);
    return `🥃 Commande whisky\n\n${lines.join('\n')}\n\nTotal : ${orderCount} bouteille${orderCount > 1 ? 's' : ''}`;
  }, [orderEntries, orderCount]);

  const handleCopyOrder = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(buildOrderText());
      addToast("Bon de commande copié !");
    } catch {
      addToast("Copie impossible", "error");
    }
  }, [buildOrderText, addToast]);

  const handleShareOrder = useCallback(async () => {
    const text = buildOrderText();
    try {
      if (navigator.share) {
        await navigator.share({ title: "Commande whisky", text });
        addToast("Commande partagée !");
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        addToast("Commande copiée !");
      } else {
        throw new Error("Partage indisponible");
      }
    } catch {
      addToast("Partage indisponible", "error");
    }
  }, [buildOrderText, addToast]);

  const handleMailOrder = useCallback(() => {
    window.location.href = `mailto:?subject=${encodeURIComponent('Commande whisky')}&body=${encodeURIComponent(buildOrderText())}`;
  }, [buildOrderText]);

  // ── Soirée : adaptateur de stockage (remplaçable par un driver Supabase si besoin multi-appareils) ──
  const ownedWhiskies = useMemo(() => (
    allWhiskies.filter(w => w.owned).sort((a, b) => a.name.localeCompare(b.name))
  ), [allWhiskies]);

  const whiskyNameById = useCallback((id) => (
    allWhiskies.find(w => w.id === id)?.name || '(retiré de la cave)'
  ), [allWhiskies]);

  const upsertGuest = useCallback((name, whiskyId) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const norm = normalizeText(trimmed);
    setPartyGuests(prev => {
      const existing = prev.find(g => normalizeText(g.name) === norm);
      if (existing) {
        return prev.map(g => g.id === existing.id
          ? { ...g, whiskyId, chosenAt: new Date().toISOString(), status: 'pending', servedAt: null }
          : g);
      }
      return [...prev, {
        id: `guest-${generateId()}`,
        name: trimmed,
        whiskyId,
        chosenAt: new Date().toISOString(),
        status: 'pending',
        servedAt: null
      }];
    });
  }, [setPartyGuests]);

  const toggleGuestServed = useCallback((id) => {
    setPartyGuests(prev => prev.map(g => g.id === id
      ? { ...g, status: g.status === 'served' ? 'pending' : 'served', servedAt: g.status === 'served' ? null : new Date().toISOString() }
      : g));
  }, [setPartyGuests]);

  const updateGuestWhisky = useCallback((id, whiskyId) => {
    setPartyGuests(prev => prev.map(g => g.id === id
      ? { ...g, whiskyId, chosenAt: new Date().toISOString(), status: 'pending', servedAt: null }
      : g));
    setEditingGuestId(null);
  }, [setPartyGuests]);

  const removeGuest = useCallback((id) => {
    const guest = partyGuests.find(g => g.id === id);
    if (!guest) return;
    if (window.confirm(`Retirer ${guest.name} de la soirée ?`)) {
      setPartyGuests(prev => prev.filter(g => g.id !== id));
      addToast(`${guest.name} retiré`);
    }
  }, [partyGuests, setPartyGuests, addToast]);

  const buildPartyJson = useCallback(() => JSON.stringify(
    partyGuests.map(g => ({ ...g, whisky: whiskyNameById(g.whiskyId) })), null, 2
  ), [partyGuests, whiskyNameById]);

  const handleExportPartyCsv = useCallback(() => {
    const rows = [
      'Prénom;Whisky;Heure;Statut',
      ...partyGuests.map(g => `${g.name.replace(/;/g, ',')};${whiskyNameById(g.whiskyId).replace(/;/g, ',')};${formatTime(g.chosenAt)};${g.status === 'served' ? 'Servi' : 'À servir'}`)
    ];
    downloadBlob(`soiree-${new Date().toISOString().slice(0, 10)}.csv`, String.fromCharCode(0xFEFF) + rows.join('\r\n'), 'text/csv;charset=utf-8');
    addToast("Export CSV téléchargé !");
  }, [partyGuests, whiskyNameById, addToast]);

  const handleExportPartyJson = useCallback(() => {
    downloadBlob(`soiree-${new Date().toISOString().slice(0, 10)}.json`, buildPartyJson(), 'application/json');
    addToast("Export JSON téléchargé !");
  }, [buildPartyJson, addToast]);

  const handleNewParty = useCallback(() => {
    if (partyGuests.length === 0) return;
    if (!window.confirm("Clôturer la soirée ? La liste sera sauvegardée en JSON puis vidée.")) return;
    downloadBlob(`soiree-${new Date().toISOString().slice(0, 10)}-cloture.json`, buildPartyJson(), 'application/json');
    setPartyGuests([]);
    setEditingGuestId(null);
    addToast("Nouvelle soirée. Santé !");
  }, [partyGuests, buildPartyJson, setPartyGuests, addToast]);

  const sortedGuests = useMemo(() => {
    const pending = partyGuests.filter(g => g.status === 'pending').sort((a, b) => (a.chosenAt || '').localeCompare(b.chosenAt || ''));
    const served = partyGuests.filter(g => g.status === 'served').sort((a, b) => (a.servedAt || '').localeCompare(b.servedAt || ''));
    return [...pending, ...served];
  }, [partyGuests]);

  const pendingGuestCount = useMemo(() => partyGuests.filter(g => g.status === 'pending').length, [partyGuests]);

  const prepQueue = useMemo(() => {
    const counts = new Map();
    partyGuests.filter(g => g.status === 'pending').forEach(g => {
      counts.set(g.whiskyId, (counts.get(g.whiskyId) || 0) + 1);
    });
    return [...counts.entries()]
      .map(([whiskyId, count]) => ({ whiskyId, count, name: whiskyNameById(whiskyId) }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [partyGuests, whiskyNameById]);

  const handleReceiveOrder = useCallback(() => {
    if (orderCount === 0) return;
    if (!window.confirm(`Ajouter ${orderCount} bouteille${orderCount > 1 ? 's' : ''} au stock et clôturer la commande ?`)) return;
    setStockQty(prev => {
      const updated = { ...prev };
      Object.entries(orderList).forEach(([id, q]) => {
        const current = Object.prototype.hasOwnProperty.call(updated, id) ? updated[id] : 1;
        updated[id] = Math.min(MAX_QTY, current + q);
      });
      return updated;
    });
    setOrderList({});
    addToast("Stock mis à jour. Santé !");
  }, [orderCount, orderList, setStockQty, setOrderList, addToast]);

  const handleSurpriseMe = useCallback(() => {
    resetSelection();
    const owned = allWhiskies.filter(w => w.owned);
    setRandomPickIds(shuffleWhiskies(owned).slice(0, 3).map(w => w.id));
    setShowRandom(true);
  }, [resetSelection, allWhiskies]);

  const handleBrowseMode = useCallback(() => {
    resetSelection();
    setShowBrowseMode(true);
  }, [resetSelection]);

  const handlePromote = useCallback((id) => {
    setPromotedWhiskyId(id);
    window.scrollTo({ top: 0, behavior: getScrollBehavior() });
  }, []);

  const handleToggleExpand = useCallback((id) => {
    setExpandedWhiskyId(prev => prev === id ? null : id);
  }, []);

  const handleServe = useCallback((whisky) => {
    setServingWhisky(whisky);
  }, []);

  const sortedCollection = useMemo(() => {
    let sorted = [...allWhiskies];
    if (debouncedSearchQuery) {
      const q = normalizeText(debouncedSearchQuery);
      sorted = sorted.filter(w => 
        normalizeText(w.name).includes(q) || 
        normalizeText(w.type).includes(q) || 
        normalizeText(w.region).includes(q)
      );
    }
    switch(sortOption) {
      case 'peat_desc': return sorted.sort((a, b) => (b.peatLevel || 0) - (a.peatLevel || 0));
      case 'peat_asc': return sorted.sort((a, b) => (a.peatLevel || 0) - (b.peatLevel || 0));
      case 'fav': return sorted.sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0));
      case 'type': return sorted.sort((a, b) => a.type.localeCompare(b.type));
      case 'custom': return sorted.sort((a, b) => (b.isCustom ? 1 : 0) - (a.isCustom ? 1 : 0));
      default: return sorted.sort((a, b) => a.name.localeCompare(b.name));
    }
  }, [allWhiskies, sortOption, debouncedSearchQuery]);

  const recommendedWhiskies = useMemo(() => {
    if (showRandom) {
      return randomPickIds
        .map(id => allWhiskies.find(w => w.id === id))
        .filter(w => w && w.owned);
    }

    const hasSelection = selectedProfiles.length > 0 || selectedMoods.length > 0;
    if (!hasSelection) return [];

    return allWhiskies
      .filter(w => w.owned)
      .map(whisky => {
        const { profileMatches, moodMatches, baseScore, score } = scoreWhisky(whisky, selectedProfiles, selectedMoods, { favoriteBonus: true });
        const reasons = [];
        if (profileMatches.length > 0) reasons.push(`Arômes: ${profileMatches.join(', ')}`);
        if (moodMatches.length > 0) reasons.push(`Ambiance: ${moodMatches.map(m => MOODS.find(mo => mo.id === m)?.label).join(', ')}`);
        if (whisky.isFavorite && score > baseScore) reasons.push("Favori");

        const maxScore = (selectedProfiles.length * WEIGHT_PROFILE) + (selectedMoods.length * WEIGHT_MOOD);
        const matchPercentage = maxScore > 0 ? Math.round((baseScore / maxScore) * 100) : 0;

        return { ...whisky, score, matchPercentage, reasons };
      })
      .filter(w => w.score > 0)
      .sort((a, b) => b.score - a.score);
  }, [selectedProfiles, selectedMoods, allWhiskies, showRandom, randomPickIds]);

  const promotedWhiskyObject = useMemo(() => {
    return promotedWhiskyId ? allWhiskies.find(w => w.id === promotedWhiskyId) : null;
  }, [promotedWhiskyId, allWhiskies]);

  const topPick = promotedWhiskyObject || recommendedWhiskies[0];
  const hasSelection = selectedProfiles.length > 0 || selectedMoods.length > 0 || showRandom;
  const matchCount = recommendedWhiskies.length;


  return (
    <div className="min-h-screen text-[var(--whisky-body)] font-sans selection:bg-amber-900/50 selection:text-white">
      {/* Texture Background */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.04] z-0 app-noise" aria-hidden="true" />
      
      {/* Ambient Lights */}
      <div className="fixed top-0 left-1/4 w-[420px] h-[420px] bg-amber-900/10 blur-[80px] rounded-full pointer-events-none z-0" aria-hidden="true" />
      <div className="fixed bottom-0 right-0 w-[320px] h-[320px] bg-blue-900/5 blur-[70px] rounded-full pointer-events-none z-0" aria-hidden="true" />

      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* Modes plein écran rendus en overlay pour conserver le <style> global (variables CSS, fond) */}
      {barMode && (
        <GuestKiosk
          whiskies={ownedWhiskies}
          guests={partyGuests}
          onChoose={upsertGuest}
          onExit={() => setBarMode(false)}
        />
      )}
      {servingWhisky && <ServingScreen whisky={servingWhisky} onClose={() => setServingWhisky(null)} />}
      
      <Modal
        isOpen={showAddModal || !!editingWhisky}
        onClose={() => { setShowAddModal(false); setEditingWhisky(null); }}
        title={editingWhisky ? "Modifier la Bouteille" : "Nouvelle Acquisition"}
        wide
      >
        <AddWhiskyForm
          key={editingWhisky?.id || 'new'}
          initialWhisky={editingWhisky}
          onAdd={editingWhisky ? handleUpdateWhisky : handleAddWhisky}
          onCancel={() => { setShowAddModal(false); setEditingWhisky(null); }}
        />
      </Modal>

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8 md:py-16" inert={(barMode || !!servingWhisky) || undefined}>
        {/* Header */}
        <header className="flex flex-col items-center mb-16 text-center">
          {/* Emblème sans texte (décoratif) + wordmark en titre : pas de redite, nom porté par le H1. */}
          <img
            src="logo.jpg"
            alt=""
            aria-hidden="true"
            width="512"
            height="512"
            className="w-32 h-32 md:w-40 md:h-40 rounded-[22%] border border-amber-800/40 shadow-[0_15px_45px_-12px_rgba(0,0,0,0.9),0_0_35px_-5px_rgba(212,175,55,0.2)] mb-6"
          />
          <h1 className="text-5xl md:text-7xl font-thin text-[var(--whisky-gold)] mb-4 tracking-normal font-serif drop-shadow-sm">
            Le Bar Clandestin
          </h1>
          <div className="h-px w-40 bg-gradient-to-r from-transparent via-[#d4af37]/70 to-transparent mb-6" aria-hidden="true"></div>
          <p className="text-stone-300 text-sm tracking-[0.22em] uppercase font-medium">
            Collection Privée • {totalOwned} Référence{totalOwned > 1 ? 's' : ''} • {totalBottles} Bouteille{totalBottles > 1 ? 's' : ''} en Cave
          </p>
        </header>

        {/* Navigation Tabs */}
        <nav className="flex justify-center mb-16" aria-label="Vue principale">
          <div className="flex flex-wrap justify-center gap-1 max-w-full bg-stone-900/80 p-1.5 rounded-3xl sm:rounded-full border border-stone-600 shadow-lg">
            <button
              type="button"
              aria-pressed={view === 'home'}
              onClick={() => setView('home')}
              className={`flex items-center gap-2 px-4 sm:px-8 py-3 min-h-[44px] rounded-full text-xs font-bold uppercase tracking-wider sm:tracking-widest transition-[color,box-shadow] duration-300 ${view === 'home' ? 'bg-[#d4af37] text-black shadow-[0_0_20px_rgba(212,175,55,0.25)]' : 'text-stone-200 hover:text-white hover:bg-white/5'}`}
            >
              <Sparkles size={14} aria-hidden="true" /> Sommelier
            </button>
            <button
              type="button"
              aria-pressed={view === 'collection'}
              onClick={() => setView('collection')}
              className={`flex items-center gap-2 px-4 sm:px-8 py-3 min-h-[44px] rounded-full text-xs font-bold uppercase tracking-wider sm:tracking-widest transition-[color,box-shadow] duration-300 ${view === 'collection' ? 'bg-[#d4af37] text-black shadow-[0_0_20px_rgba(212,175,55,0.25)]' : 'text-stone-200 hover:text-white hover:bg-white/5'}`}
            >
              <List size={14} aria-hidden="true" /> Inventaire
            </button>
            <button
              type="button"
              aria-pressed={view === 'commande'}
              onClick={() => setView('commande')}
              className={`relative flex items-center gap-2 px-4 sm:px-8 py-3 min-h-[44px] rounded-full text-xs font-bold uppercase tracking-wider sm:tracking-widest transition-[color,box-shadow] duration-300 ${view === 'commande' ? 'bg-[#d4af37] text-black shadow-[0_0_20px_rgba(212,175,55,0.25)]' : 'text-stone-200 hover:text-white hover:bg-white/5'}`}
            >
              <ShoppingCart size={14} aria-hidden="true" /> Commande
              {orderCount > 0 && (
                <span className={`absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${view === 'commande' ? 'bg-black text-amber-300' : 'bg-amber-500 text-black'}`} aria-label={`${orderCount} bouteilles à commander`}>
                  {orderCount}
                </span>
              )}
            </button>
            <button
              type="button"
              aria-pressed={view === 'soiree'}
              onClick={() => setView('soiree')}
              className={`relative flex items-center gap-2 px-4 sm:px-8 py-3 min-h-[44px] rounded-full text-xs font-bold uppercase tracking-wider sm:tracking-widest transition-[color,box-shadow] duration-300 ${view === 'soiree' ? 'bg-[#d4af37] text-black shadow-[0_0_20px_rgba(212,175,55,0.25)]' : 'text-stone-200 hover:text-white hover:bg-white/5'}`}
            >
              <Martini size={14} aria-hidden="true" /> Soirée
              {pendingGuestCount > 0 && (
                <span className={`absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${view === 'soiree' ? 'bg-black text-amber-300' : 'bg-amber-500 text-black'}`} aria-label={`${pendingGuestCount} verres à servir`}>
                  {pendingGuestCount}
                </span>
              )}
            </button>
          </div>
        </nav>

        <main className="animate-fadeIn min-h-[500px]">
          {view === 'home' && (
            <div className="space-y-16">
              {totalOwned === 0 ? (
                <div className="text-center py-20 border border-dashed border-stone-600 rounded bg-stone-900/40">
                  <Wine size={48} className="mx-auto text-stone-300 mb-6" strokeWidth={1} aria-hidden="true" />
                  <h3 className="text-2xl text-amber-500/80 font-serif mb-2">Votre cave est vide</h3>
                  <p className="text-stone-300 mb-8 max-w-md mx-auto">Commencez par ajouter vos bouteilles dans l'inventaire pour recevoir des recommandations personnalisées.</p>
                  <button type="button" onClick={() => setView('collection')} className="px-8 py-3 min-h-[44px] bg-amber-900/20 text-amber-300 border border-amber-700/70 hover:bg-amber-900/40 rounded transition-colors uppercase text-xs tracking-widest font-bold">
                    Aller à l'inventaire
                  </button>
                </div>
              ) : (
                <>
                  {/* Filters Section */}
                  <section className="space-y-12">
                    <div className="space-y-6">
                      <div className="flex items-center justify-center gap-4">
                        <div className="h-px w-12 bg-stone-700" aria-hidden="true"></div>
                        <h2 className="text-stone-200 text-xs tracking-[0.28em] uppercase font-bold text-center">Choisissez l'ambiance</h2>
                        <div className="h-px w-12 bg-stone-700" aria-hidden="true"></div>
                      </div>
                      <div className="flex flex-wrap justify-center gap-3 max-w-5xl mx-auto">
                        {MOODS.map(mood => (
                          <FilterButton
                            key={mood.id}
                            active={selectedMoods.includes(mood.id)}
                            onClick={() => toggleMood(mood.id)}
                            Icon={mood.Icon}
                            label={mood.label}
                            className="w-[calc(50%-0.375rem)] sm:w-[152px]"
                          />
                        ))}
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="flex items-center justify-center gap-4">
                        <div className="h-px w-12 bg-stone-700" aria-hidden="true"></div>
                        <h2 className="text-stone-200 text-xs tracking-[0.28em] uppercase font-bold text-center">Affinez par profil</h2>
                        <div className="h-px w-12 bg-stone-700" aria-hidden="true"></div>
                      </div>
                      
                      {/* Main Profile Toggles */}
                      <div className="flex flex-wrap justify-center gap-4 sm:gap-6 mb-6">
                        {['tourbé', 'fumé'].map(id => {
                          const profile = TASTE_PROFILES.find(p => p.id === id);
                          return (
                            <button
                              type="button"
                              key={id}
                              aria-pressed={selectedProfiles.includes(id)}
                              onClick={() => toggleProfile(id)}
                              className={`px-8 py-3 min-h-[44px] lg:px-12 lg:py-4 rounded border transition-all flex items-center gap-3 group
                                ${selectedProfiles.includes(id)
                                  ? 'bg-amber-950/50 border-amber-500 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                                  : 'bg-stone-900/40 border-stone-600 text-stone-200 hover:border-amber-600/60 hover:text-stone-50'}`}
                            >
                              {profile?.Icon && <profile.Icon size={18} strokeWidth={1.5} className={selectedProfiles.includes(id) ? 'text-amber-400' : 'text-stone-300 group-hover:text-amber-200'} aria-hidden="true" />}
                              <span className="uppercase tracking-[0.2em] text-xs font-bold">{profile?.label}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Secondary Profiles */}
                      <div className="flex flex-wrap justify-center gap-3 max-w-3xl mx-auto md:grid md:grid-cols-5 md:gap-4 md:max-w-3xl lg:max-w-4xl">
                        {TASTE_PROFILES.filter(p => !['tourbé', 'fumé'].includes(p.id)).map(profile => (
                          <button
                            type="button"
                            key={profile.id}
                            aria-pressed={selectedProfiles.includes(profile.id)}
                            onClick={() => toggleProfile(profile.id)}
                            className={`px-4 py-2.5 min-h-[44px] md:min-h-[52px] rounded-full text-[11px] md:text-xs uppercase tracking-wider font-bold border transition-all duration-300 inline-flex items-center justify-center gap-2 ${
                              selectedProfiles.includes(profile.id)
                                ? 'bg-amber-900/30 border-amber-600 text-amber-300'
                                : 'bg-stone-900/40 border-stone-600 text-stone-200 hover:border-amber-600/60 hover:text-stone-50'
                            }`}
                          >
                            <profile.Icon size={15} strokeWidth={1.5} className={selectedProfiles.includes(profile.id) ? 'text-amber-400' : 'text-stone-300'} aria-hidden="true" />{profile.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </section>

                  {/* Results Section */}
                  <section className="min-h-[400px]">
                    {hasSelection && !showBrowseMode ? (
                      <div className="animate-fadeIn space-y-12">
                        <div className="flex flex-wrap justify-center items-center gap-6">
                          <span className="text-xs text-stone-300 font-mono">{matchCount} RÉSULTAT{matchCount !== 1 ? 'S' : ''}</span>
                          <button type="button" onClick={resetSelection} className="text-xs text-amber-400 hover:text-amber-200 border-b border-transparent hover:border-amber-400 transition-all uppercase tracking-wider min-h-[44px]">
                            Effacer les filtres
                          </button>
                        </div>

                        {recommendedWhiskies.length > 0 ? (
                          <div className="space-y-16">
                            <div className="max-w-2xl mx-auto transform hover:scale-[1.01] transition-transform duration-500">
                              <RecommendationCard 
                                whisky={topPick} 
                                matchScore={topPick?.matchPercentage || 0}
                                isRandomPick={showRandom && !promotedWhiskyId}
                                isFavorite={topPick?.isFavorite}
                                onFavorite={toggleFavorite}
                                onServe={handleServe}
                              />
                            </div>

                            {recommendedWhiskies.length > 1 && (
                              <div className="max-w-4xl mx-auto pt-16 border-t border-stone-700">
                                <h3 className="text-center text-stone-300 text-xs tracking-[0.25em] uppercase mb-12 font-bold">Alternatives de choix</h3>
                                <div className="grid grid-cols-1 gap-4">
                                  {recommendedWhiskies.filter(w => w.id !== topPick?.id).slice(0, 4).map((whisky, i) => (
                                    <WhiskyCard 
                                      key={whisky.id} 
                                      whisky={whisky} 
                                      isFavorite={whisky.isFavorite} 
                                      onFavorite={toggleFavorite} 
                                      rank={i + 2} 
                                      isExpanded={expandedWhiskyId === whisky.id} 
                                      onToggle={() => handleToggleExpand(whisky.id)} 
                                      onPromote={handlePromote}
                                      onServe={handleServe}
                                    />
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-center py-20">
                            <p className="text-stone-300 font-serif text-xl italic mb-4">"Il n'y a pas de mauvais whisky. Il n'y a que des whiskies qui ne sont pas assez bons."</p>
                            <p className="text-sm text-stone-300 uppercase tracking-widest">Aucune correspondance trouvée</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      showBrowseMode ? (
                        <div className="animate-fadeIn">
                          <div className="flex flex-col md:flex-row justify-between items-center mb-10 gap-6 border-b border-stone-900 pb-8">
                            <div className="flex items-center gap-4">
                              <button type="button" onClick={resetSelection} className="flex items-center gap-2 min-h-[44px] text-stone-300 hover:text-amber-400 transition-colors uppercase text-xs font-bold tracking-wider">
                                <ArrowLeft size={16} aria-hidden="true" /> Retour
                              </button>
                              <div className="h-4 w-px bg-stone-700" aria-hidden="true"></div>
                              <button type="button" onClick={handleShareList} className="flex items-center gap-2 min-h-[44px] text-stone-300 hover:text-stone-100 transition-colors text-xs uppercase tracking-wider">
                                <Share2 size={16} aria-hidden="true" /> Partager
                              </button>
                            </div>
                            <SearchInput value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onClear={() => setSearchQuery('')} />
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {sortedCollection.filter(w => w.owned).map(whisky => (
                              <WhiskyCard 
                                key={whisky.id} 
                                whisky={whisky} 
                                isFavorite={whisky.isFavorite} 
                                onFavorite={toggleFavorite} 
                                isExpanded={expandedWhiskyId === whisky.id} 
                                onToggle={() => handleToggleExpand(whisky.id)} 
                                onPromote={handlePromote} 
                                onServe={handleServe}
                              />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-12 flex flex-col items-center gap-6">
                          <p className="text-stone-200 text-sm uppercase tracking-[0.2em]">En manque d'inspiration ?</p>
                          <div className="flex flex-col items-center gap-4">
                            <button type="button" onClick={handleSurpriseMe} className="group relative flex items-center gap-3 px-12 py-5 min-h-[56px] bg-amber-500 hover:bg-amber-400 text-black rounded-lg font-bold uppercase text-sm tracking-widest shadow-[0_10px_30px_-8px_rgba(245,158,11,0.5)] transition-colors">
                              <RefreshCw size={20} className="group-hover:rotate-180 transition-transform duration-500" aria-hidden="true" />
                              Surprenez-moi
                            </button>
                            <button type="button" onClick={handleBrowseMode} className="group flex items-center gap-2 px-6 py-3 min-h-[44px] text-stone-300 hover:text-amber-300 rounded transition-colors">
                              <List size={16} aria-hidden="true" />
                              <span className="text-xs font-bold uppercase tracking-widest border-b border-transparent group-hover:border-amber-400/60">ou voir la carte complète</span>
                            </button>
                          </div>
                        </div>
                      )
                    )}
                  </section>
                </>
              )}
            </div>
          )}

          {view === 'collection' && (
            <div className="space-y-8 animate-fadeIn">
              {/* Toolbar */}
              <div className="bg-stone-900/90 p-6 rounded-lg border border-stone-600 sticky top-4 z-30 shadow-2xl">
                <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                  <details className="relative w-full md:w-auto">
                    <summary className="flex items-center gap-2 px-4 py-2 min-h-[44px] text-[11px] uppercase font-bold tracking-wider text-stone-300 hover:text-amber-300 bg-stone-950/60 hover:bg-stone-800 rounded border border-stone-600 transition-all whitespace-nowrap cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                      <Settings2 size={14} aria-hidden="true" /> Gestion
                      <ChevronDown size={12} className="ml-auto md:ml-1 opacity-70" aria-hidden="true" />
                    </summary>
                    <div className="absolute left-0 top-full mt-2 z-40 flex flex-col gap-1 p-2 bg-stone-900 border border-stone-600 rounded-lg shadow-2xl w-full md:w-56">
                      <label className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] text-[11px] uppercase font-bold tracking-wider text-stone-200 hover:text-amber-300 hover:bg-stone-800 rounded transition-all cursor-pointer focus-within:ring-2 focus-within:ring-amber-500/70">
                        <Upload size={14} aria-hidden="true" /> Charger une sauvegarde
                        <input type="file" accept=".json,application/json" onChange={handleImportData} className="sr-only" aria-label="Charger une sauvegarde JSON" />
                      </label>
                      <button type="button" onClick={handleExportData} className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] text-[11px] uppercase font-bold tracking-wider text-stone-200 hover:text-amber-300 hover:bg-stone-800 rounded transition-all text-left">
                        <Download size={14} aria-hidden="true" /> Sauvegarder
                      </button>
                      <div className="h-px bg-stone-700 my-1" aria-hidden="true"></div>
                      <button type="button" onClick={handleResetAllStock} className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] text-[11px] uppercase font-bold tracking-wider text-red-300 hover:text-red-200 hover:bg-red-950/40 rounded transition-all text-left">
                        <Trash2 size={14} aria-hidden="true" /> Réinitialiser le stock
                      </button>
                    </div>
                  </details>

                  <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
                    <SearchInput value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onClear={() => setSearchQuery('')} />
                    
                    <div className="flex gap-2 w-full sm:w-auto">
                      <div className="relative flex-1 sm:flex-none">
                        <label htmlFor="sort-whiskies" className="sr-only">Trier l'inventaire</label>
                        <select 
                          id="sort-whiskies"
                          value={sortOption} 
                          onChange={(e) => setSortOption(e.target.value)} 
                          className="w-full min-h-[44px] appearance-none bg-stone-950 border border-stone-600 text-stone-300 py-2.5 pl-4 pr-10 rounded text-xs font-bold uppercase tracking-wider focus-visible:outline-none focus-visible:border-amber-500 focus-visible:ring-2 focus-visible:ring-amber-500/40 focus:text-amber-300 cursor-pointer"
                        >
                          <option value="name">Nom</option>
                          <option value="custom">Mes ajouts</option>
                          <option value="fav">Coups de cœur</option>
                          <option value="peat_desc">Tourbe (Fort → Doux)</option>
                          <option value="type">Type</option>
                        </select>
                        <ArrowUpDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-300 pointer-events-none" aria-hidden="true" />
                      </div>
                      
                      <button 
                        type="button"
                        onClick={() => setShowAddModal(true)} 
                        className="flex items-center justify-center gap-2 px-6 py-2.5 min-h-[44px] bg-amber-500 hover:bg-amber-400 text-black rounded text-xs font-bold uppercase tracking-widest transition-all shadow-lg shadow-amber-900/20 whitespace-nowrap"
                      >
                        <Plus size={14} aria-hidden="true" /> Nouveau
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* List */}
              <h2 className="sr-only">Ma cave</h2>
              <div className="grid grid-cols-1 gap-2">
                {sortedCollection.map(whisky => (
                    <article 
                      key={whisky.id} 
                      className={`group flex items-center gap-4 p-4 md:p-5 rounded border transition-all duration-300 relative overflow-hidden
                        ${whisky.owned 
                          ? 'bg-[var(--whisky-panel)] border-stone-700 hover:border-stone-600' 
                          : 'bg-stone-950/30 border-stone-700 opacity-80 hover:opacity-100 grayscale hover:grayscale-0'}`}
                    >
                      <div className="shrink-0 flex items-center bg-stone-900/60 rounded-full border border-stone-700" title={whisky.owned ? "En stock" : "En rupture"}>
                        <button
                          type="button"
                          onClick={() => adjustQty(whisky.id, -1)}
                          disabled={whisky.qty === 0}
                          aria-label={`Retirer une bouteille de ${whisky.name}`}
                          className="p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full text-stone-300 hover:text-amber-400 hover:bg-stone-800 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                        >
                          <Minus size={14} aria-hidden="true" />
                        </button>
                        <span className={`w-7 text-center font-bold font-serif text-lg ${whisky.qty === 0 ? 'text-red-400' : 'text-amber-300'}`} aria-label={`${whisky.qty} en stock`}>
                          {whisky.qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => adjustQty(whisky.id, 1)}
                          disabled={whisky.qty >= MAX_QTY}
                          aria-label={`Ajouter une bouteille de ${whisky.name}`}
                          className="p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full text-stone-300 hover:text-amber-400 hover:bg-stone-800 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                        >
                          <Plus size={14} aria-hidden="true" />
                        </button>
                      </div>
                    
                    <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                      <div className="md:col-span-2">
                        <div className="flex items-center gap-3 mb-1">
                          <ColorBadge color={whisky.color} />
                          <h3 className={`font-serif text-lg truncate ${whisky.owned ? 'text-stone-100' : 'text-stone-300'}`}>
                            {whisky.name}
                          </h3>
                          {whisky.isCustom && (
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 box-shadow-glow" title="Ajouté manuellement" aria-label="Ajouté manuellement"></span>
                          )}
                        </div>
                        <p className="text-[11px] text-stone-300 uppercase tracking-wider font-medium pl-8">{whisky.type} • {whisky.region}</p>
                      </div>

                      <div className="hidden md:flex items-center gap-2">
                        {whisky.peatLevel > 0 ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] text-amber-400 font-bold uppercase tracking-wider">
                            <Flame size={12} className="text-amber-400" aria-hidden="true" /> Tourbe {whisky.peatLevel}/5
                          </span>
                        ) : <span className="text-[11px] text-stone-300 uppercase tracking-widest">Non tourbé</span>}
                      </div>

                      <div className="flex justify-end items-center gap-2 opacity-100 transition-all">
                        <button
                          type="button"
                          onClick={() => addToOrder(whisky.id)}
                          aria-label={`Commander ${whisky.name}`}
                          title="Ajouter au bon de commande"
                          className="relative p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded hover:bg-stone-800 text-stone-300 hover:text-amber-400 transition-colors"
                        >
                          <ShoppingCart size={16} aria-hidden="true" />
                          {orderList[whisky.id] > 0 && (
                            <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-amber-500 text-black text-[9px] font-bold flex items-center justify-center" aria-hidden="true">
                              {orderList[whisky.id]}
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleFavorite(whisky.id)}
                          aria-label={whisky.isFavorite ? `Retirer ${whisky.name} des favoris` : `Ajouter ${whisky.name} aux favoris`}
                          className={`p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded hover:bg-stone-800 transition-colors ${whisky.isFavorite ? 'text-red-400' : 'text-stone-300 hover:text-red-400'}`}
                        >
                          <Heart size={16} className={whisky.isFavorite ? "fill-current" : ""} aria-hidden="true" />
                        </button>
                        {whisky.isCustom && (
                          <button
                            type="button"
                            onClick={() => setEditingWhisky(whisky)}
                            aria-label={`Modifier ${whisky.name}`}
                            className="p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded hover:bg-stone-800 text-stone-300 hover:text-amber-400 transition-colors"
                          >
                            <Pencil size={16} aria-hidden="true" />
                          </button>
                        )}
                        {whisky.isCustom && (
                          <button
                            type="button"
                            onClick={() => handleDeleteWhisky(whisky.id)}
                            aria-label={`Supprimer ${whisky.name}`}
                            className="p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded hover:bg-red-950/30 text-stone-300 hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={16} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              {sortedCollection.length === 0 && (
                <div className="text-center py-24 text-stone-300 bg-stone-900/20 border border-stone-600 rounded">
                  <p className="font-serif italic text-lg">"La bouteille que vous cherchez n'existe pas encore."</p>
                </div>
              )}
            </div>
          )}

          {view === 'commande' && (
            <div className="space-y-12 animate-fadeIn max-w-3xl mx-auto">
              {outOfStock.length > 0 && (
                <section aria-labelledby="rupture-heading">
                  <div className="flex items-center justify-center gap-4 mb-6">
                    <div className="h-px w-12 bg-stone-700" aria-hidden="true"></div>
                    <h2 id="rupture-heading" className="text-stone-200 text-xs tracking-[0.28em] uppercase font-bold text-center">En rupture dans la cave</h2>
                    <div className="h-px w-12 bg-stone-700" aria-hidden="true"></div>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {outOfStock.map(whisky => (
                      <div key={whisky.id} className="flex items-center justify-between gap-4 p-4 rounded border border-red-900/30 bg-red-950/10">
                        <div className="flex items-center gap-3 min-w-0">
                          <ColorBadge color={whisky.color} />
                          <div className="min-w-0">
                            <p className="font-serif text-lg text-stone-100 truncate">{whisky.name}</p>
                            <p className="text-[11px] text-stone-300 uppercase tracking-wider">{whisky.type} • {whisky.region}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => addToOrder(whisky.id)}
                          className="shrink-0 flex items-center gap-2 px-4 py-2.5 min-h-[44px] bg-amber-900/20 border border-amber-700/50 rounded hover:bg-amber-900/40 text-amber-300 text-[11px] font-bold uppercase tracking-widest transition-colors"
                        >
                          <ShoppingCart size={14} aria-hidden="true" /> Commander
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section aria-labelledby="bon-heading">
                <div className="flex items-center justify-center gap-4 mb-6">
                  <div className="h-px w-12 bg-stone-700" aria-hidden="true"></div>
                  <h2 id="bon-heading" className="text-stone-200 text-xs tracking-[0.28em] uppercase font-bold text-center">Bon de commande</h2>
                  <div className="h-px w-12 bg-stone-700" aria-hidden="true"></div>
                </div>

                {orderEntries.length === 0 ? (
                  <div className="text-center py-16 border border-dashed border-stone-600 rounded bg-stone-900/40">
                    <ShoppingCart size={40} className="mx-auto text-stone-300 mb-6" strokeWidth={1} aria-hidden="true" />
                    <p className="text-stone-300 font-serif italic text-lg mb-2">Le bon de commande est vide.</p>
                    <p className="text-stone-300 text-sm max-w-md mx-auto">Ajoutez des bouteilles depuis l'inventaire (icône panier) ou depuis les ruptures ci-dessus.</p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    <div className="grid grid-cols-1 gap-2">
                      {orderEntries.map(({ whisky, quantity }) => (
                        <div key={whisky.id} className="flex items-center justify-between gap-4 p-4 rounded border border-stone-700 bg-[var(--whisky-panel)]">
                          <div className="flex items-center gap-3 min-w-0">
                            <ColorBadge color={whisky.color} />
                            <div className="min-w-0">
                              <p className="font-serif text-lg text-stone-100 truncate">{whisky.name}</p>
                              <p className="text-[11px] text-stone-300 uppercase tracking-wider">{whisky.type} • {whisky.region} • En cave : {whisky.qty}</p>
                            </div>
                          </div>
                          <div className="shrink-0 flex items-center gap-1">
                            <div className="flex items-center bg-stone-900/60 rounded-full border border-stone-700">
                              <button type="button" onClick={() => adjustOrder(whisky.id, -1)} aria-label={`Réduire la commande de ${whisky.name}`} className="p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full text-stone-300 hover:text-amber-400 hover:bg-stone-800 transition-colors">
                                <Minus size={14} aria-hidden="true" />
                              </button>
                              <span className="w-7 text-center font-bold font-serif text-lg text-amber-300" aria-label={`${quantity} à commander`}>{quantity}</span>
                              <button type="button" onClick={() => adjustOrder(whisky.id, 1)} disabled={quantity >= MAX_QTY} aria-label={`Augmenter la commande de ${whisky.name}`} className="p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full text-stone-300 hover:text-amber-400 hover:bg-stone-800 disabled:opacity-30 disabled:pointer-events-none transition-colors">
                                <Plus size={14} aria-hidden="true" />
                              </button>
                            </div>
                            <button type="button" onClick={() => removeFromOrder(whisky.id)} aria-label={`Retirer ${whisky.name} de la commande`} className="p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded hover:bg-red-950/30 text-stone-300 hover:text-red-400 transition-colors">
                              <Trash2 size={16} aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <p className="text-center text-stone-300 text-xs uppercase tracking-[0.2em] font-bold">
                      Total : {orderCount} bouteille{orderCount > 1 ? 's' : ''} • {orderEntries.length} référence{orderEntries.length > 1 ? 's' : ''}
                    </p>

                    <div className="flex flex-wrap justify-center gap-3">
                      <button type="button" onClick={handleCopyOrder} className="flex items-center gap-2 px-5 py-3 min-h-[44px] border border-stone-600 text-stone-300 hover:text-amber-300 hover:border-amber-700 rounded text-xs font-bold uppercase tracking-widest transition-colors">
                        <Copy size={14} aria-hidden="true" /> Copier
                      </button>
                      <button type="button" onClick={handleShareOrder} className="flex items-center gap-2 px-5 py-3 min-h-[44px] border border-stone-600 text-stone-300 hover:text-amber-300 hover:border-amber-700 rounded text-xs font-bold uppercase tracking-widest transition-colors">
                        <Share2 size={14} aria-hidden="true" /> Partager
                      </button>
                      <button type="button" onClick={handleMailOrder} className="flex items-center gap-2 px-5 py-3 min-h-[44px] border border-stone-600 text-stone-300 hover:text-amber-300 hover:border-amber-700 rounded text-xs font-bold uppercase tracking-widest transition-colors">
                        <Upload size={14} aria-hidden="true" /> E-mail
                      </button>
                    </div>

                    <div className="text-center pt-6 border-t border-stone-700">
                      <button
                        type="button"
                        onClick={handleReceiveOrder}
                        className="inline-flex items-center gap-3 px-10 py-4 min-h-[48px] bg-amber-500 text-black font-bold rounded hover:bg-amber-400 transition-colors uppercase text-xs tracking-widest shadow-lg shadow-amber-900/20"
                      >
                        <PackageCheck size={18} aria-hidden="true" /> Commande reçue — mettre le stock à jour
                      </button>
                      <p className="text-stone-300 text-xs mt-4 max-w-md mx-auto">Ajoute les quantités commandées au stock de la cave et vide le bon de commande.</p>
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}

          {view === 'soiree' && (
            <div className="space-y-12 animate-fadeIn max-w-4xl mx-auto">
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setBarMode(true)}
                  className="inline-flex items-center gap-3 px-10 py-4 min-h-[48px] bg-amber-500 text-black font-bold rounded hover:bg-amber-400 transition-colors uppercase text-sm tracking-widest shadow-lg shadow-amber-900/20"
                >
                  <Martini size={18} aria-hidden="true" /> Ouvrir le bar aux invités
                </button>
                <p className="text-stone-300 text-xs mt-4 max-w-md mx-auto">Passe l'appareil aux invités : chacun entre son prénom et choisit son whisky. Tu retrouves tout ici.</p>
              </div>

              {partyGuests.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-stone-600 rounded bg-stone-900/40">
                  <Martini size={40} className="mx-auto text-stone-300 mb-6" strokeWidth={1} aria-hidden="true" />
                  <p className="text-stone-200 font-serif italic text-lg mb-2">Personne au bar pour l'instant.</p>
                  <p className="text-stone-300 text-sm max-w-md mx-auto">Ouvre le bar et fais circuler le téléphone ou la tablette.</p>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap justify-center gap-6 text-center">
                    <div className="px-6 py-3 rounded border border-stone-600/60 bg-[var(--whisky-panel)]">
                      <p className="text-2xl font-serif text-stone-100">{partyGuests.length}</p>
                      <p className="text-[11px] uppercase tracking-widest text-stone-300 font-bold">Invité{partyGuests.length > 1 ? 's' : ''}</p>
                    </div>
                    <div className="px-6 py-3 rounded border border-amber-700/60 bg-amber-950/20">
                      <p className="text-2xl font-serif text-amber-300">{pendingGuestCount}</p>
                      <p className="text-[11px] uppercase tracking-widest text-amber-400 font-bold">À servir</p>
                    </div>
                    <div className="px-6 py-3 rounded border border-green-800/60 bg-green-950/20">
                      <p className="text-2xl font-serif text-green-400">{partyGuests.length - pendingGuestCount}</p>
                      <p className="text-[11px] uppercase tracking-widest text-green-500 font-bold">Servi{partyGuests.length - pendingGuestCount > 1 ? 's' : ''}</p>
                    </div>
                  </div>

                  {prepQueue.length > 0 && (
                    <section aria-labelledby="prep-heading">
                      <div className="flex items-center justify-center gap-4 mb-6">
                        <div className="h-px w-12 bg-stone-600" aria-hidden="true"></div>
                        <h2 id="prep-heading" className="text-stone-200 text-xs tracking-[0.28em] uppercase font-bold text-center">À préparer</h2>
                        <div className="h-px w-12 bg-stone-600" aria-hidden="true"></div>
                      </div>
                      <div className="flex flex-wrap justify-center gap-3">
                        {prepQueue.map(item => (
                          <span key={item.whiskyId} className="px-5 py-2.5 rounded-full border border-amber-700/60 bg-amber-950/20 text-amber-200 font-serif text-lg">
                            {item.count} × {item.name}
                          </span>
                        ))}
                      </div>
                    </section>
                  )}

                  <section aria-labelledby="guests-heading">
                    <div className="flex items-center justify-center gap-4 mb-6">
                      <div className="h-px w-12 bg-stone-600" aria-hidden="true"></div>
                      <h2 id="guests-heading" className="text-stone-200 text-xs tracking-[0.28em] uppercase font-bold text-center">Les choix des invités</h2>
                      <div className="h-px w-12 bg-stone-600" aria-hidden="true"></div>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {sortedGuests.map(guest => (
                        <div key={guest.id} className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded border transition-all ${guest.status === 'served' ? 'border-stone-700 bg-stone-950/30 opacity-70' : 'border-stone-600/60 bg-[var(--whisky-panel)]'}`}>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="font-serif text-lg text-stone-100">{guest.name}</span>
                              <span className="text-stone-400" aria-hidden="true">→</span>
                              {editingGuestId === guest.id ? (
                                <select
                                  autoFocus
                                  defaultValue={guest.whiskyId}
                                  onChange={(e) => updateGuestWhisky(guest.id, e.target.value)}
                                  onBlur={() => setEditingGuestId(null)}
                                  aria-label={`Nouveau whisky pour ${guest.name}`}
                                  className="bg-stone-950 border border-stone-600 text-amber-200 py-1.5 px-3 rounded text-sm font-serif focus-visible:outline-none focus-visible:border-amber-500"
                                >
                                  {ownedWhiskies.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                </select>
                              ) : (
                                <span className="font-serif text-lg text-amber-200">{whiskyNameById(guest.whiskyId)}</span>
                              )}
                            </div>
                            <p className="text-[11px] text-stone-300 uppercase tracking-wider mt-1">
                              Choisi à {formatTime(guest.chosenAt)}
                              {guest.status === 'served' && guest.servedAt ? ` • servi à ${formatTime(guest.servedAt)}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => toggleGuestServed(guest.id)}
                              aria-pressed={guest.status === 'served'}
                              className={`flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded text-[11px] font-bold uppercase tracking-widest border transition-colors ${
                                guest.status === 'served'
                                  ? 'border-green-800/60 bg-green-950/20 text-green-400 hover:bg-green-950/40'
                                  : 'border-amber-600 bg-amber-500 text-black hover:bg-amber-400'
                              }`}
                            >
                              <CheckCircle2 size={14} aria-hidden="true" /> {guest.status === 'served' ? 'Servi' : 'Marquer servi'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingGuestId(prev => prev === guest.id ? null : guest.id)}
                              aria-label={`Modifier le whisky de ${guest.name}`}
                              title="Modifier le whisky"
                              className="p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded hover:bg-stone-800 text-stone-300 hover:text-amber-400 transition-colors"
                            >
                              <Pencil size={16} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeGuest(guest.id)}
                              aria-label={`Retirer ${guest.name} de la soirée`}
                              className="p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded hover:bg-red-950/30 text-stone-300 hover:text-red-400 transition-colors"
                            >
                              <Trash2 size={16} aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <div className="flex flex-wrap justify-center gap-3 pt-6 border-t border-stone-700">
                    <button type="button" onClick={handleExportPartyCsv} className="flex items-center gap-2 px-5 py-3 min-h-[44px] border border-stone-600 text-stone-200 hover:text-amber-300 hover:border-amber-700 rounded text-xs font-bold uppercase tracking-widest transition-colors">
                      <Download size={14} aria-hidden="true" /> CSV
                    </button>
                    <button type="button" onClick={handleExportPartyJson} className="flex items-center gap-2 px-5 py-3 min-h-[44px] border border-stone-600 text-stone-200 hover:text-amber-300 hover:border-amber-700 rounded text-xs font-bold uppercase tracking-widest transition-colors">
                      <Download size={14} aria-hidden="true" /> JSON
                    </button>
                    <button type="button" onClick={handleNewParty} className="flex items-center gap-2 px-5 py-3 min-h-[44px] border border-red-800/60 text-red-300 hover:bg-red-950/30 rounded text-xs font-bold uppercase tracking-widest transition-colors">
                      <RefreshCw size={14} aria-hidden="true" /> Nouvelle soirée
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </main>

        <footer className="mt-32 pt-12 border-t border-stone-700 text-center text-stone-300 transition-colors duration-300">
          <p className="text-[10px] tracking-[0.3em] uppercase font-medium mb-2">Le Bar Clandestin</p>
          <p className="text-[10px] tracking-wider">
            L'abus d'alcool est dangereux pour la santé • À consommer avec modération
          </p>
        </footer>
      </div>

      <style>{`
        :root {
          --whisky-bg: #0a0705;
          --whisky-surface: rgba(52, 39, 27, 0.92);
          --whisky-panel: rgba(60, 44, 31, 0.90);
          --whisky-body: #ded0b2;
          --whisky-cream: #e8dcc4;
          --whisky-gold: #d4af37;
          --whisky-highlight: #f4e4c8;
          --whisky-note: #c0a070;
          --whisky-muted-gold: #c8b79a;
          --whisky-focus: #f59e0b;
        }

        body {
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          background-color: var(--whisky-bg);
          /* url relative : résolue depuis la page, fonctionne en local ET sous /<repo>/ sur GitHub Pages */
          background-image: linear-gradient(rgba(26, 15, 7, 0.35), rgba(12, 7, 4, 0.72)), url('fond.jpg');
          background-size: cover;
          background-position: center;
          background-attachment: fixed;
          min-height: 100vh;
        }
        h1, h2, h3, h4, .font-serif { font-family: Georgia, "Times New Roman", serif; }

        .app-noise {
          background-image: radial-gradient(circle at 1px 1px, rgba(255, 255, 255, 0.35) 1px, transparent 0);
          background-size: 18px 18px;
        }
        
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: var(--whisky-surface); }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #44403c; border-radius: 2px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--whisky-gold); }
        
        .box-shadow-glow { box-shadow: 0 0 8px rgba(59, 130, 246, 0.5); }
        .perspective { perspective: 1000px; }

        button:focus-visible,
        input:focus-visible,
        select:focus-visible,
        [role="button"]:focus-visible {
          outline: 2px solid var(--whisky-focus);
          outline-offset: 3px;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn { animation: fadeIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .animate-slideIn { animation: slideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            scroll-behavior: auto !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </div>
  );
}
