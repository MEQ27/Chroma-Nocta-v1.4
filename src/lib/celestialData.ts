import { DeepSkyTarget } from '../types';

export interface ExtendedDeepSkyTarget extends DeepSkyTarget {
  color: string;
  secondaryColor?: string;
  recommendedFocal: string;
}

export interface BrightStar {
  id: string;
  name: string;
  bayer: string;
  constellation: string;
  ra: number;
  dec: number;
  vMag: number;
  color: string;
  spectralClass: 'O' | 'B' | 'A' | 'F' | 'G' | 'K' | 'M';
}

export const TARGET_CATALOG_30: ExtendedDeepSkyTarget[] = [
  {
    id: 'm42',
    name: 'Great Orion Nebula',
    catalog: 'M42 / NGC 1976',
    type: 'Nebula',
    ra: 5.588,
    dec: -5.39,
    magnitude: 4.0,
    sizeArcmin: 85,
    constellation: 'Orion',
    color: '#f43f5e',
    secondaryColor: '#38bdf8',
    recommendedFocal: '135 - 500mm',
    description: 'Brightest star-forming region with the Trapezium cluster and vast glowing gas veils.',
  },
  {
    id: 'm45',
    name: 'Pleiades Cluster',
    catalog: 'M45 / Seven Sisters',
    type: 'Open Cluster',
    ra: 3.79,
    dec: 24.11,
    magnitude: 1.6,
    sizeArcmin: 110,
    constellation: 'Taurus',
    color: '#38bdf8',
    recommendedFocal: '135 - 300mm',
    description: 'Young luminous stars embedded in delicate blue reflection dust nebulae.',
  },
  {
    id: 'm31',
    name: 'Andromeda Galaxy',
    catalog: 'M31 / NGC 224',
    type: 'Galaxy',
    ra: 0.712,
    dec: 41.27,
    magnitude: 3.4,
    sizeArcmin: 190,
    constellation: 'Andromeda',
    color: '#fbbf24',
    recommendedFocal: '135 - 400mm',
    description: 'Nearest giant spiral galaxy to the Milky Way, on a future collision course.',
  },
  {
    id: 'm8',
    name: 'Lagoon Nebula',
    catalog: 'M8 / NGC 6523',
    type: 'Nebula',
    ra: 18.06,
    dec: -24.38,
    magnitude: 6.0,
    sizeArcmin: 90,
    constellation: 'Sagittarius',
    color: '#f43f5e',
    recommendedFocal: '200 - 600mm',
    description: 'Luminous emission cloud in Sagittarius with dark dust lanes and hot gas channels.',
  },
  {
    id: 'm16',
    name: 'Eagle Nebula (Pillars of Creation)',
    catalog: 'M16 / NGC 6611',
    type: 'Nebula',
    ra: 18.31,
    dec: -13.82,
    magnitude: 6.0,
    sizeArcmin: 70,
    constellation: 'Serpens',
    color: '#fb7185',
    recommendedFocal: '400 - 800mm',
    description: 'Star-forming pillars and massive ionized hydrogen gas ridges in Serpens.',
  },
  {
    id: 'm20',
    name: 'Trifid Nebula',
    catalog: 'M20 / NGC 6514',
    type: 'Nebula',
    ra: 18.04,
    dec: -23.03,
    magnitude: 6.3,
    sizeArcmin: 28,
    constellation: 'Sagittarius',
    color: '#f43f5e',
    secondaryColor: '#38bdf8',
    recommendedFocal: '400 - 800mm',
    description: 'Tri-lobed combination of red emission and blue reflection nebulae divided by dark dust lanes.',
  },
  {
    id: 'm33',
    name: 'Triangulum Galaxy',
    catalog: 'M33 / NGC 598',
    type: 'Galaxy',
    ra: 1.56,
    dec: 30.66,
    magnitude: 5.7,
    sizeArcmin: 70,
    constellation: 'Triangulum',
    color: '#38bdf8',
    recommendedFocal: '250 - 600mm',
    description: 'Third-largest spiral galaxy in the Local Group, hosting the luminous NGC 604 HII region.',
  },
  {
    id: 'm51',
    name: 'Whirlpool Galaxy',
    catalog: 'M51 / NGC 5194',
    type: 'Galaxy',
    ra: 13.5,
    dec: 47.2,
    magnitude: 8.4,
    sizeArcmin: 11,
    constellation: 'Canes Venatici',
    color: '#fbbf24',
    recommendedFocal: '500 - 1000mm',
    description: 'Grand-design face-on spiral galaxy interacting dynamically with its companion NGC 5195.',
  },
  {
    id: 'm101',
    name: 'Pinwheel Galaxy',
    catalog: 'M101 / NGC 5457',
    type: 'Galaxy',
    ra: 14.05,
    dec: 54.35,
    magnitude: 7.9,
    sizeArcmin: 28,
    constellation: 'Ursa Major',
    color: '#38bdf8',
    recommendedFocal: '400 - 800mm',
    description: 'Enormous face-on spiral disk in Ursa Major with prominent star-forming arms.',
  },
  {
    id: 'm81-m82',
    name: 'Bode & Cigar Galaxies',
    catalog: 'M81 & M82',
    type: 'Galaxy',
    ra: 9.93,
    dec: 69.1,
    magnitude: 6.9,
    sizeArcmin: 30,
    constellation: 'Ursa Major',
    color: '#fbbf24',
    recommendedFocal: '250 - 600mm',
    description: 'Magnificent grand spiral M81 paired with the active starburst Cigar galaxy M82.',
  },
  {
    id: 'ngc7000',
    name: 'North America Nebula',
    catalog: 'NGC 7000 / Caldwell 20',
    type: 'Nebula',
    ra: 20.98,
    dec: 44.52,
    magnitude: 4.0,
    sizeArcmin: 120,
    constellation: 'Cygnus',
    color: '#f43f5e',
    recommendedFocal: '135 - 300mm',
    description: 'Immense H-alpha emission cloud resembling North America near Deneb in Cygnus.',
  },
  {
    id: 'ic1805',
    name: 'Heart Nebula',
    catalog: 'IC 1805 / Melotte 15',
    type: 'Nebula',
    ra: 2.54,
    dec: 61.45,
    magnitude: 6.5,
    sizeArcmin: 150,
    constellation: 'Cassiopeia',
    color: '#f43f5e',
    recommendedFocal: '135 - 300mm',
    description: 'Giant heart-shaped expanse of ionized hydrogen and oxygen gas in Cassiopeia.',
  },
  {
    id: 'ic1848',
    name: 'Soul Nebula',
    catalog: 'IC 1848 / Westerhout 5',
    type: 'Nebula',
    ra: 2.85,
    dec: 60.4,
    magnitude: 6.5,
    sizeArcmin: 150,
    constellation: 'Cassiopeia',
    color: '#f43f5e',
    recommendedFocal: '135 - 300mm',
    description: 'Complex glowing gas cavities and star nursery adjacent to the Heart Nebula.',
  },
  {
    id: 'ic1396',
    name: 'Elephant Trunk Nebula',
    catalog: 'IC 1396 / vdB 142',
    type: 'Nebula',
    ra: 21.65,
    dec: 57.5,
    magnitude: 3.5,
    sizeArcmin: 170,
    constellation: 'Cepheus',
    color: '#f43f5e',
    recommendedFocal: '135 - 300mm',
    description: 'Cosmic trunk carved by intense radiation and dense dark globules in Cepheus.',
  },
  {
    id: 'ngc2244',
    name: 'Rosette Nebula',
    catalog: 'NGC 2244 / Caldwell 49',
    type: 'Nebula',
    ra: 6.53,
    dec: 4.95,
    magnitude: 5.5,
    sizeArcmin: 80,
    constellation: 'Monoceros',
    color: '#f43f5e',
    recommendedFocal: '200 - 500mm',
    description: 'Rose-like emission nebula sculpted by the central open star cluster in Monoceros.',
  },
  {
    id: 'veil',
    name: 'Veil Nebula Complex',
    catalog: 'NGC 6960 & 6992',
    type: 'Nebula',
    ra: 20.76,
    dec: 30.7,
    magnitude: 7.0,
    sizeArcmin: 180,
    constellation: 'Cygnus',
    color: '#38bdf8',
    secondaryColor: '#f43f5e',
    recommendedFocal: '135 - 300mm',
    description: 'Delicate glowing filamentary shockwaves from a 20,000-year-old supernova in Cygnus.',
  },
  {
    id: 'm27',
    name: 'Dumbbell Nebula',
    catalog: 'M27 / NGC 6853',
    type: 'Planetary Nebula',
    ra: 19.99,
    dec: 22.72,
    magnitude: 7.5,
    sizeArcmin: 8,
    constellation: 'Vulpecula',
    color: '#06b6d4',
    recommendedFocal: '500 - 1000mm',
    description: 'Bipolar expanding shell of ionized oxygen gas shed by a dying central star.',
  },
  {
    id: 'm57',
    name: 'Ring Nebula',
    catalog: 'M57 / NGC 6720',
    type: 'Planetary Nebula',
    ra: 18.89,
    dec: 33.03,
    magnitude: 8.8,
    sizeArcmin: 3,
    constellation: 'Lyra',
    color: '#10b981',
    recommendedFocal: '600 - 1200mm',
    description: 'Classic smoke-ring planetary nebula surrounding a central white dwarf in Lyra.',
  },
  {
    id: 'ngc1499',
    name: 'California Nebula',
    catalog: 'NGC 1499',
    type: 'Nebula',
    ra: 4.05,
    dec: 36.42,
    magnitude: 6.0,
    sizeArcmin: 160,
    constellation: 'Perseus',
    color: '#f43f5e',
    recommendedFocal: '85 - 200mm',
    description: 'Elongated red H-alpha cloud energized by nearby blue star Menkib in Perseus.',
  },
  {
    id: 'm1',
    name: 'Crab Nebula',
    catalog: 'M1 / NGC 1952',
    type: 'Nebula',
    ra: 5.57,
    dec: 22.01,
    magnitude: 8.4,
    sizeArcmin: 7,
    constellation: 'Taurus',
    color: '#f59e0b',
    recommendedFocal: '500 - 1200mm',
    description: 'Expanding remnant of the supernova observed in 1054 with a central pulsar.',
  },
  {
    id: 'm13',
    name: 'Great Hercules Globular Cluster',
    catalog: 'M13 / NGC 6205',
    type: 'Globular Cluster',
    ra: 16.69,
    dec: 36.46,
    magnitude: 5.8,
    sizeArcmin: 20,
    constellation: 'Hercules',
    color: '#e2e8f0',
    recommendedFocal: '400 - 1000mm',
    description: 'Dense swarm of over 300,000 ancient stars tightly bound by mutual gravity.',
  },
  {
    id: 'rho-oph',
    name: 'Rho Ophiuchi Cloud Complex',
    catalog: 'Rho Ophiuchi & Antares',
    type: 'Nebula',
    ra: 16.43,
    dec: -23.4,
    magnitude: 4.5,
    sizeArcmin: 240,
    constellation: 'Ophiuchus',
    color: '#f59e0b',
    secondaryColor: '#38bdf8',
    recommendedFocal: '50 - 135mm',
    description: 'Most colorful vista in the sky: yellow Antares haze, blue reflection, and dark rivers.',
  },
  {
    id: 'ngc253',
    name: 'Sculptor Galaxy (Silver Dollar)',
    catalog: 'NGC 253 / Silver Dollar',
    type: 'Galaxy',
    ra: 0.79,
    dec: -25.29,
    magnitude: 7.2,
    sizeArcmin: 27,
    constellation: 'Sculptor',
    color: '#e2e8f0',
    recommendedFocal: '400 - 800mm',
    description: 'Bright starburst galaxy laced with intricate dust lanes and intense star formation.',
  },
  {
    id: 'b33',
    name: 'Horsehead & Flame Nebula',
    catalog: 'Barnard 33 & NGC 2024',
    type: 'Nebula',
    ra: 5.68,
    dec: -2.46,
    magnitude: 6.8,
    sizeArcmin: 60,
    constellation: 'Orion',
    color: '#f43f5e',
    recommendedFocal: '250 - 600mm',
    description: 'Iconic dark horsehead silhouette rising before bright crimson emission near Alnitak.',
  },
  {
    id: 'ngc2359',
    name: "Thor's Helmet",
    catalog: 'NGC 2359',
    type: 'Nebula',
    ra: 7.31,
    dec: -13.22,
    magnitude: 11.0,
    sizeArcmin: 14,
    constellation: 'Canis Major',
    color: '#06b6d4',
    recommendedFocal: '500 - 1000mm',
    description: 'Winged bubble structure blown into surrounding gas by energetic Wolf-Rayet stellar winds.',
  },
  {
    id: 'm104',
    name: 'Sombrero Galaxy',
    catalog: 'M104 / NGC 4594',
    type: 'Galaxy',
    ra: 12.67,
    dec: -11.62,
    magnitude: 8.0,
    sizeArcmin: 9,
    constellation: 'Virgo',
    color: '#fbbf24',
    recommendedFocal: '500 - 1200mm',
    description: 'Striking wide-brim galaxy featuring a brilliant central bulge and symmetrical dark dust ring.',
  },
  {
    id: 'ngc281',
    name: 'Pacman Nebula',
    catalog: 'NGC 281 / IC 11',
    type: 'Nebula',
    ra: 0.88,
    dec: 56.62,
    magnitude: 7.4,
    sizeArcmin: 35,
    constellation: 'Cassiopeia',
    color: '#f43f5e',
    recommendedFocal: '300 - 800mm',
    description: 'Luminous HII emission cloud with dark globules resembling the retro arcade character.',
  },
  {
    id: 'sh2-240',
    name: 'Spaghetti Nebula (Simeis 147)',
    catalog: 'Sh2-240',
    type: 'Nebula',
    ra: 5.65,
    dec: 28.0,
    magnitude: 6.5,
    sizeArcmin: 200,
    constellation: 'Taurus / Auriga',
    color: '#f43f5e',
    recommendedFocal: '135 - 200mm',
    description: 'Vast intricate network of delicate supernova shock filaments spanning Taurus and Auriga.',
  },
  {
    id: 'm64',
    name: 'Black Eye Galaxy',
    catalog: 'M64 / NGC 4826',
    type: 'Galaxy',
    ra: 12.94,
    dec: 21.68,
    magnitude: 8.5,
    sizeArcmin: 10,
    constellation: 'Coma Berenices',
    color: '#fbbf24',
    recommendedFocal: '500 - 1200mm',
    description: 'Famous galaxy featuring a prominent absorbing band of dark dust obscuring its core.',
  },
  {
    id: 'mw-core',
    name: 'Milky Way Galactic Center (Sgr A*)',
    catalog: 'Galactic Center / Sagittarius A*',
    type: 'Milky Way',
    ra: 17.76,
    dec: -28.94,
    magnitude: 1.0,
    sizeArcmin: 360,
    constellation: 'Sagittarius',
    color: '#f59e0b',
    secondaryColor: '#fbbf24',
    recommendedFocal: '14 - 85mm',
    description: 'Dense star clouds and dark dust rifts surrounding the central supermassive black hole.',
  },
];

