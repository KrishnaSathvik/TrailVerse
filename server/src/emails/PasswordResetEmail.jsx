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

const PasswordResetEmail = ({
  username = 'there',
  resetUrl = 'https://nationalparksexplorerusa.com/reset-password?token=abc123',
  expirationTime = '1 hour',
}) => {
  const previewText = `Reset your TrailVerse password - ${username}`;

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
                We received a request to reset your <span style={{ backgroundColor: '#D1FAE5', padding: '2px 4px' }}>TrailVerse</span> password. If you made this request, click the button below to set a new password.
              </Text>

              <Text style={{ margin: '0 0 24px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                This link will expire in <strong>{expirationTime}</strong>. If you didn't request this reset, you can safely ignore this email — your password will remain unchanged.
              </Text>

              {/* CTA */}
              <div style={{ textAlign: 'center', margin: '40px 0 32px' }}>
                <Button
                  href={resetUrl}
                  style={{ display: 'inline-block', padding: '12px 24px', backgroundColor: '#06B569', color: '#ffffff', textDecoration: 'none', fontWeight: 700, fontSize: '15px', borderRadius: '8px' }}
                >
                  Reset Password
                </Button>
              </div>

              {/* Backup Link */}
              <Text style={{ margin: '0 0 8px', fontSize: '13px', lineHeight: '1.6', color: '#6b7280' }}>
                Having trouble? Copy and paste this link into your browser:
              </Text>
              <Text style={{ margin: '0 0 24px', fontSize: '13px', lineHeight: '1.4', color: '#06B569', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                {resetUrl}
              </Text>

              {/* Security Tips */}
              <h3 style={{ margin: '32px 0 16px', fontSize: '18px', fontWeight: 800, color: '#111827' }}>
                🔒 Security Tips:
              </h3>
              <ol style={{ margin: '0 0 24px', paddingLeft: '20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                <li style={{ marginBottom: '8px' }}>
                  <strong>Use a strong password</strong> — Mix letters, numbers, and symbols.
                </li>
                <li style={{ marginBottom: '8px' }}>
                  <strong>Make it unique</strong> — Don't reuse passwords from other accounts.
                </li>
                <li style={{ marginBottom: '8px' }}>
                  <strong>Enable 2FA</strong> — Add an extra layer of security to your account.
                </li>
              </ol>

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
                  This is an automated security email. Please do not reply.
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

export default PasswordResetEmail;
