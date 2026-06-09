export interface KVKRecord {
  name: string;
  district: string;
  division: 'Vidarbha' | 'Marathwada' | 'Konkan' | 'Khandesh' | 'Western Maharashtra';
  lat: number;
  lng: number;
  crops: string[];
  phone?: string;
  website?: string;
  source_id: string;
}

export interface KVKWithDistance extends KVKRecord {
  distance_km: number;
}

const MAHARASHTRA_KVKS: KVKRecord[] = [
  { name: 'KVK Gondia (PDKV)', district: 'Gondia', division: 'Vidarbha', lat: 21.462, lng: 80.197, crops: ['rice', 'soybean', 'gram'], phone: '07182-226237', website: 'https://kvkhiwra.pdkv.ac.in', source_id: 'kvk-gondia' },
  { name: 'KVK Bhandara', district: 'Bhandara', division: 'Vidarbha', lat: 21.166, lng: 79.650, crops: ['rice', 'soybean', 'cotton'], phone: '07184-252126', source_id: 'kvk-bhandara' },
  { name: 'KVK Nagpur (PDKV)', district: 'Nagpur', division: 'Vidarbha', lat: 21.148, lng: 79.088, crops: ['rice', 'orange', 'soybean'], website: 'https://kvknagpur.pdkv.ac.in', source_id: 'kvk-nagpur' },
  { name: 'KVK Chandrapur', district: 'Chandrapur', division: 'Vidarbha', lat: 19.962, lng: 79.300, crops: ['rice', 'cotton', 'soybean'], source_id: 'kvk-chandrapur' },
  { name: 'KVK Gadchiroli', district: 'Gadchiroli', division: 'Vidarbha', lat: 20.181, lng: 80.009, crops: ['rice', 'minor millets'], source_id: 'kvk-gadchiroli' },
  { name: 'KVK Amravati (PDKV)', district: 'Amravati', division: 'Vidarbha', lat: 20.932, lng: 77.769, crops: ['cotton', 'soybean', 'jowar'], phone: '0721-2662166', source_id: 'kvk-amravati' },
  { name: 'KVK Yavatmal', district: 'Yavatmal', division: 'Vidarbha', lat: 20.388, lng: 78.120, crops: ['cotton', 'jowar', 'soybean'], website: 'https://kvkyavatmal.icar.gov.in', source_id: 'kvk-yavatmal' },
  { name: 'KVK Wardha', district: 'Wardha', division: 'Vidarbha', lat: 20.745, lng: 78.602, crops: ['cotton', 'soybean', 'wheat'], source_id: 'kvk-wardha' },
  { name: 'KVK Washim', district: 'Washim', division: 'Vidarbha', lat: 20.113, lng: 77.143, crops: ['soybean', 'cotton', 'jowar'], source_id: 'kvk-washim' },
  { name: 'KVK Akola (PDKV)', district: 'Akola', division: 'Vidarbha', lat: 20.706, lng: 77.001, crops: ['cotton', 'soybean', 'wheat'], phone: '0724-2258396', website: 'https://kvkakola.pdkv.ac.in', source_id: 'kvk-akola' },
  { name: 'KVK Buldhana', district: 'Buldhana', division: 'Vidarbha', lat: 20.529, lng: 76.185, crops: ['cotton', 'soybean', 'jowar'], source_id: 'kvk-buldhana' },
  { name: 'KVK Aurangabad (VNMKV)', district: 'Aurangabad', division: 'Marathwada', lat: 19.877, lng: 75.343, crops: ['jowar', 'cotton', 'soybean'], phone: '0240-2370272', source_id: 'kvk-aurangabad' },
  { name: 'KVK Nanded', district: 'Nanded', division: 'Marathwada', lat: 19.152, lng: 77.322, crops: ['jowar', 'soybean', 'cotton'], source_id: 'kvk-nanded' },
  { name: 'KVK Latur', district: 'Latur', division: 'Marathwada', lat: 18.400, lng: 76.560, crops: ['soybean', 'jowar', 'tur'], source_id: 'kvk-latur' },
  { name: 'KVK Osmanabad', district: 'Osmanabad', division: 'Marathwada', lat: 18.186, lng: 76.039, crops: ['soybean', 'jowar', 'gram'], source_id: 'kvk-osmanabad' },
  { name: 'KVK Parbhani (VNMKV)', district: 'Parbhani', division: 'Marathwada', lat: 19.270, lng: 76.773, crops: ['cotton', 'jowar', 'pigeonpea'], website: 'https://www.vnmkv.ac.in', source_id: 'kvk-parbhani' },
  { name: 'KVK Jalna', district: 'Jalna', division: 'Marathwada', lat: 19.841, lng: 75.882, crops: ['cotton', 'jowar', 'moong'], source_id: 'kvk-jalna' },
  { name: 'KVK Beed', district: 'Beed', division: 'Marathwada', lat: 18.987, lng: 75.756, crops: ['sugarcane', 'jowar', 'soybean'], source_id: 'kvk-beed' },
  { name: 'KVK Hingoli', district: 'Hingoli', division: 'Marathwada', lat: 19.718, lng: 77.150, crops: ['jowar', 'cotton', 'soybean'], source_id: 'kvk-hingoli' },
  { name: 'KVK Raigad (DBSKKV)', district: 'Raigad', division: 'Konkan', lat: 18.516, lng: 73.197, crops: ['rice', 'cashew', 'coconut'], source_id: 'kvk-raigad' },
  { name: 'KVK Ratnagiri (DBSKKV)', district: 'Ratnagiri', division: 'Konkan', lat: 16.995, lng: 73.308, crops: ['rice', 'mango', 'cashew'], website: 'https://www.dbskkv.org', source_id: 'kvk-ratnagiri' },
  { name: 'KVK Sindhudurg', district: 'Sindhudurg', division: 'Konkan', lat: 16.349, lng: 73.661, crops: ['rice', 'cashew', 'kokum'], source_id: 'kvk-sindhudurg' },
  { name: 'KVK Thane', district: 'Thane', division: 'Konkan', lat: 19.218, lng: 72.978, crops: ['rice', 'vegetables'], source_id: 'kvk-thane' },
  { name: 'KVK Kolhapur (DBSKKV)', district: 'Kolhapur', division: 'Konkan', lat: 16.705, lng: 74.243, crops: ['rice', 'sugarcane', 'soybean'], source_id: 'kvk-kolhapur' },
  { name: 'KVK Jalgaon', district: 'Jalgaon', division: 'Khandesh', lat: 21.013, lng: 75.563, crops: ['banana', 'cotton', 'wheat'], website: 'https://www.kvkjalgaon.org', source_id: 'kvk-jalgaon' },
  { name: 'KVK Dhule', district: 'Dhule', division: 'Khandesh', lat: 20.901, lng: 74.777, crops: ['cotton', 'soybean', 'jowar'], source_id: 'kvk-dhule' },
  { name: 'KVK Nandurbar', district: 'Nandurbar', division: 'Khandesh', lat: 21.370, lng: 74.240, crops: ['maize', 'cotton', 'rice'], source_id: 'kvk-nandurbar' },
  { name: 'KVK Pune (MPKV)', district: 'Pune', division: 'Western Maharashtra', lat: 18.520, lng: 73.856, crops: ['wheat', 'soybean', 'sugarcane'], source_id: 'kvk-pune' },
  { name: 'KVK Nashik (YCMOU)', district: 'Nashik', division: 'Western Maharashtra', lat: 20.011, lng: 73.790, crops: ['wheat', 'onion', 'grapes'], website: 'https://www.kvknashik.org', source_id: 'kvk-nashik' },
  { name: 'KVK Ahmednagar (MPKV)', district: 'Ahmednagar', division: 'Western Maharashtra', lat: 19.094, lng: 74.743, crops: ['sugarcane', 'soybean', 'wheat'], phone: '0241-2777089', source_id: 'kvk-ahmednagar' },
  { name: 'KVK Solapur (MPKV)', district: 'Solapur', division: 'Western Maharashtra', lat: 17.686, lng: 75.906, crops: ['jowar', 'sugarcane', 'pomegranate'], source_id: 'kvk-solapur' },
  { name: 'KVK Satara', district: 'Satara', division: 'Western Maharashtra', lat: 17.686, lng: 73.994, crops: ['rice', 'soybean', 'strawberry'], source_id: 'kvk-satara' },
  { name: 'KVK Sangli', district: 'Sangli', division: 'Western Maharashtra', lat: 16.854, lng: 74.565, crops: ['sugarcane', 'grapes', 'turmeric'], source_id: 'kvk-sangli' },
];

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function findNearestKVK(lat: number, lng: number): KVKWithDistance | null {
  const results = MAHARASHTRA_KVKS
    .map((k) => ({ ...k, distance_km: Math.round(haversineM(lat, lng, k.lat, k.lng) / 100) / 10 }))
    .sort((a, b) => a.distance_km - b.distance_km);
  return results[0] ?? null;
}
