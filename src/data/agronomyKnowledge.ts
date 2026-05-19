export type AdvisoryCrop = 'rice' | 'millet';
export type AdvisorySeason = 'kharif' | 'rabi';

export interface AgronomySource {
  name: string;
  url: string;
  institution: string;
}

export interface AgronomyKnowledgeChunk {
  id: string;
  crop: AdvisoryCrop | 'all';
  seasons: AdvisorySeason[];
  region: 'maharashtra' | 'india';
  tags: string[];
  title: string;
  summary: string;
  actions: string[];
  source: AgronomySource;
}

export const CROP_OPTIONS: Array<{ value: AdvisoryCrop; label: string; description: string }> = [
  {
    value: 'rice',
    label: 'Rice / Paddy',
    description: 'Kharif paddy, direct seeded rice, and irrigated rice decisions',
  },
  {
    value: 'millet',
    label: 'Millets',
    description: 'Jowar, bajra, ragi, and small millet field guidance',
  },
];

export const SEASON_OPTIONS: Array<{ value: AdvisorySeason; label: string; description: string }> = [
  {
    value: 'kharif',
    label: 'Kharif',
    description: 'Monsoon season, usually June to October in Maharashtra',
  },
  {
    value: 'rabi',
    label: 'Rabi',
    description: 'Post-monsoon/winter season, usually October to March',
  },
];

