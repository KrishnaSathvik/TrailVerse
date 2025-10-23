import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
  Tailwind,
} from '@react-email/components';
import * as React from 'react';

const AccountDeletionEmail = ({
  username = 'there',
  userEmail = 'user@example.com',
  deletionDate = 'January 15, 2025',
  dataRetentionPeriod = '30 days',
  reactivationUrl = 'https://nationalparksexplorerusa.com/reactivate?token=abc123',
  supportEmail = 'trailverseteam@gmail.com',
}) => {
  const previewText = `Your TrailVerse account has been deleted - ${username}`;
  
  // Format deletion date properly
  const formattedDeletionDate = deletionDate instanceof Date 
    ? deletionDate.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })
    : deletionDate;

  return (
    <Html>
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Head />
        <Body className="bg-gray-50 font-sans">
          <Container className="bg-white mx-auto my-0 max-w-[600px]">
            {/* Header */}
            <Section className="bg-gray-600 py-12 px-8 text-center">
              <Img
                src="https://www.nationalparksexplorerusa.com/android-chrome-192x192.png"
                width="64"
                height="64"
                alt="TrailVerse"
                className="mx-auto mb-6 rounded-xl"
              />
              <Heading className="text-white text-3xl font-bold m-0 mb-3">
                Account Deleted
              </Heading>
              <Text className="text-gray-100 text-lg m-0">
                We're sorry to see you go
              </Text>
            </Section>

            {/* Main Content */}
            <Section className="px-8 py-10">
              <div className="text-center mb-8">
                <Text className="text-gray-900 text-2xl font-bold m-0 mb-4">
                  Hi {username},
                </Text>
                <Text className="text-gray-600 text-lg leading-relaxed m-0 max-w-2xl mx-auto">
                  We're writing to confirm that your TrailVerse account associated with <strong className="text-gray-800">{userEmail}</strong> 
                  has been successfully deleted as of {formattedDeletionDate}.
                </Text>
              </div>

              {/* Farewell Message */}
              <div className="bg-gray-50 rounded-xl p-8 mb-10 border border-gray-200 text-center">
                <Text className="text-gray-800 text-xl font-bold mb-4">
                  Thank you for being part of our community
                </Text>
                <Text className="text-gray-600 text-base m-0">
                  We're sorry to see you go, but we respect your decision. Your account and all associated data have been permanently removed from our systems. 
                  We hope you enjoyed exploring America's national parks with us!
                </Text>
              </div>

              {/* Important Notice */}
              <div className="bg-yellow-50 border-l-4 border-yellow-400 rounded-xl p-6 mb-10 text-center">
                <Text className="text-yellow-600 text-2xl mb-3">⚠️</Text>
                <Text className="text-yellow-900 text-lg font-bold m-0 mb-2">
                  Important Information
                </Text>
                <Text className="text-yellow-800 text-base m-0">
                  Your account data will be retained for <strong>{dataRetentionPeriod}</strong> for security and legal purposes, 
                  after which it will be permanently deleted. This action cannot be undone.
                </Text>
              </div>

              {/* What Was Deleted */}
              <div className="mb-10">
                <Text className="text-gray-900 text-xl font-bold text-center m-0 mb-6">
                  What was deleted:
                </Text>
                
                <div className="space-y-4">
                  {[
                    {
                      icon: '👤',
                      title: 'Personal Profile',
                      description: 'Your account information and personal details'
                    },
                    {
                      icon: '⭐',
                      title: 'Saved Parks',
                      description: 'All your favorite parks and wish lists'
                    },
                    {
                      icon: '📝',
                      title: 'Reviews & Experiences',
                      description: 'Your park reviews and shared experiences'
                    },
                    {
                      icon: '📧',
                      title: 'Email Preferences',
                      description: 'Notification settings and email preferences'
                    },
                    {
                      icon: '🔐',
                      title: 'Login Credentials',
                      description: 'Authentication data and security information'
                    }
                  ].map((item, index) => (
                    <div key={index} className="bg-gray-50 rounded-xl p-6 border border-gray-200 text-center">
                      <Text className="text-3xl m-0 mb-3">{item.icon}</Text>
                      <Text className="text-gray-800 text-lg font-bold m-0 mb-2">
                        {item.title}
                      </Text>
                      <Text className="text-gray-600 text-base m-0">
                        {item.description}
                      </Text>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reactivation Option */}
              <div className="bg-green-50 rounded-xl p-8 mb-10 border border-green-200 text-center">
                <Text className="text-gray-800 text-xl font-bold mb-4">
                  Changed your mind?
                </Text>
                <Text className="text-gray-600 text-base mb-6">
                  If you deleted your account by mistake, you may be able to reactivate it within the next {dataRetentionPeriod}.
                </Text>
                <Button
                  className="bg-green-600 text-white rounded-xl px-8 py-4 text-lg font-bold no-underline inline-block shadow-lg"
                  href={reactivationUrl}
                >
                  🔄 Try to Reactivate Account
                </Button>
              </div>

              {/* Data Export Info */}
              <div className="bg-gray-50 rounded-xl p-8 mb-10 border border-gray-200 text-center">
                <Text className="text-gray-800 text-xl font-bold mb-4">
                  Data Export
                </Text>
                <Text className="text-gray-600 text-base mb-6">
                  If you requested a data export before deletion, you should have received it via email. 
                  If you didn't receive it or need assistance, please contact our support team.
                </Text>
                <Button
                  className="bg-gray-200 border border-gray-300 text-gray-700 rounded-xl px-8 py-4 text-lg font-bold no-underline inline-block hover:bg-gray-300"
                  href={`mailto:${supportEmail}?subject=Account Deletion - Data Export Request`}
                >
                  💬 Contact Support
                </Button>
              </div>

              {/* Help Section */}
              <div className="text-center mb-8">
                <Text className="text-gray-600 text-base m-0 mb-4">
                  Need help or have questions? Our support team is here to help.
                </Text>
                <div className="text-center">
                  <Link 
                    href={`mailto:${supportEmail}`} 
                    className="text-green-600 text-base font-semibold underline"
                  >
                    💬 Contact Support Team
                  </Link>
                </div>
              </div>

              {/* Final Message */}
              <div className="text-center">
                <Text className="text-gray-600 text-base m-0">
                  Thank you for being part of the TrailVerse community. 
                  We hope you enjoyed exploring America's national parks with us! 🌲
                </Text>
              </div>
            </Section>

            {/* Footer */}
            <Section className="bg-gray-100 px-8 py-8 border-t border-gray-200">
              <div className="text-center">
                <div className="flex items-center justify-center gap-3 mb-4">
                  <Img
                    src="https://www.nationalparksexplorerusa.com/android-chrome-192x192.png"
                    width="32"
                    height="32"
                    alt="TrailVerse"
                    className="rounded-lg"
                  />
                  <Text className="text-gray-800 text-lg font-bold m-0">
                    TrailVerse
                  </Text>
                </div>
                <Text className="text-gray-500 text-sm m-0 mb-2">
                  This is a confirmation that your TrailVerse account has been deleted.
                </Text>
                <Text className="text-gray-500 text-sm m-0">
                  © 2025 TrailVerse. All rights reserved.
                </Text>
              </div>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default AccountDeletionEmail;
