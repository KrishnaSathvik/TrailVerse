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

const PasswordResetEmail = ({
  username = 'there',
  resetUrl = 'https://nationalparksexplorerusa.com/reset-password?token=abc123',
  expirationTime = '1 hour',
}) => {
  const previewText = `Reset your TrailVerse password - ${username}`;

  return (
    <Html>
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Head />
        <Body className="bg-gray-50 font-sans">
          <Container className="bg-white mx-auto my-0 max-w-[600px]">
            {/* Header */}
            <Section className="bg-red-600 py-12 px-8 text-center">
              <Img
                src="https://www.nationalparksexplorerusa.com/android-chrome-192x192.png"
                width="64"
                height="64"
                alt="TrailVerse"
                className="mx-auto mb-6 rounded-xl"
              />
              <Heading className="text-white text-3xl font-bold m-0 mb-3">
                Password Reset
              </Heading>
              <Text className="text-red-100 text-lg m-0">
                Secure your TrailVerse account
              </Text>
            </Section>

            {/* Main Content */}
            <Section className="px-8 py-10">
              <div className="text-center mb-8">
                <Text className="text-gray-900 text-2xl font-bold m-0 mb-4">
                  Hi {username}!
                </Text>
                <Text className="text-gray-600 text-lg leading-relaxed m-0 max-w-2xl mx-auto">
                  We received a request to reset your TrailVerse password. If you made this request, click the button below to set a new password.
                </Text>
              </div>

              {/* Primary CTA */}
              <div className="text-center mb-10">
                <Button
                  className="bg-red-600 text-white rounded-xl px-10 py-4 text-xl font-bold no-underline inline-block shadow-lg"
                  href={resetUrl}
                >
                  🔐 Reset Password
                </Button>
              </div>

              {/* Backup Link */}
              <div className="mb-10 text-center">
                <Text className="text-gray-600 text-base mb-4">
                  Having trouble? Copy this link:
                </Text>
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <Text className="text-red-600 text-sm break-all m-0 font-mono">
                    {resetUrl}
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
                  This link expires in <strong>{expirationTime}</strong>. If you didn't request this reset, please ignore this email or contact support immediately.
                </Text>
              </div>

              {/* Security Tips */}
              <div className="mb-10">
                <Text className="text-gray-900 text-xl font-bold text-center m-0 mb-6">
                  Security Tips
                </Text>
                
                <div className="space-y-4">
                  {[
                    {
                      icon: '🔒',
                      title: 'Use a Strong Password',
                      description: 'Mix letters, numbers, and symbols'
                    },
                    {
                      icon: '🔄',
                      title: 'Make it Unique',
                      description: 'Don\'t reuse passwords from other accounts'
                    },
                    {
                      icon: '📱',
                      title: 'Enable 2FA',
                      description: 'Add an extra layer of security'
                    }
                  ].map((tip, index) => (
                    <div key={index} className="bg-gray-50 rounded-xl p-6 border border-gray-200 text-center">
                      <Text className="text-3xl m-0 mb-3">{tip.icon}</Text>
                      <Text className="text-gray-900 text-lg font-bold m-0 mb-2">
                        {tip.title}
                      </Text>
                      <Text className="text-gray-600 text-base m-0">
                        {tip.description}
                      </Text>
                    </div>
                  ))}
                </div>
              </div>

              {/* Additional Info */}
              <div className="bg-gray-50 rounded-xl p-6 mb-10 border border-gray-200 text-center">
                <Text className="text-gray-800 text-lg font-bold m-0 mb-3">
                  Why did I receive this?
                </Text>
                <Text className="text-gray-600 text-base m-0">
                  Someone requested a password reset for your TrailVerse account. If you didn't make this request, you can safely ignore this email.
                </Text>
              </div>

              {/* Help */}
              <div className="text-center">
                <Text className="text-gray-600 text-base m-0 mb-4">
                  Need help? Contact our security team!
                </Text>
                <div className="text-center">
                  <Link 
                    href="mailto:trailverseteam@gmail.com" 
                    className="text-red-600 text-base font-semibold underline inline-block mr-6"
                  >
                    💬 Contact Support
                  </Link>
                  <Link 
                    href="https://nationalparksexplorerusa.com/faq" 
                    className="text-red-600 text-base font-semibold underline inline-block mr-6"
                  >
                    📚 Security FAQ
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
                  This is an automated security email. Please do not reply.
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

export default PasswordResetEmail;
