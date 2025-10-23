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

const WelcomeEmail = ({
  username = 'there',
  userEmail = 'user@example.com',
  loginUrl = 'https://nationalparksexplorerusa.com/login',
}) => {
  const previewText = `Welcome to TrailVerse, ${username}! Your adventure begins now.`;

  return (
    <Html>
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Head />
        <Body className="bg-gray-50 font-sans">
          <Container className="bg-white mx-auto my-0 max-w-[600px]">
            {/* Header */}
            <Section className="bg-green-600 py-12 px-8 text-center">
              <Img
                src="https://www.nationalparksexplorerusa.com/android-chrome-192x192.png"
                width="64"
                height="64"
                alt="TrailVerse"
                className="mx-auto mb-6 rounded-xl"
              />
              <Heading className="text-white text-3xl font-bold m-0 mb-3">
                Welcome to TrailVerse!
              </Heading>
              <Text className="text-green-100 text-lg m-0">
                Your National Parks Adventure Awaits
              </Text>
            </Section>

            {/* Main Content */}
            <Section className="px-8 py-10">
              <div className="text-center mb-8">
                <Text className="text-gray-900 text-2xl font-bold m-0 mb-4">
                  Hi {username}!
                </Text>
                <Text className="text-gray-600 text-lg leading-relaxed m-0 max-w-2xl mx-auto">
                  Welcome to TrailVerse! Your account has been created with <strong className="text-green-600">{userEmail}</strong> and you're ready to explore America's incredible national parks.
                </Text>
              </div>

              {/* Primary CTA */}
              <div className="text-center mb-10">
                <Button
                  className="bg-green-600 text-white rounded-xl px-10 py-4 text-xl font-bold no-underline inline-block shadow-lg"
                  href={loginUrl}
                >
                  🚀 Start Exploring
                </Button>
              </div>

              {/* Key Features */}
              <div className="mb-10">
                <Text className="text-gray-900 text-xl font-bold text-center m-0 mb-6">
                  What you can do:
                </Text>
                
                <div className="space-y-4">
                  {[
                    {
                      icon: '🗺️',
                      title: 'Explore 470+ Parks',
                      description: 'Interactive maps and detailed information'
                    },
                    {
                      icon: '🤖',
                      title: 'AI Trip Planning',
                      description: 'Personalized itineraries for your adventures'
                    },
                    {
                      icon: '⭐',
                      title: 'Save Favorites',
                      description: 'Create wish lists and track your visits'
                    }
                  ].map((feature, index) => (
                    <div key={index} className="bg-gray-50 rounded-xl p-6 border border-gray-200 text-center">
                      <Text className="text-4xl m-0 mb-3">{feature.icon}</Text>
                      <Text className="text-gray-900 text-lg font-bold m-0 mb-2">
                        {feature.title}
                      </Text>
                      <Text className="text-gray-600 text-base m-0">
                        {feature.description}
                      </Text>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick Start */}
              <div className="bg-blue-50 rounded-xl p-8 mb-10 border border-blue-200 text-center">
                <Text className="text-gray-900 text-xl font-bold m-0 mb-6">
                  Get Started
                </Text>
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 flex items-center justify-center text-2xl font-bold flex-shrink-0 text-green-600">
                      1
                    </div>
                    <Text className="text-gray-700 text-base m-0 flex-1">Complete your profile for personalized recommendations</Text>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 flex items-center justify-center text-2xl font-bold flex-shrink-0 text-green-600">
                      2
                    </div>
                    <Text className="text-gray-700 text-base m-0 flex-1">Browse parks by state or use our AI search</Text>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 flex items-center justify-center text-2xl font-bold flex-shrink-0 text-green-600">
                      3
                    </div>
                    <Text className="text-gray-700 text-base m-0 flex-1">Plan your first trip with our trip planner</Text>
                  </div>
                </div>
              </div>

              {/* Help */}
              <div className="text-center">
                <Text className="text-gray-600 text-base m-0 mb-4">
                  Need help? We're here for you!
                </Text>
                <div className="text-center">
                  <Link 
                    href="https://nationalparksexplorerusa.com/faq" 
                    className="text-green-600 text-base font-semibold underline inline-block mr-6"
                  >
                    📚 FAQ
                  </Link>
                  <Link 
                    href="mailto:trailverseteam@gmail.com" 
                    className="text-green-600 text-base font-semibold underline inline-block mr-6"
                  >
                    💬 Contact Support
                  </Link>
                </div>
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
                  You're receiving this because you created a TrailVerse account.
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

export default WelcomeEmail;