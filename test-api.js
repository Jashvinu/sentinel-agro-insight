#!/usr/bin/env node

/**
 * Test script for Agricultural Indices API
 * Run with: node test-api.js
 */

const BASE_URL = 'http://localhost:3001/api';

async function testEndpoint(endpoint, params = {}) {
    const url = new URL(`${BASE_URL}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
    });

    console.log(`\n🔍 Testing: ${url.toString()}`);

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (response.ok) {
            console.log('✅ Success:', response.status);
            console.log('📊 Response keys:', Object.keys(data));

            if (data.success) {
                console.log('🎯 Map ID:', data.mapid);
                console.log('🔑 Token:', data.token ? 'Present' : 'Missing');
                console.log('📅 Date Range:', data.metadata?.dateRange);
                console.log('🧮 Algorithm:', data.metadata?.algorithm);
            }
        } else {
            console.log('❌ Error:', response.status);
            console.log('📝 Message:', data.message || 'No error message');
        }
    } catch (error) {
        console.log('💥 Network Error:', error.message);
    }
}

async function runTests() {
    console.log('🚀 Starting API Tests...\n');

    // Test health endpoint
    await testEndpoint('/health');

    // Test agricultural indices with different parameters
    await testEndpoint('/agricultural-indices');
    await testEndpoint('/agricultural-indices', { index: 'ndvi' });
    await testEndpoint('/agricultural-indices', { index: 'nitrogen' });
    await testEndpoint('/agricultural-indices', {
        index: 'evi',
        start: '2024-06-01',
        end: '2024-08-31'
    });

    // Test legacy endpoint
    await testEndpoint('/ee', { index: 'msavi' });

    // Test Earth Engine test endpoint
    await testEndpoint('/ee-test');

    console.log('\n✨ API Tests Complete!');
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runTests().catch(console.error);
}

export { testEndpoint, runTests };
