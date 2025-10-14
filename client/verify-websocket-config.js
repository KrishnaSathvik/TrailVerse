#!/usr/bin/env node

/**
 * WebSocket Configuration Verification Script
 * Run this to verify your WebSocket environment variables are set correctly
 */

const fs = require('fs');
const path = require('path');

console.log('\n🔍 WebSocket Configuration Verification\n');
console.log('=' .repeat(50));

// Check if .env files exist
const envPath = path.join(__dirname, '.env');
const envProdPath = path.join(__dirname, '.env.production');

console.log('\n📁 Checking environment files...\n');

if (fs.existsSync(envPath)) {
  console.log('✅ .env file exists');
  const envContent = fs.readFileSync(envPath, 'utf-8');
  if (envContent.includes('VITE_WS_URL')) {
    const match = envContent.match(/VITE_WS_URL=(.+)/);
    if (match) {
      console.log(`   VITE_WS_URL=${match[1]}`);
    }
  } else {
    console.log('⚠️  VITE_WS_URL not found in .env');
    console.log('   Add: VITE_WS_URL=http://localhost:5001');
  }
} else {
  console.log('⚠️  .env file not found');
  console.log('   Copy env.example to .env and configure it');
}

if (fs.existsSync(envProdPath)) {
  console.log('✅ .env.production file exists');
  const envProdContent = fs.readFileSync(envProdPath, 'utf-8');
  if (envProdContent.includes('VITE_WS_URL')) {
    const match = envProdContent.match(/VITE_WS_URL=(.+)/);
    if (match) {
      console.log(`   VITE_WS_URL=${match[1]}`);
    }
  } else {
    console.log('⚠️  VITE_WS_URL not found in .env.production');
    console.log('   Add: VITE_WS_URL=https://trailverse.onrender.com');
  }
} else {
  console.log('⚠️  .env.production file not found');
  console.log('   Copy env.production.example to .env.production and configure it');
}

console.log('\n📋 Configuration Requirements:\n');
console.log('Development:');
console.log('  VITE_WS_URL=http://localhost:5001');
console.log('  VITE_API_URL=http://localhost:5001/api\n');

console.log('Production (Vercel):');
console.log('  VITE_WS_URL=https://trailverse.onrender.com');
console.log('  VITE_API_URL=/api\n');

console.log('=' .repeat(50));
console.log('\n📚 For more information, see WEBSOCKET_PRODUCTION_FIX.md\n');

// Check vercel.json
const vercelJsonPath = path.join(__dirname, 'vercel.json');
if (fs.existsSync(vercelJsonPath)) {
  console.log('✅ vercel.json exists');
  const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf-8'));
  if (vercelConfig.rewrites) {
    const apiRewrite = vercelConfig.rewrites.find(r => r.source === '/api/(.*)');
    if (apiRewrite) {
      console.log(`   API proxy: ${apiRewrite.destination}`);
      console.log('   ℹ️  Note: WebSocket connections bypass this proxy\n');
    }
  }
} else {
  console.log('⚠️  vercel.json not found\n');
}

console.log('🎯 Next Steps:\n');
console.log('1. Set VITE_WS_URL in Vercel environment variables');
console.log('2. Redeploy your frontend');
console.log('3. Ensure Render backend is running');
console.log('4. Test WebSocket connection in browser console\n');

