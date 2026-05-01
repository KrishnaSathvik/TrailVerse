import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Link,
  Preview,
  Section,
  Text,
  Hr,
  Img,
} from '@react-email/components';
import * as React from 'react';

const fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const VerificationEmail = ({
  username = 'there',
  verificationUrl = 'https://nationalparksexplorerusa.com/verify?token=abc123',
  verificationCode = '123456',
}) => {
  const previewText = `Verify your TrailVerse email address - ${username}`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={{ margin: 0, padding: 0, backgroundColor: '#0B1D0F', fontFamily, WebkitFontSmoothing: 'antialiased', color: '#111827' }}>
        <Section style={{ backgroundColor: '#0B1D0F', padding: '40px 20px' }}>
          <Container style={{ maxWidth: '600px', backgroundColor: '#ffffff', margin: '0 auto' }}>
            <Section style={{ padding: '40px 50px' }}>

              {/* Logo */}
              <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                <Img
                  src="https://www.nationalparksexplorerusa.com/android-chrome-192x192.png"
                  width="48"
                  height="48"
                  alt="TrailVerse"
                  style={{ display: 'block', margin: '0 auto 12px' }}
                />
                <span style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.05em', color: '#111827' }}>
                  TrailVerse
                </span>
              </div>

              {/* Body */}
              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                Hey {username} 👋
              </Text>

              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                Thanks for joining <span style={{ backgroundColor: '#D1FAE5', padding: '2px 4px' }}>TrailVerse</span>! Please verify your email address to complete your registration and start exploring America's national parks.
              </Text>

              <Text style={{ margin: '0 0 24px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                Click the button below to verify your account securely, or use the backup code if the button doesn't work.
              </Text>

              {/* CTA */}
              <div style={{ textAlign: 'center', margin: '40px 0 32px' }}>
                <Button
                  href={verificationUrl}
                  style={{ display: 'inline-block', padding: '12px 24px', backgroundColor: '#06B569', color: '#ffffff', textDecoration: 'none', fontWeight: 700, fontSize: '15px', borderRadius: '8px' }}
                >
                  Verify Email Address
                </Button>
              </div>

              {/* Verification Code */}
              <div style={{ textAlign: 'center', margin: '0 0 32px' }}>
                <Text style={{ margin: '0 0 12px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                  Or enter this code manually:
                </Text>
                <div style={{ backgroundColor: '#f9fafb', border: '2px dashed #d1d5db', borderRadius: '8px', padding: '20px', display: 'inline-block' }}>
                  <span style={{ fontSize: '32px', fontWeight: 700, letterSpacing: '0.2em', color: '#111827', fontFamily: 'monospace' }}>
                    {verificationCode}
                  </span>
                </div>
                <Text style={{ margin: '12px 0 0', fontSize: '13px', color: '#6b7280' }}>
                  Code expires in 24 hours
                </Text>
              </div>

              {/* Why Verify */}
              <h3 style={{ margin: '32px 0 16px', fontSize: '18px', fontWeight: 800, color: '#111827' }}>
                Why verify your email?
              </h3>
              <ol style={{ margin: '0 0 24px', paddingLeft: '20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                <li style={{ marginBottom: '8px' }}>
                  <strong>Unlock Trailie</strong> — Build personalized itineraries with smart AI-powered trip planning.
                </li>
                <li style={{ marginBottom: '8px' }}>
                  <strong>Save & Review</strong> — Favorite parks, track visits, and write reviews with photos.
                </li>
                <li style={{ marginBottom: '8px' }}>
                  <strong>Stay Updated</strong> — Get park alerts, new blog posts, and event notifications.
                </li>
              </ol>

              {/* Security Notice */}
              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                ⚠️ This link expires in <strong>24 hours</strong>. If you didn't create a <span style={{ backgroundColor: '#D1FAE5', padding: '2px 4px' }}>TrailVerse</span> account, you can safely ignore this email.
              </Text>

              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                — The <span style={{ backgroundColor: '#D1FAE5', padding: '2px 4px' }}>TrailVerse</span> team
              </Text>

              {/* Divider */}
              <Hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '40px 0 32px' }} />

              {/* Footer */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ marginBottom: '16px' }}>
                  <span style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.05em', color: '#111827' }}>
                    TrailVerse
                  </span>
                </div>
                <Text style={{ margin: '0 0 8px', fontSize: '11px', color: '#6b7280' }}>
                  You're receiving this because someone created a TrailVerse account using this email.
                </Text>
                <Text style={{ margin: 0, fontSize: '11px' }}>
                  <Link href="https://nationalparksexplorerusa.com/faq" style={{ color: '#06B569', textDecoration: 'underline' }}>
                    FAQ
                  </Link>
                  {' · '}
                  <Link href="mailto:trailverseteam@gmail.com" style={{ color: '#06B569', textDecoration: 'underline' }}>
                    Contact support
                  </Link>
                </Text>
              </div>

            </Section>
          </Container>
        </Section>
      </Body>
    </Html>
  );
};

export default VerificationEmail;
