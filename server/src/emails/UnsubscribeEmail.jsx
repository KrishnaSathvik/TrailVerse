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

const UnsubscribeEmail = ({
  username = 'there',
  userEmail = 'user@example.com',
  resubscribeUrl = 'https://nationalparksexplorerusa.com/resubscribe?token=abc123',
  preferencesUrl = 'https://nationalparksexplorerusa.com/preferences',
  reason = 'all emails',
}) => {
  const previewText = `You have been unsubscribed from TrailVerse - ${username}`;

  return (
    <Html>
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Head />
        <Body className="bg-gray-50 font-sans">
          <Container className="bg-white mx-auto my-0 max-w-[600px]">
            {/* Header */}
            <Section className="bg-orange-600 py-8 px-6 text-center">
              <Img
                src="https://www.nationalparksexplorerusa.com/android-chrome-192x192.png"
                width="48"
                height="48"
                alt="TrailVerse"
                className="mx-auto mb-4 rounded-lg"
              />
              <Heading className="text-white text-2xl font-bold m-0 mb-2">
                You're Unsubscribed
              </Heading>
              <Text className="text-orange-100 text-base m-0">
                We're sorry to see you go
              </Text>
            </Section>

            {/* Main Content */}
            <Section className="px-6 py-8">
              <Text className="text-gray-900 text-xl font-bold m-0 mb-4">
                Hi {username},
              </Text>
              <Text className="text-gray-600 text-base leading-relaxed m-0 mb-6">
                Your email <strong className="text-gray-800">{userEmail}</strong> has been unsubscribed from {reason}. You won't receive any more emails from TrailVerse.
              </Text>

              {/* Farewell Message */}
              <Section className="bg-gray-50 rounded-lg p-6 mb-8 border border-gray-200">
                <Text className="text-gray-800 text-lg font-bold text-center mb-3">
                  We're sad to see you leave
                </Text>
                <Text className="text-gray-600 text-sm text-center m-0">
                  We respect your decision, but we hope you'll consider rejoining us in the future. You're always welcome back to explore America's incredible national parks!
                </Text>
              </Section>

              {/* Re-engagement Options */}
              <Section className="mb-8">
                <Text className="text-gray-900 text-lg font-bold text-center mb-6">
                  Changed your mind?
                </Text>
                
                <div className="space-y-4">
                  <div className="bg-green-50 rounded-lg p-6 border border-green-200 text-center">
                    <Text className="text-gray-800 text-base font-bold mb-3">
                      Resubscribe
                    </Text>
                    <Text className="text-gray-600 text-sm mb-4">
                      Come back and stay updated with all our latest content and features.
                    </Text>
                    <Button
                      className="bg-green-600 text-white rounded-lg px-6 py-3 text-sm font-semibold no-underline inline-block"
                      href={resubscribeUrl}
                    >
                      Resubscribe Now
                    </Button>
                  </div>

                  <div className="bg-blue-50 rounded-lg p-6 border border-blue-200 text-center">
                    <Text className="text-gray-800 text-base font-bold mb-3">
                      Manage Preferences
                    </Text>
                    <Text className="text-gray-600 text-sm mb-4">
                      Choose exactly what emails you want to receive from us.
                    </Text>
                    <Button
                      className="bg-blue-600 text-white rounded-lg px-6 py-3 text-sm font-semibold no-underline inline-block"
                      href={preferencesUrl}
                    >
                      Update Preferences
                    </Button>
                  </div>
                </div>
              </Section>

              {/* What You'll Miss */}
              <Section className="mb-8">
                <Text className="text-gray-900 text-base font-bold text-center mb-4">
                  What you'll be missing:
                </Text>
                
                <div className="space-y-3">
                  {[
                    {
                      icon: '🏞️',
                      title: 'Park Updates',
                      description: 'Latest park information and seasonal highlights'
                    },
                    {
                      icon: '🗺️',
                      title: 'New Features',
                      description: 'Interactive map improvements and new tools'
                    },
                    {
                      icon: '📝',
                      title: 'Expert Guides',
                      description: 'Hiking tips and detailed park guides'
                    },
                    {
                      icon: '👥',
                      title: 'Community Stories',
                      description: 'Real experiences from fellow park explorers'
                    }
                  ].map((item, index) => (
                    <div key={index} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <div className="flex items-start gap-3">
                        <Text className="text-lg m-0">{item.icon}</Text>
                        <div>
                          <Text className="text-gray-800 text-sm font-semibold m-0 mb-1">
                            {item.title}
                          </Text>
                          <Text className="text-gray-600 text-xs m-0">
                            {item.description}
                          </Text>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>

              {/* Feedback Section */}
              <Section className="bg-yellow-50 rounded-lg p-6 mb-8 border border-yellow-200">
                <Text className="text-gray-800 text-base font-bold text-center mb-3">
                  Help us improve
                </Text>
                <Text className="text-gray-600 text-sm text-center mb-4">
                  We'd love to know why you're unsubscribing. Your feedback helps us create better content.
                </Text>
                <div className="text-center">
                  <Button
                    className="bg-yellow-600 text-white rounded-lg px-6 py-3 text-sm font-semibold no-underline inline-block"
                    href="mailto:trailverseteam@gmail.com?subject=Unsubscribe Feedback"
                  >
                    Share Feedback
                  </Button>
                </div>
              </Section>

              {/* Stay Connected */}
              <div className="text-center mb-8">
                <Text className="text-gray-600 text-base m-0 mb-4">
                  Still want to stay connected?
                </Text>
                <div className="text-center">
                  <Link 
                    href="https://nationalparksexplorerusa.com/blog" 
                    className="text-green-600 text-base font-semibold underline inline-block mr-6"
                  >
                    📚 Visit Blog
                  </Link>
                  <Link 
                    href="mailto:trailverseteam@gmail.com" 
                    className="text-green-600 text-base font-semibold underline inline-block mr-6"
                  >
                    💬 Contact Support
                  </Link>
                </div>
              </div>

              {/* Final Message */}
              <div className="text-center">
                <Text className="text-gray-600 text-base m-0">
                  Thank you for being part of the TrailVerse community. We hope to see you again soon! 🌲
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
                  This confirms you've been unsubscribed from our mailing list.
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

export default UnsubscribeEmail;