export const BRIGHT_STAR_CATALOG_120: BrightStar[] = [
  { id: 'polaris', name: 'Polaris (North Star)', bayer: 'α UMi', constellation: 'Ursa Minor', ra: 2.53, dec: 89.26, vMag: 1.98, color: '#fef08a', spectralClass: 'F' },
  { id: 'kochab', name: 'Kochab', bayer: 'β UMi', constellation: 'Ursa Minor', ra: 14.85, dec: 74.16, vMag: 2.08, color: '#fb923c', spectralClass: 'K' },
  { id: 'pherkad', name: 'Pherkad', bayer: 'γ UMi', constellation: 'Ursa Minor', ra: 15.35, dec: 71.83, vMag: 3.05, color: '#f8fafc', spectralClass: 'A' },
  { id: 'dubhe', name: 'Dubhe', bayer: 'α UMa', constellation: 'Ursa Major', ra: 11.06, dec: 61.75, vMag: 1.79, color: '#fb923c', spectralClass: 'K' },
  { id: 'merak', name: 'Merak', bayer: 'β UMa', constellation: 'Ursa Major', ra: 11.03, dec: 56.38, vMag: 2.37, color: '#f8fafc', spectralClass: 'A' },
  { id: 'phecda', name: 'Phecda', bayer: 'γ UMa', constellation: 'Ursa Major', ra: 11.9, dec: 53.69, vMag: 2.44, color: '#f8fafc', spectralClass: 'A' },
  { id: 'megrez', name: 'Megrez', bayer: 'δ UMa', constellation: 'Ursa Major', ra: 12.25, dec: 57.03, vMag: 3.31, color: '#f8fafc', spectralClass: 'A' },
  { id: 'alioth', name: 'Alioth', bayer: 'ε UMa', constellation: 'Ursa Major', ra: 12.9, dec: 55.96, vMag: 1.77, color: '#f8fafc', spectralClass: 'A' },
  { id: 'mizar', name: 'Mizar', bayer: 'ζ UMa', constellation: 'Ursa Major', ra: 13.4, dec: 54.92, vMag: 2.23, color: '#f8fafc', spectralClass: 'A' },
  { id: 'alkaid', name: 'Alkaid', bayer: 'η UMa', constellation: 'Ursa Major', ra: 13.79, dec: 49.31, vMag: 1.86, color: '#93c5fd', spectralClass: 'B' },
  { id: 'schedar', name: 'Schedar', bayer: 'α Cas', constellation: 'Cassiopeia', ra: 0.675, dec: 56.54, vMag: 2.24, color: '#fb923c', spectralClass: 'K' },
  { id: 'caph', name: 'Caph', bayer: 'β Cas', constellation: 'Cassiopeia', ra: 0.153, dec: 59.15, vMag: 2.28, color: '#fef08a', spectralClass: 'F' },
  { id: 'navi', name: 'Navi (Tsih)', bayer: 'γ Cas', constellation: 'Cassiopeia', ra: 0.945, dec: 60.72, vMag: 2.15, color: '#93c5fd', spectralClass: 'B' },
  { id: 'ruchbah', name: 'Ruchbah', bayer: 'δ Cas', constellation: 'Cassiopeia', ra: 1.43, dec: 60.23, vMag: 2.68, color: '#f8fafc', spectralClass: 'A' },
  { id: 'segin', name: 'Segin', bayer: 'ε Cas', constellation: 'Cassiopeia', ra: 1.9, dec: 63.67, vMag: 3.37, color: '#93c5fd', spectralClass: 'B' },
  { id: 'betelgeuse', name: 'Betelgeuse', bayer: 'α Ori', constellation: 'Orion', ra: 5.92, dec: 7.41, vMag: 0.42, color: '#f87171', spectralClass: 'M' },
  { id: 'rigel', name: 'Rigel', bayer: 'β Ori', constellation: 'Orion', ra: 5.24, dec: -8.2, vMag: 0.18, color: '#93c5fd', spectralClass: 'B' },
  { id: 'bellatrix', name: 'Bellatrix', bayer: 'γ Ori', constellation: 'Orion', ra: 5.42, dec: 6.35, vMag: 1.64, color: '#93c5fd', spectralClass: 'B' },
  { id: 'alnilam', name: 'Alnilam', bayer: 'ε Ori', constellation: 'Orion', ra: 5.6, dec: -1.2, vMag: 1.69, color: '#93c5fd', spectralClass: 'B' },
  { id: 'alnitak', name: 'Alnitak', bayer: 'ζ Ori', constellation: 'Orion', ra: 5.68, dec: -1.94, vMag: 1.74, color: '#93c5fd', spectralClass: 'O' },
  { id: 'mintaka', name: 'Mintaka', bayer: 'δ Ori', constellation: 'Orion', ra: 5.53, dec: -0.3, vMag: 2.23, color: '#93c5fd', spectralClass: 'O' },
  { id: 'saiph', name: 'Saiph', bayer: 'κ Ori', constellation: 'Orion', ra: 5.79, dec: -9.67, vMag: 2.07, color: '#93c5fd', spectralClass: 'B' },
  { id: 'sirius', name: 'Sirius (Dog Star)', bayer: 'α CMa', constellation: 'Canis Major', ra: 6.75, dec: -16.72, vMag: -1.46, color: '#f8fafc', spectralClass: 'A' },
  { id: 'canopus', name: 'Canopus', bayer: 'α Car', constellation: 'Carina', ra: 6.4, dec: -52.7, vMag: -0.74, color: '#fef08a', spectralClass: 'F' },
  { id: 'arcturus', name: 'Arcturus', bayer: 'α Boo', constellation: 'Boötes', ra: 14.26, dec: 19.18, vMag: -0.05, color: '#fb923c', spectralClass: 'K' },
  { id: 'vega', name: 'Vega', bayer: 'α Lyr', constellation: 'Lyra', ra: 18.62, dec: 38.78, vMag: 0.03, color: '#f8fafc', spectralClass: 'A' },
  { id: 'capella', name: 'Capella', bayer: 'α Aur', constellation: 'Auriga', ra: 5.28, dec: 45.99, vMag: 0.08, color: '#facc15', spectralClass: 'G' },
  { id: 'procyon', name: 'Procyon', bayer: 'α CMi', constellation: 'Canis Minor', ra: 7.65, dec: 5.22, vMag: 0.34, color: '#fef08a', spectralClass: 'F' },
  { id: 'altair', name: 'Altair', bayer: 'α Aql', constellation: 'Aquila', ra: 19.84, dec: 8.87, vMag: 0.77, color: '#f8fafc', spectralClass: 'A' },
  { id: 'aldebaran', name: 'Aldebaran', bayer: 'α Tau', constellation: 'Taurus', ra: 4.6, dec: 16.51, vMag: 0.85, color: '#fb923c', spectralClass: 'K' },
  { id: 'spica', name: 'Spica', bayer: 'α Vir', constellation: 'Virgo', ra: 13.42, dec: -11.16, vMag: 0.98, color: '#93c5fd', spectralClass: 'B' },
  { id: 'antares', name: 'Antares', bayer: 'α Sco', constellation: 'Scorpius', ra: 16.49, dec: -26.43, vMag: 1.06, color: '#f87171', spectralClass: 'M' },
  { id: 'pollux', name: 'Pollux', bayer: 'β Gem', constellation: 'Gemini', ra: 7.76, dec: 28.03, vMag: 1.15, color: '#fb923c', spectralClass: 'K' },
  { id: 'fomalhaut', name: 'Fomalhaut', bayer: 'α PsA', constellation: 'Piscis Austrinus', ra: 22.96, dec: -29.62, vMag: 1.17, color: '#f8fafc', spectralClass: 'A' },
  { id: 'deneb', name: 'Deneb', bayer: 'α Cyg', constellation: 'Cygnus', ra: 20.69, dec: 45.28, vMag: 1.25, color: '#f8fafc', spectralClass: 'A' },
  { id: 'regulus', name: 'Regulus', bayer: 'α Leo', constellation: 'Leo', ra: 10.14, dec: 11.97, vMag: 1.36, color: '#93c5fd', spectralClass: 'B' },
  { id: 'castor', name: 'Castor', bayer: 'α Gem', constellation: 'Gemini', ra: 7.58, dec: 31.89, vMag: 1.58, color: '#f8fafc', spectralClass: 'A' },
  { id: 'sadr', name: 'Sadr', bayer: 'γ Cyg', constellation: 'Cygnus', ra: 20.37, dec: 40.26, vMag: 2.23, color: '#fef08a', spectralClass: 'F' },
  { id: 'gienah', name: 'Gienah', bayer: 'ε Cyg', constellation: 'Cygnus', ra: 20.77, dec: 33.97, vMag: 2.48, color: '#fb923c', spectralClass: 'K' },
  { id: 'albireo', name: 'Albireo', bayer: 'β Cyg', constellation: 'Cygnus', ra: 19.51, dec: 27.96, vMag: 3.05, color: '#f59e0b', spectralClass: 'K' },
  { id: 'tarazed', name: 'Tarazed', bayer: 'γ Aql', constellation: 'Aquila', ra: 19.77, dec: 10.61, vMag: 2.72, color: '#fb923c', spectralClass: 'K' },
  { id: 'alshain', name: 'Alshain', bayer: 'β Aql', constellation: 'Aquila', ra: 19.92, dec: 6.41, vMag: 3.71, color: '#fef08a', spectralClass: 'G' },
  { id: 'sheliak', name: 'Sheliak', bayer: 'β Lyr', constellation: 'Lyra', ra: 18.83, dec: 33.36, vMag: 3.52, color: '#93c5fd', spectralClass: 'B' },
  { id: 'sulafat', name: 'Sulafat', bayer: 'γ Lyr', constellation: 'Lyra', ra: 18.98, dec: 32.69, vMag: 3.25, color: '#93c5fd', spectralClass: 'B' },
  { id: 'shaula', name: 'Shaula', bayer: 'λ Sco', constellation: 'Scorpius', ra: 17.56, dec: -37.1, vMag: 1.62, color: '#93c5fd', spectralClass: 'B' },
  { id: 'sargas', name: 'Sargas', bayer: 'θ Sco', constellation: 'Scorpius', ra: 17.62, dec: -43.0, vMag: 1.86, color: '#fef08a', spectralClass: 'F' },
  { id: 'dschubba', name: 'Dschubba', bayer: 'δ Sco', constellation: 'Scorpius', ra: 16.01, dec: -22.62, vMag: 2.29, color: '#93c5fd', spectralClass: 'B' },
  { id: 'kaus-aust', name: 'Kaus Australis', bayer: 'ε Sgr', constellation: 'Sagittarius', ra: 18.4, dec: -34.38, vMag: 1.79, color: '#93c5fd', spectralClass: 'B' },
  { id: 'nunki', name: 'Nunki', bayer: 'σ Sgr', constellation: 'Sagittarius', ra: 18.92, dec: -26.3, vMag: 2.05, color: '#93c5fd', spectralClass: 'B' },
  { id: 'ascella', name: 'Ascella', bayer: 'ζ Sgr', constellation: 'Sagittarius', ra: 19.04, dec: -29.88, vMag: 2.6, color: '#f8fafc', spectralClass: 'A' },
  { id: 'kaus-med', name: 'Kaus Media', bayer: 'δ Sgr', constellation: 'Sagittarius', ra: 18.35, dec: -29.83, vMag: 2.72, color: '#fb923c', spectralClass: 'K' },
  { id: 'kaus-bor', name: 'Kaus Borealis', bayer: 'λ Sgr', constellation: 'Sagittarius', ra: 18.46, dec: -25.42, vMag: 2.82, color: '#fb923c', spectralClass: 'K' },
  { id: 'elnath', name: 'Elnath', bayer: 'β Tau', constellation: 'Taurus', ra: 5.44, dec: 28.61, vMag: 1.65, color: '#93c5fd', spectralClass: 'B' },
  { id: 'tianguan', name: 'Tianguan', bayer: 'ζ Tau', constellation: 'Taurus', ra: 5.63, dec: 21.14, vMag: 2.97, color: '#93c5fd', spectralClass: 'B' },
  { id: 'menkalinan', name: 'Menkalinan', bayer: 'β Aur', constellation: 'Auriga', ra: 5.99, dec: 44.95, vMag: 1.9, color: '#f8fafc', spectralClass: 'A' },
  { id: 'mahassim', name: 'Mahassim', bayer: 'θ Aur', constellation: 'Auriga', ra: 5.99, dec: 37.21, vMag: 2.65, color: '#f8fafc', spectralClass: 'A' },
  { id: 'mirfak', name: 'Mirfak', bayer: 'α Per', constellation: 'Perseus', ra: 3.41, dec: 49.86, vMag: 1.79, color: '#fef08a', spectralClass: 'F' },
  { id: 'algol', name: 'Algol (Demon Star)', bayer: 'β Per', constellation: 'Perseus', ra: 3.14, dec: 40.96, vMag: 2.09, color: '#93c5fd', spectralClass: 'B' },
  { id: 'alpheratz', name: 'Alpheratz', bayer: 'α And', constellation: 'Andromeda', ra: 0.14, dec: 29.09, vMag: 2.07, color: '#93c5fd', spectralClass: 'B' },
  { id: 'mirach', name: 'Mirach', bayer: 'β And', constellation: 'Andromeda', ra: 1.16, dec: 35.62, vMag: 2.07, color: '#f87171', spectralClass: 'M' },
  { id: 'almach', name: 'Almach', bayer: 'γ And', constellation: 'Andromeda', ra: 2.06, dec: 42.33, vMag: 2.1, color: '#fb923c', spectralClass: 'K' },
  { id: 'scheat', name: 'Scheat', bayer: 'β Peg', constellation: 'Pegasus', ra: 23.06, dec: 28.08, vMag: 2.44, color: '#f87171', spectralClass: 'M' },
  { id: 'markab', name: 'Markab', bayer: 'α Peg', constellation: 'Pegasus', ra: 23.08, dec: 15.21, vMag: 2.49, color: '#93c5fd', spectralClass: 'B' },
  { id: 'algenib', name: 'Algenib', bayer: 'γ Peg', constellation: 'Pegasus', ra: 0.22, dec: 15.18, vMag: 2.84, color: '#93c5fd', spectralClass: 'B' },
  { id: 'enif', name: 'Enif', bayer: 'ε Peg', constellation: 'Pegasus', ra: 21.74, dec: 9.87, vMag: 2.38, color: '#fb923c', spectralClass: 'K' },
  { id: 'denebola', name: 'Denebola', bayer: 'β Leo', constellation: 'Leo', ra: 11.82, dec: 14.57, vMag: 2.14, color: '#f8fafc', spectralClass: 'A' },
  { id: 'algieba', name: 'Algieba', bayer: 'γ Leo', constellation: 'Leo', ra: 10.33, dec: 19.84, vMag: 2.01, color: '#fb923c', spectralClass: 'K' },
  { id: 'zosma', name: 'Zosma', bayer: 'δ Leo', constellation: 'Leo', ra: 11.24, dec: 20.52, vMag: 2.56, color: '#f8fafc', spectralClass: 'A' },
  { id: 'porrima', name: 'Porrima', bayer: 'γ Vir', constellation: 'Virgo', ra: 12.69, dec: -1.45, vMag: 2.74, color: '#fef08a', spectralClass: 'F' },
  { id: 'vindemiatrix', name: 'Vindemiatrix', bayer: 'ε Vir', constellation: 'Virgo', ra: 13.04, dec: 10.96, vMag: 2.85, color: '#facc15', spectralClass: 'G' },
  { id: 'izar', name: 'Izar', bayer: 'ε Boo', constellation: 'Boötes', ra: 14.75, dec: 27.07, vMag: 2.35, color: '#fb923c', spectralClass: 'K' },
  { id: 'muphrid', name: 'Muphrid', bayer: 'η Boo', constellation: 'Boötes', ra: 13.91, dec: 18.4, vMag: 2.68, color: '#facc15', spectralClass: 'G' },
  { id: 'rasalgethi', name: 'Rasalgethi', bayer: 'α Her', constellation: 'Hercules', ra: 17.24, dec: 14.39, vMag: 3.1, color: '#f87171', spectralClass: 'M' },
  { id: 'kornephoros', name: 'Kornephoros', bayer: 'β Her', constellation: 'Hercules', ra: 16.5, dec: 21.49, vMag: 2.78, color: '#facc15', spectralClass: 'G' },
  { id: 'alphecca', name: 'Alphecca (Gemma)', bayer: 'α CrB', constellation: 'Corona Borealis', ra: 15.58, dec: 26.71, vMag: 2.22, color: '#f8fafc', spectralClass: 'A' },
  { id: 'rasalhague', name: 'Rasalhague', bayer: 'α Oph', constellation: 'Ophiuchus', ra: 17.58, dec: 12.56, vMag: 2.08, color: '#f8fafc', spectralClass: 'A' },
  { id: 'sabik', name: 'Sabik', bayer: 'η Oph', constellation: 'Ophiuchus', ra: 17.17, dec: -15.72, vMag: 2.43, color: '#f8fafc', spectralClass: 'A' },
  { id: 'cor-caroli', name: 'Cor Caroli', bayer: 'α CVn', constellation: 'Canes Venatici', ra: 12.93, dec: 38.32, vMag: 2.89, color: '#93c5fd', spectralClass: 'A' },
  { id: 'hamal', name: 'Hamal', bayer: 'α Ari', constellation: 'Aries', ra: 2.12, dec: 23.46, vMag: 2.01, color: '#fb923c', spectralClass: 'K' },
  { id: 'sheratan', name: 'Sheratan', bayer: 'β Ari', constellation: 'Aries', ra: 1.91, dec: 20.81, vMag: 2.64, color: '#f8fafc', spectralClass: 'A' },
  { id: 'diphda', name: 'Diphda (Deneb Kaitos)', bayer: 'β Cet', constellation: 'Cetus', ra: 0.73, dec: -17.99, vMag: 2.04, color: '#fb923c', spectralClass: 'K' },
  { id: 'menkar', name: 'Menkar', bayer: 'α Cet', constellation: 'Cetus', ra: 3.04, dec: 4.09, vMag: 2.54, color: '#f87171', spectralClass: 'M' },
  { id: 'alphard', name: 'Alphard', bayer: 'α Hya', constellation: 'Hydra', ra: 9.46, dec: -8.66, vMag: 1.99, color: '#fb923c', spectralClass: 'K' },
  { id: 'alhena', name: 'Alhena', bayer: 'γ Gem', constellation: 'Gemini', ra: 6.63, dec: 16.4, vMag: 1.93, color: '#f8fafc', spectralClass: 'A' },
  { id: 'tejat', name: 'Tejat Posterior', bayer: 'μ Gem', constellation: 'Gemini', ra: 6.38, dec: 22.51, vMag: 2.87, color: '#f87171', spectralClass: 'M' },
  { id: 'adhara', name: 'Adhara', bayer: 'ε CMa', constellation: 'Canis Major', ra: 6.98, dec: -28.97, vMag: 1.5, color: '#93c5fd', spectralClass: 'B' },
  { id: 'wezen', name: 'Wezen', bayer: 'δ CMa', constellation: 'Canis Major', ra: 7.14, dec: -26.39, vMag: 1.83, color: '#fef08a', spectralClass: 'F' },
  { id: 'murzim', name: 'Murzim', bayer: 'β CMa', constellation: 'Canis Major', ra: 6.38, dec: -17.96, vMag: 1.98, color: '#93c5fd', spectralClass: 'B' },
  { id: 'aludra', name: 'Aludra', bayer: 'η CMa', constellation: 'Canis Major', ra: 7.4, dec: -29.3, vMag: 2.45, color: '#93c5fd', spectralClass: 'B' },
];

