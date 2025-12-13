#!/usr/bin/env tsx
/**
 * Script to create Abe's farm and update Jash's farm name
 * 
 * Usage: npx tsx scripts/create-abe-farm.ts
 * 
 * Make sure to set environment variables:
 * - VITE_SUPABASE_URL or SUPABASE_URL
 * - VITE_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { circle, bbox, area } from '@turf/turf';

// Get Supabase credentials from environment
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Error: Missing Supabase credentials');
  console.error('   Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Helper functions
function calculateBounds(coordinates: number[][][]): {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
} {
  const allCoords = coordinates[0];
  const lngs = allCoords.map(c => c[0]);
  const lats = allCoords.map(c => c[1]);
  
  return {
    minLng: Math.min(...lngs),
    minLat: Math.min(...lats),
    maxLng: Math.max(...lngs),
    maxLat: Math.max(...lats),
  };
}

function calculateArea(geojson: { type: 'Polygon'; coordinates: number[][][] }): number {
  try {
    const areaSquareMeters = area(geojson);
    return areaSquareMeters / 10000; // Convert to hectares
  } catch (error) {
    console.warn('Error calculating area:', error);
    const [minX, minY, maxX, maxY] = bbox(geojson) as [number, number, number, number];
    const lat = (minY + maxY) / 2;
    const latMeters = (maxY - minY) * 111000;
    const lngMeters = (maxX - minX) * 111000 * Math.cos((lat * Math.PI) / 180);
    const areaMeters = latMeters * lngMeters;
    return areaMeters / 10000;
  }
}

function createCircularFarm(
  center: [number, number],
  radiusInMeters: number,
  name: string,
  steps: number = 64
) {
  const radiusInKm = radiusInMeters / 1000;
  const circleFeature = circle(center, radiusInKm, { steps, units: 'kilometers' });
  const coordinates = circleFeature.geometry.coordinates;
  const bounds = calculateBounds(coordinates);
  const area_hectares = calculateArea(circleFeature.geometry);
  
  return {
    name,
    geometry: {
      type: 'Polygon',
      coordinates,
    },
    bounds,
    area_hectares,
  };
}

async function getAllFarms() {
  const { data, error } = await supabase
    .from('farms')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

async function saveFarm(farmData: any) {
  const { data, error } = await supabase
    .from('farms')
    .insert(farmData)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

async function updateFarmName(id: string, name: string) {
  const { data, error } = await supabase
    .from('farms')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

async function main() {
  console.log('🚜 Setting up farms...\n');

  try {
    // Step 1: Get all existing farms
    console.log('📋 Fetching existing farms...');
    const existingFarms = await getAllFarms();
    console.log(`Found ${existingFarms.length} existing farm(s)\n`);

    // Step 2: Update existing farm names to "Jash's farm"
    console.log('🔄 Updating existing farm names...');
    for (const farm of existingFarms) {
      const farmName = farm.name.toLowerCase();
      if (farmName.includes('jash') && !farmName.includes("jash's")) {
        console.log(`  Updating "${farm.name}" to "Jash's farm"...`);
        const updated = await updateFarmName(farm.id, "Jash's farm");
        if (updated) {
          console.log(`  ✅ Updated farm ${farm.id} to "Jash's farm"\n`);
        } else {
          console.log(`  ⚠️  Failed to update farm ${farm.id}\n`);
        }
      } else if (farmName === "jash's farm") {
        console.log(`  ✅ Farm "${farm.name}" already has correct name\n`);
      }
    }

    // Step 3: Check if Abe's farm already exists
    const abesFarm = existingFarms.find(f => 
      f.name.toLowerCase().includes("abe") || 
      f.name.toLowerCase().includes("abe's")
    );

    if (abesFarm) {
      console.log(`⚠️  Found existing farm "${abesFarm.name}" (ID: ${abesFarm.id})`);
      console.log('   Skipping creation of Abe\'s farm.\n');
    } else {
      // Step 4: Create Abe's farm with circular boundary
      console.log('🌾 Creating Abe\'s farm...');
      console.log('   Center: 40.672175, -78.057155');
      console.log('   Radius: 500 meters\n');

      const abesFarmData = createCircularFarm(
        [-78.057155, 40.672175], // [lng, lat] format
        500, // 500 meters
        "Abe's farm"
      );

      const savedFarm = await saveFarm(abesFarmData);

      if (savedFarm) {
        console.log(`✅ Successfully created Abe's farm!`);
        console.log(`   ID: ${savedFarm.id}`);
        console.log(`   Name: ${savedFarm.name}`);
        console.log(`   Area: ${savedFarm.area_hectares?.toFixed(4)} hectares`);
        console.log(`   Bounds:`, savedFarm.bounds);
        console.log(`   Coordinates count: ${savedFarm.geometry.coordinates[0].length} points\n`);

        // Step 5: Display the coordinates (indices) for the circle
        console.log('📍 Circle boundary coordinates (first 10 and last 10):');
        const coords = savedFarm.geometry.coordinates[0];
        const first10 = coords.slice(0, 10);
        const last10 = coords.slice(-10);
        
        console.log('   First 10 coordinates:');
        first10.forEach((coord, i) => {
          console.log(`     ${i + 1}. [${coord[0]}, ${coord[1]}]`);
        });
        console.log('   ...');
        console.log('   Last 10 coordinates:');
        last10.forEach((coord, i) => {
          console.log(`     ${coords.length - 10 + i + 1}. [${coord[0]}, ${coord[1]}]`);
        });
        console.log(`\n   Total coordinates: ${coords.length}`);
        console.log(`   Full coordinates array:`, coords);
      } else {
        console.error('❌ Failed to create Abe\'s farm');
        process.exit(1);
      }
    }

    // Step 6: Summary
    console.log('\n📊 Summary:');
    const allFarms = await getAllFarms();
    allFarms.forEach(farm => {
      console.log(`   - ${farm.name} (ID: ${farm.id})`);
    });

    console.log('\n✅ Setup complete!\n');
    console.log('💡 To fetch indices for Abe\'s farm, use the agricultural-indices API');
    console.log('   with the farm_id parameter set to the farm ID shown above.\n');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();

