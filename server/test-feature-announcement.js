const resendEmailService = require('./src/services/resendEmailService');

async function testFeatureAnnouncement() {
  try {
    console.log('🧪 Testing Feature Announcement Email...\n');

    // Test user data
    const testUser = {
      firstName: 'Krishna',
      name: 'Krishna Sathvik',
      email: 'krishnasathvikmantripragada@gmail.com'
    };

    console.log('📧 Sending feature announcement email to:', testUser.email);
    
    // Send the email
    const result = await resendEmailService.sendFeatureAnnouncementEmail(testUser);
    
    console.log('✅ Feature announcement email sent successfully!');
    console.log('📊 Result:', result);
    
  } catch (error) {
    console.error('❌ Error testing feature announcement email:', error);
  }
}

// Run the test
testFeatureAnnouncement();
