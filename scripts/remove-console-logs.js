#!/usr/bin/env node

/**
 * Script to remove or replace console.log statements
 * Usage: node scripts/remove-console-logs.js [--replace-with-logger]
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const args = process.argv.slice(2);
const replaceWithLogger = args.includes('--replace-with-logger');

// Files to process
const patterns = [
  'client/src/**/*.js',
  'client/src/**/*.jsx',
  'client/src/**/*.ts',
  'client/src/**/*.tsx'
];

// Console methods to handle
const consoleMethods = ['log', 'warn', 'info', 'debug'];

function processFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    consoleMethods.forEach(method => {
      const regex = new RegExp(`console\\.${method}\\s*\\([^)]*\\);?`, 'g');
      const matches = content.match(regex);
      
      if (matches) {
        if (replaceWithLogger) {
          // Replace with logger utility
          content = content.replace(regex, `logger.${method}($1);`);
          content = content.replace(/import logger from/g, 'import logger from');
          if (!content.includes('import logger from')) {
            content = `import logger from '../utils/logger';\n${content}`;
          }
        } else {
          // Remove console statements
          content = content.replace(regex, '');
        }
        modified = true;
      }
    });

    if (modified) {
      fs.writeFileSync(filePath, content);
      console.log(`✅ Processed: ${filePath}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return false;
  }
}

function main() {
  console.log('🔍 Searching for console statements...');
  
  let totalFiles = 0;
  let processedFiles = 0;

  patterns.forEach(pattern => {
    const files = glob.sync(pattern, { cwd: process.cwd() });
    totalFiles += files.length;
    
    files.forEach(file => {
      const fullPath = path.resolve(process.cwd(), file);
      if (processFile(fullPath)) {
        processedFiles++;
      }
    });
  });

  console.log(`\n📊 Summary:`);
  console.log(`   Total files scanned: ${totalFiles}`);
  console.log(`   Files modified: ${processedFiles}`);
  console.log(`   Method: ${replaceWithLogger ? 'Replace with logger' : 'Remove console statements'}`);
}

main();