export interface GalacticNode {
  raHours: number;
  decDeg: number;
  galacticLongitude: number;
  intensity: number;
  isNearCore: boolean;
}

export function generateGalacticEquatorNodes(): GalacticNode[] {
  const nodes: GalacticNode[] = [];
  const count = 96;
  const DEG2RAD = Math.PI / 180;
  const RAD2DEG = 180 / Math.PI;
  const alphaP = 192.85948 * DEG2RAD;
  const deltaP = 27.12825 * DEG2RAD;
  const l0 = 32.93192 * DEG2RAD;
  const sinDeltaP = Math.sin(deltaP);
  const cosDeltaP = Math.cos(deltaP);

  for (let i = 0; i < count; i++) {
    const lDeg = (i * 360) / count;
    const lRad = lDeg * DEG2RAD;
    const lDiff = lRad - l0;

    const sinDec = cosDeltaP * Math.sin(lDiff);
    const decRad = Math.asin(Math.max(-1, Math.min(1, sinDec)));
    const decDeg = decRad * RAD2DEG;

    const y = Math.cos(lDiff);
    const x = -sinDeltaP * Math.sin(lDiff);
    let alphaRad = alphaP + Math.atan2(y, x);
    let alphaDeg = alphaRad * RAD2DEG;
    alphaDeg = ((alphaDeg % 360) + 360) % 360;
    const raHours = alphaDeg / 15;

    const distToCore = Math.min(Math.abs(lDeg - 0), Math.abs(lDeg - 360));
    const isNearCore = distToCore < 35;
    const intensity = Math.max(0.35, 1.0 - Math.min(1.0, distToCore / 90) * 0.65);

    nodes.push({
      raHours,
      decDeg,
      galacticLongitude: lDeg,
      intensity,
      isNearCore,
    });
  }
  return nodes;
}

