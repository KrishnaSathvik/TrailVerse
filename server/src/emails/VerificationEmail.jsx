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

const VerificationEmail = ({
  username = 'there',
  verificationUrl = 'https://nationalparksexplorerusa.com/verify?token=abc123',
  verificationCode = '123456',
}) => {
  const previewText = `Verify your TrailVerse email address - ${username}`;

  return (
    <Html>
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Head />
        <Body className="bg-gray-50 font-sans">
          <Container className="bg-white mx-auto my-0 max-w-[600px]">
            {/* Header */}
            <Section className="bg-blue-600 py-12 px-8 text-center">
              <Img
                src="https://www.nationalparksexplorerusa.com/android-chrome-192x192.png"
                width="64"
                height="64"
                alt="TrailVerse"
                className="mx-auto mb-6 rounded-xl"
              />
              <Heading className="text-white text-3xl font-bold m-0 mb-3">
                Verify Your Email
              </Heading>
              <Text className="text-blue-100 text-lg m-0">
                Complete your TrailVerse registration
              </Text>
            </Section>

            {/* Main Content */}
            <Section className="px-8 py-10">
              <div className="text-center mb-8">
                <Text className="text-gray-900 text-2xl font-bold m-0 mb-4">
                  Hi {username}!
                </Text>
                <Text className="text-gray-600 text-lg leading-relaxed m-0 max-w-2xl mx-auto">
                  Thanks for joining TrailVerse! Please verify your email address to complete your registration and start exploring America's national parks.
                </Text>
              </div>

              {/* Primary CTA */}
              <div className="text-center mb-10">
                <Button
                  className="bg-blue-600 text-white rounded-xl px-10 py-4 text-xl font-bold no-underline inline-block shadow-lg"
                  href={verificationUrl}
                >
                  🔗 Verify Email Address
                </Button>
              </div>

              {/* Verification Code */}
              <div className="bg-gray-50 rounded-xl p-8 mb-10 border-2 border-dashed border-gray-300 text-center">
                <Text className="text-gray-700 text-lg font-semibold mb-6">
                  Or enter this code manually:
                </Text>
                <div className="bg-white rounded-xl p-8 border border-gray-200 inline-block">
                  <Text className="text-gray-900 text-4xl font-bold tracking-widest m-0 font-mono">
                    {verificationCode}
                  </Text>
                </div>
                <Text className="text-gray-500 text-base mt-4 m-0">
                  Code expires in 24 hours
                </Text>
              </div>

              {/* Backup Link */}
              <div className="mb-10 text-center">
                <Text className="text-gray-600 text-base mb-4">
                  Having trouble? Copy this link:
                </Text>
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <Text className="text-blue-600 text-sm break-all m-0 font-mono">
                    {verificationUrl}
                  </Text>
                </div>
              </div>

              {/* Security Notice */}
              <div className="bg-yellow-50 rounded-xl p-6 mb-10 border border-yellow-200 text-center">
                <Text className="text-yellow-600 text-2xl mb-3">⚠️</Text>
                <Text className="text-yellow-900 text-lg font-bold m-0 mb-2">
                  Security Notice
                </Text>
                <Text className="text-yellow-800 text-base m-0">
                  This link expires in 24 hours. If you didn't create a TrailVerse account, you can safely ignore this email.
                </Text>
              </div>

              {/* Why Verify */}
              <div className="mb-10">
                <Text className="text-gray-900 text-xl font-bold text-center m-0 mb-6">
                  Why verify your email?
                </Text>
                
                <div className="space-y-4">
                  {[
                    {
                      icon: '🔒',
                      title: 'Account Security',
                      description: 'Protects your account from unauthorized access'
                    },
                    {
                      icon: '📧',
                      title: 'Important Updates',
                      description: 'Receive park alerts and notifications'
                    },
                    {
                      icon: '✅',
                      title: 'Full Access',
                      description: 'Unlock all TrailVerse features'
                    }
                  ].map((reason, index) => (
                    <div key={index} className="bg-gray-50 rounded-xl p-6 border border-gray-200 text-center">
                      <Text className="text-3xl m-0 mb-3">{reason.icon}</Text>
                      <Text className="text-gray-900 text-lg font-bold m-0 mb-2">
                        {reason.title}
                      </Text>
                      <Text className="text-gray-600 text-base m-0">
                        {reason.description}
                      </Text>
                    </div>
                  ))}
                </div>
              </div>

              {/* Help */}
              <div className="text-center">
                <Text className="text-gray-600 text-base m-0 mb-4">
                  Need help? Contact our support team!
                </Text>
                <div className="text-center">
                  <Link 
                    href="mailto:trailverseteam@gmail.com" 
                    className="text-blue-600 text-base font-semibold underline inline-block mr-6"
                  >
                    💬 Contact Support
                  </Link>
                  <Link 
                    href="https://nationalparksexplorerusa.com/faq" 
                    className="text-blue-600 text-base font-semibold underline inline-block mr-6"
                  >
                    📚 FAQ
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
                  You're receiving this because someone created a TrailVerse account using this email.
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

export default VerificationEmail;
