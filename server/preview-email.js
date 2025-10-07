#!/usr/bin/env node

/**
 * Email Template Preview Generator
 * Generates HTML previews of email templates for testing
 */

require('dotenv').config({ path: './.env.development' });
const handlebars = require('handlebars');
const fs = require('fs').promises;
const path = require('path');

async function previewEmail(templateName) {
  try {
    const templatePath = path.join(__dirname, 'templates/emails', `${templateName}.html`);
    const templateContent = await fs.readFile(templatePath, 'utf-8');
    const template = handlebars.compile(templateContent);
    
    // Sample data for preview
    const sampleData = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      logoUrl: 'https://www.nationalparksexplorerusa.com/logo192.png',
      websiteUrl: 'https://www.nationalparksexplorerusa.com',
      privacyUrl: 'https://www.nationalparksexplorerusa.com/privacy',
      termsUrl: 'https://www.nationalparksexplorerusa.com/terms',
      helpUrl: 'https://www.nationalparksexplorerusa.com/faq',
      dashboardUrl: 'https://www.nationalparksexplorerusa.com/profile',
      verificationUrl: 'https://www.nationalparksexplorerusa.com/verify-email?token=abc123def456',
      resetUrl: 'https://www.nationalparksexplorerusa.com/reset-password?token=xyz789uvw012',
      twitterUrl: 'https://twitter.com/TrailVerse',
      instagramUrl: 'https://instagram.com/trailverse',
      facebookUrl: 'https://facebook.com/trailverse',
      unsubscribeUrl: 'https://www.nationalparksexplorerusa.com/unsubscribe?email=john.doe@example.com'
    };
    
    const html = template(sampleData);
    
    const previewPath = path.join(__dirname, 'templates/emails', `preview-${templateName}.html`);
    await fs.writeFile(previewPath, html);
    
    console.log(`✅ Preview generated: ${previewPath}`);
    console.log(`🌐 Open in browser: file://${previewPath}`);
    
  } catch (error) {
    console.error('❌ Error generating preview:', error.message);
  }
}

async function generateAllPreviews() {
  const templates = ['welcome', 'email-verification', 'password-reset'];
  
  console.log('🎨 Generating email template previews...\n');
  
  for (const template of templates) {
    await previewEmail(template);
  }
  
  console.log('\n🎉 All previews generated!');
  console.log('\n📁 Preview files:');
  console.log('   - templates/emails/preview-welcome.html');
  console.log('   - templates/emails/preview-email-verification.html');
  console.log('   - templates/emails/preview-password-reset.html');
  console.log('\n💡 Open these files in your browser to see how the emails look!');
}

// Get template name from command line argument
const templateName = process.argv[2];

if (templateName) {
  previewEmail(templateName);
} else {
  generateAllPreviews();
}
