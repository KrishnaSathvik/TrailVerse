#!/usr/bin/env node

/**
 * Script to update existing favorites with correct image URLs
 * This script fetches park data from NPS API and updates favorites that don't have imageUrl set
 */

const mongoose = require('mongoose');
const Favorite = require('../src/models/Favorite');
const npsService = require('../src/services/npsService');
require('dotenv').config();

const updateFavoriteImages = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/npe-usa');
    console.log('Connected to MongoDB');

    // Find favorites without imageUrl or with empty imageUrl
    const favoritesWithoutImages = await Favorite.find({
      $or: [
        { imageUrl: { $exists: false } },
        { imageUrl: '' },
        { imageUrl: null }
      ]
    });

    console.log(`Found ${favoritesWithoutImages.length} favorites without images`);

    if (favoritesWithoutImages.length === 0) {
      console.log('No favorites need updating');
      return;
    }

    let updatedCount = 0;
    let errorCount = 0;

    // Process each favorite
    for (const favorite of favoritesWithoutImages) {
      try {
        console.log(`Updating favorite for park: ${favorite.parkCode} - ${favorite.parkName}`);
        
        // Fetch park data from NPS API
        const parkData = await npsService.getParkByCode(favorite.parkCode);
        
        if (parkData && parkData.images && parkData.images.length > 0) {
          // Update the favorite with the first image URL
          favorite.imageUrl = parkData.images[0].url;
          await favorite.save();
          updatedCount++;
          console.log(`✅ Updated ${favorite.parkCode} with image: ${parkData.images[0].url}`);
        } else {
          console.log(`⚠️  No images found for park: ${favorite.parkCode}`);
        }

        // Add a small delay to avoid overwhelming the NPS API
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`❌ Error updating favorite for ${favorite.parkCode}:`, error.message);
        errorCount++;
      }
    }

    console.log(`\n📊 Update Summary:`);
    console.log(`✅ Successfully updated: ${updatedCount} favorites`);
    console.log(`❌ Errors: ${errorCount} favorites`);
    console.log(`📝 Total processed: ${favoritesWithoutImages.length} favorites`);

  } catch (error) {
    console.error('Script error:', error);
  } finally {
    // Close database connection
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
};

// Run the script
if (require.main === module) {
  updateFavoriteImages();
}

module.exports = updateFavoriteImages;