export const AGRONOMY_KNOWLEDGE: AgronomyKnowledgeChunk[] = [
  {
    id: 'icar-maharashtra-soils',
    crop: 'all',
    seasons: ['kharif', 'rabi'],
    region: 'maharashtra',
    tags: ['soil', 'nitrogen', 'phosphorus', 'zinc', 'sulphur', 'nutrient'],
    title: 'Maharashtra nutrient constraints',
    summary:
      'ICAR notes that Maharashtra agriculture is highly rainfall dependent, and many soils are shallow with nitrogen, phosphorus, zinc, and sulphur deficiencies. Site-specific nutrient management and rainwater harvesting/protective irrigation are priority interventions.',
    actions: [
      'Treat satellite NPK as a zone-finding signal, then confirm rates with soil testing.',
      'When nutrient stress overlaps drought stress, correct moisture first or fertilizer response may be weak.',
      'Check zinc/sulphur symptoms when crop health remains low despite NPK correction.',
    ],
    source: {
      name: 'Maharashtra agricultural profile',
      institution: 'ICAR',
      url: 'https://www.icar.gov.in/index.php/en/node/17272',
    },
  },
  {
    id: 'imd-agromet-weather',
    crop: 'all',
    seasons: ['kharif', 'rabi'],
    region: 'india',
    tags: ['weather', 'rain', 'wind', 'heat', 'agromet'],
    title: 'Weather-aware agromet advisories',
    summary:
      'IMD provides district/state agromet bulletins, weather warnings, district weather forecasts, KALP location-specific advisory products, and Meghdoot/Damini advisory channels. Field operations should be adjusted around rain, thunderstorm, wind, and heat risk.',
    actions: [
      'Avoid fertilizer, pesticide, or herbicide spray before heavy rain or high wind.',
      'Use short-range rainfall forecast to time irrigation, top dressing, and drainage checks.',
      'For lightning/thunderstorm days, prioritize worker safety and postpone exposed field operations.',
    ],
    source: {
      name: 'Agromet advisory services',
      institution: 'India Meteorological Department',
      url: 'https://mausam.imd.gov.in/responsive/agromet_adv_ser_block_current_en.php',
    },
  },
  {
    id: 'rice-aerobic-iirr',
    crop: 'rice',
    seasons: ['kharif', 'rabi'],
    region: 'india',
    tags: ['rice', 'water', 'direct-seeded', 'establishment', 'drought'],
    title: 'Aerobic/direct-seeded rice under water limits',
    summary:
      'ICAR-IIRR describes aerobic rice as a rice system for non-flooded aerobic soils where water shortage limits lowland rice. Recommended practices include drought-tolerant short-duration varieties, well-prepared fields, drill/dibble sowing, and early weed control.',
    actions: [
      'If forecast rain is weak and moisture stress is detected, avoid transplanting shock; prefer direct seeding/aerobic management where locally suitable.',
      'Keep establishment moisture steady and scout weeds early because DSR/aerobic rice is more weed-sensitive.',
      'Use short-duration and drought-tolerant varieties in water-limited fields.',
    ],
    source: {
      name: 'Aerobic system of rice cultivation',
      institution: 'ICAR-Indian Institute of Rice Research',
      url: 'https://www.icar-iirr.org/index.php/en/component/content/article/33-iirr-technologies/116-technology-13',
    },
  },
  {
    id: 'rice-dsr-nrri',
    crop: 'rice',
    seasons: ['kharif'],
    region: 'india',
    tags: ['rice', 'water', 'direct-seeded', 'nutrient', 'irrigation'],
    title: 'Direct seeded rice climate resilience',
    summary:
      'ICAR-NRRI promotes direct seeded rice as a climate-resilient option and highlights sensor-based irrigation scheduling for improving water productivity under DSR.',
    actions: [
      'Under low moisture or delayed monsoon, use weather forecast to protect the first 20 days after sowing.',
      'Keep DSR near field capacity during establishment; do not let dry stress appear before tillering.',
      'If rain is expected, shift urea top-dressing until after runoff risk passes.',
    ],
    source: {
      name: 'Direct Seeded Rice: A Technology for Enhancing Climate Resilience',
      institution: 'ICAR-National Rice Research Institute',
      url: 'https://icar-nrri.in/wp-content/uploads/2024/08/NRRI_Research-Bulletin-No-50.pdf',
    },
  },
  {
    id: 'rice-paddy-kvk-gondia',
    crop: 'rice',
    seasons: ['kharif'],
    region: 'maharashtra',
    tags: ['rice', 'paddy', 'maharashtra', 'package'],
    title: 'Vidarbha paddy package source',
    summary:
      'PDKV KVK Hiwara, Gondia maintains a paddy package-of-practices resource for local Maharashtra extension use. Use it as the local package anchor for rice/paddy recommendations.',
    actions: [
      'For paddy in eastern Maharashtra/Vidarbha, align operations with local KVK package and district agromet bulletin.',
      'Prefer local variety, nursery, and plant-protection guidance from the nearest KVK when satellite stress appears.',
      'Use diagnostics to pick zones for scouting rather than changing fertilizer uniformly across the whole field.',
    ],
    source: {
      name: 'Paddy package of practices',
      institution: 'KVK Hiwara, Gondia / PDKV Akola',
      url: 'https://kvkhiwra.pdkv.ac.in/?page_id=858',
    },
  },
  {
    id: 'millets-iimr-mandate',
    crop: 'millet',
    seasons: ['kharif', 'rabi'],
    region: 'india',
    tags: ['millet', 'climate-resilient', 'sorghum', 'pearl-millet', 'small-millet'],
    title: 'ICAR-IIMR millet focus',
    summary:
      'ICAR-IIMR coordinates national millet research across sorghum, pearl millet, and small millets, focusing on improved production technologies, resilience, value addition, and farmer capacity building.',
    actions: [
      'For mixed millet situations, identify the actual crop: jowar/sorghum, bajra/pearl millet, ragi/finger millet, or small millet.',
      'Use locally released varieties and local KVK seed guidance before sowing.',
      'Prioritize drought resilience and weed control when early-season NDVI/moisture is weak.',
    ],
    source: {
      name: 'ICAR-IIMR overview',
      institution: 'ICAR-Indian Institute of Millets Research',
      url: 'https://www.millets.res.in/',
    },
  },
  {
    id: 'millet-rabi-sorghum-mpkv',
    crop: 'millet',
    seasons: ['rabi'],
    region: 'maharashtra',
    tags: ['sorghum', 'jowar', 'rabi', 'moisture', 'potassium', 'nutrient'],
    title: 'Rabi sorghum in Maharashtra scarcity zones',
    summary:
      'MPKV recommendations for rabi sorghum in western Maharashtra emphasize in-situ moisture conservation, soil-depth-based seed selection, proper sowing time from mid-September to mid-October, thinning/hoeing, integrated nutrient management, and integrated pest management. MPKV also recommends potassium addition with N:P fertilizer on medium deep Inceptisols in scarcity zones.',
    actions: [
      'For rabi jowar, protect stored monsoon moisture through compartmental bunding and timely sowing at optimum moisture.',
      'If potassium stress overlaps dry weather, prioritize moisture conservation and consider soil-test-based K correction.',
      'Plan thinning and 2-3 hoeings early to reduce weed competition for conserved moisture.',
    ],
    source: {
      name: 'Sorghum research recommendations',
      institution: 'Mahatma Phule Krishi Vidyapeeth, Rahuri',
      url: 'https://mpkv.ac.in/Uploads/Research/3.%20Sorghum_20200110053526.pdf',
    },
  },
  {
    id: 'millet-kharif-sorghum-kvk-yavatmal',
    crop: 'millet',
    seasons: ['kharif'],
    region: 'maharashtra',
    tags: ['sorghum', 'jowar', 'kharif', 'fertilizer', 'weed', 'irrigation'],
    title: 'Jowar package from Yavatmal KVK',
    summary:
      'KVK Yavatmal describes jowar as an important cereal/fodder crop in Vidarbha. Its local guidance includes FYM/compost incorporation, soil-test-based fertilizer, split nitrogen, thinning, weed-free early growth, and irrigation at key stages when summer/irrigated sorghum is grown.',
    actions: [
      'Keep the crop weed-free during the first 40-45 days after sowing.',
      'Split nitrogen: basal plus top dressing around 25-30 days after sowing when moisture is available.',
      'If rainfall is forecast, avoid top dressing immediately before runoff risk.',
    ],
    source: {
      name: 'Jowar cultivation technology',
      institution: 'KVK Yavatmal / PDKV Akola',
      url: 'https://kvkyavatmal.pdkv.ac.in/?page_id=1110',
    },
  },
];
