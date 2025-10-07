#!/usr/bin/env node

/**
 * Preview Blog Notification Email
 * 
 * This script generates a preview of the blog notification email
 * and opens it in your default browser for testing.
 */

const fs = require('fs');
const path = require('path');
const handlebars = require('handlebars');

// Sample data for preview
const sampleUser = {
  firstName: 'User',
  name: 'Sample User',
  email: 'user@example.com'
};

const samplePost = {
  title: 'Complete Guide to Yosemite National Park: Everything You Need to Know',
  slug: 'complete-guide-yosemite-national-park',
  excerpt: 'Discover the majestic beauty of Yosemite National Park with our comprehensive guide. From iconic landmarks like Half Dome and El Capitan to hidden gems and practical tips for your visit, this guide covers everything you need to plan the perfect Yosemite adventure.',
  featuredImage: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=600&h=200&fit=crop&crop=center',
  category: 'Park Guides',
  author: 'TrailVerse Team',
  readTime: 8,
  tags: ['Yosemite', 'California', 'Hiking', 'Photography']
};

// Template data
const templateData = {
  firstName: sampleUser.firstName || sampleUser.name,
  email: sampleUser.email,
  title: samplePost.title,
  excerpt: samplePost.excerpt,
  featuredImage: samplePost.featuredImage,
  category: samplePost.category,
  author: samplePost.author,
  authorInitials: 'TV',
  readTime: samplePost.readTime,
  tags: samplePost.tags,
  slug: samplePost.slug,
  
  // Common variables
  logoUrl: 'https://www.nationalparksexplorerusa.com/logo.png',
  websiteUrl: 'https://www.nationalparksexplorerusa.com',
  privacyUrl: 'https://www.nationalparksexplorerusa.com/privacy',
  termsUrl: 'https://www.nationalparksexplorerusa.com/terms',
  helpUrl: 'https://www.nationalparksexplorerusa.com/faq',
  dashboardUrl: 'https://www.nationalparksexplorerusa.com/profile',
  unsubscribeUrl: `https://www.nationalparksexplorerusa.com/unsubscribe?email=${sampleUser.email}`,
  supportEmail: 'trailverseteam@gmail.com'
};

async function generatePreview() {
  try {
    // Read the template
    const templatePath = path.join(__dirname, 'templates/emails', 'blog-notification.html');
    const templateContent = await fs.promises.readFile(templatePath, 'utf-8');
    
    // Compile template
    const template = handlebars.compile(templateContent);
    const html = template(templateData);
    
    // Write preview file
    const previewPath = path.join(__dirname, 'blog-email-preview.html');
    await fs.promises.writeFile(previewPath, html);
    
    console.log('✅ Blog notification email preview generated!');
    console.log(`📧 Preview saved to: ${previewPath}`);
    console.log('🌐 Open the file in your browser to see the preview');
    
    return previewPath;
  } catch (error) {
    console.error('❌ Error generating preview:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  generatePreview();
}

module.exports = { generatePreview, sampleUser, samplePost, templateData };
