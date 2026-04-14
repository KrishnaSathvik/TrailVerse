const mongoose = require('mongoose');

const siteSettingsSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: 'singleton'
  },
  siteName: { type: String, default: 'TrailVerse' },
  siteDescription: { type: String, default: 'National Parks Explorer' },
  contactEmail: { type: String, default: 'trailverseteam@gmail.com' },
  supportEmail: { type: String, default: 'trailverseteam@gmail.com' },
  emailProvider: { type: String, default: 'gmail' },
  emailFromName: { type: String, default: 'TrailVerse' },
  emailFromAddress: { type: String, default: 'trailverseteam@gmail.com' },
  sessionTimeout: { type: Number, default: 24 },
  maxLoginAttempts: { type: Number, default: 5 },
  requireEmailVerification: { type: Boolean, default: true },
  enableTwoFactor: { type: Boolean, default: false },
  enableBlog: { type: Boolean, default: true },
  enableEvents: { type: Boolean, default: true },
  enableReviews: { type: Boolean, default: true },
  enableAI: { type: Boolean, default: true },
  enableAnalytics: { type: Boolean, default: true },
  npsApiKey: { type: String, default: '' },
  openWeatherApiKey: { type: String, default: '' },
  googleAnalyticsId: { type: String, default: '' },
  maintenanceMode: { type: Boolean, default: false },
  maintenanceMessage: { type: String, default: 'We are currently performing maintenance. Please check back soon.' }
}, {
  timestamps: true
});

// Static: get or create the singleton
siteSettingsSchema.statics.getSettings = async function () {
  let settings = await this.findById('singleton').lean();
  if (!settings) {
    settings = await this.create({ _id: 'singleton' });
    settings = settings.toObject();
  }
  return settings;
};

// Static: upsert settings
siteSettingsSchema.statics.updateSettings = async function (data) {
  // Strip internal fields
  const { _id, __v, createdAt, updatedAt, ...updateData } = data;
  const settings = await this.findByIdAndUpdate(
    'singleton',
    { $set: updateData },
    { new: true, upsert: true, runValidators: true }
  ).lean();
  return settings;
};

// Static: reset to defaults
siteSettingsSchema.statics.resetToDefaults = async function () {
  await this.deleteOne({ _id: 'singleton' });
  const settings = await this.create({ _id: 'singleton' });
  return settings.toObject();
};

module.exports = mongoose.model('SiteSettings', siteSettingsSchema);