export interface GreatRiftNode {
  raHours: number;
  decDeg: number;
  widthArcmin: number;
  darkness: number;
}

export const GREAT_RIFT_DUST_LANES: GreatRiftNode[] = [
  { raHours: 20.85, decDeg: 43.5, widthArcmin: 160, darkness: 0.7 },
  { raHours: 20.55, decDeg: 38.2, widthArcmin: 190, darkness: 0.8 },
  { raHours: 20.2, decDeg: 33.0, widthArcmin: 220, darkness: 0.85 },
  { raHours: 19.85, decDeg: 26.5, widthArcmin: 240, darkness: 0.9 },
  { raHours: 19.5, decDeg: 19.8, widthArcmin: 260, darkness: 0.9 },
  { raHours: 19.2, decDeg: 12.5, widthArcmin: 280, darkness: 0.92 },
  { raHours: 18.9, decDeg: 5.0, widthArcmin: 300, darkness: 0.95 },
  { raHours: 18.6, decDeg: -2.5, widthArcmin: 320, darkness: 0.95 },
  { raHours: 18.3, decDeg: -10.0, widthArcmin: 340, darkness: 0.95 },
  { raHours: 18.05, decDeg: -18.5, widthArcmin: 360, darkness: 0.98 },
  { raHours: 17.8, decDeg: -26.0, widthArcmin: 380, darkness: 0.98 },
  { raHours: 17.5, decDeg: -32.5, widthArcmin: 350, darkness: 0.9 },
];

export interface MicroStarDust {
  raHours: number;
  decDeg: number;
  mag: number;
  brightness: number;
}

export function generateMicroStarDust(): MicroStarDust[] {
  const particles: MicroStarDust[] = [];
  const nodes = generateGalacticEquatorNodes();
  nodes.forEach((node, idx) => {
    for (let k = -1; k <= 1; k++) {
      const offsetDec = k * 1.8 + Math.sin(idx * 7 + k) * 1.2;
      const offsetRa = k * 0.15 + Math.cos(idx * 5 + k) * 0.1;
      const ra = (node.raHours + offsetRa + 24) % 24;
      const dec = Math.max(-85, Math.min(85, node.decDeg + offsetDec));
      const brightness = Math.max(0.15, Math.min(0.65, 0.25 + Math.sin(idx * 3 + k) * 0.2));
      particles.push({
        raHours: ra,
        decDeg: dec,
        mag: 5.5 + Math.abs(Math.sin(idx)) * 1.5,
        brightness,
      });
    }
  });
  return particles;
}

export interface ConstellationLine {
  constellation: string;
  stars: Array<[number, number]>;
}

export const CONSTELLATION_LINES: ConstellationLine[] = [
  {
    constellation: 'Orion',
    stars: [
      [5.92, 7.4],
      [5.42, 6.35],
      [5.6, -1.9],
      [5.24, -8.2],
      [5.79, -9.67],
      [5.92, 7.4],
    ],
  },
  {
    constellation: 'Orion Belt',
    stars: [
      [5.53, -0.3],
      [5.6, -1.2],
      [5.68, -1.94],
    ],
  },
  {
    constellation: 'Ursa Major',
    stars: [
      [11.06, 61.75],
      [11.03, 56.38],
      [11.9, 53.69],
      [12.25, 57.03],
      [12.9, 55.96],
      [13.4, 54.92],
      [13.79, 49.31],
    ],
  },
  {
    constellation: 'Ursa Major Bowl',
    stars: [
      [11.06, 61.75],
      [12.25, 57.03],
    ],
  },
  {
    constellation: 'Cassiopeia',
    stars: [
      [0.15, 59.15],
      [0.67, 56.54],
      [0.94, 60.72],
      [1.43, 60.23],
      [1.9, 63.67],
    ],
  },
  {
    constellation: 'Cygnus',
    stars: [
      [19.51, 27.96],
      [20.37, 40.26],
      [20.69, 45.28],
    ],
  },
  {
    constellation: 'Cygnus Wings',
    stars: [
      [19.75, 45.13],
      [20.37, 40.26],
      [20.77, 33.97],
    ],
  },
  {
    constellation: 'Taurus',
    stars: [
      [4.6, 16.51],
      [4.48, 15.6],
      [5.44, 28.61],
    ],
  },
  {
    constellation: 'Scorpius',
    stars: [
      [16.01, -22.62],
      [16.49, -26.43],
      [16.84, -34.29],
      [17.56, -37.1],
    ],
  },
  {
    constellation: 'Summer Triangle',
    stars: [
      [18.62, 38.78],
      [20.69, 45.28],
      [19.84, 8.87],
      [18.62, 38.78],
    ],
  },
];
