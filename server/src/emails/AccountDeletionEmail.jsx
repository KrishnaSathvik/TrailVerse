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

const AccountDeletionEmail = ({
  username = 'there',
  userEmail = 'user@example.com',
  deletionDate = 'January 15, 2025',
  dataRetentionPeriod = '30 days',
  reactivationUrl = 'https://nationalparksexplorerusa.com/reactivate?token=abc123',
  supportEmail = 'trailverseteam@gmail.com',
}) => {
  const previewText = `Your TrailVerse account has been deleted - ${username}`;

  const formattedDeletionDate = deletionDate instanceof Date
    ? deletionDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    : deletionDate;

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
                We're writing to confirm that your <span style={{ backgroundColor: '#D1FAE5', padding: '2px 4px' }}>TrailVerse</span> account associated with <strong>{userEmail}</strong> has been successfully deleted as of {formattedDeletionDate}.
              </Text>

              <Text style={{ margin: '0 0 24px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                We're sorry to see you go, but we respect your decision. We hope you enjoyed exploring America's national parks with us!
              </Text>

              {/* What was deleted */}
              <h3 style={{ margin: '32px 0 16px', fontSize: '18px', fontWeight: 800, color: '#111827' }}>
                🗑️ What was deleted:
              </h3>
              <ul style={{ margin: '0 0 24px', paddingLeft: '20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                <li style={{ marginBottom: '8px' }}>
                  <strong>Personal Profile</strong> — Your account information, avatar, and personal details.
                </li>
                <li style={{ marginBottom: '8px' }}>
                  <strong>Saved Parks & Visits</strong> — All your favorite parks, wish lists, and visited park history.
                </li>
                <li style={{ marginBottom: '8px' }}>
                  <strong>Trailie Trip Plans</strong> — Your saved AI chat conversations and itineraries.
                </li>
                <li style={{ marginBottom: '8px' }}>
                  <strong>Reviews & Photos</strong> — Your park reviews and uploaded photos.
                </li>
                <li style={{ marginBottom: '8px' }}>
                  <strong>Preferences & Credentials</strong> — Notification settings, email preferences, and login data.
                </li>
              </ul>

              {/* Important Notice */}
              <Text style={{ margin: '0 0 24px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                ⚠️ Your account data will be retained for <strong>{dataRetentionPeriod}</strong> for security and legal purposes, after which it will be permanently deleted. This action cannot be undone.
              </Text>

              {/* Changed your mind */}
              <h3 style={{ margin: '32px 0 16px', fontSize: '18px', fontWeight: 800, color: '#111827' }}>
                🔄 Changed your mind?
              </h3>
              <Text style={{ margin: '0 0 24px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                If you deleted your account by mistake, you may be able to reactivate it within the next <strong>{dataRetentionPeriod}</strong>.
              </Text>

              {/* CTA */}
              <div style={{ textAlign: 'center', margin: '40px 0 32px' }}>
                <Button
                  href={reactivationUrl}
                  style={{ display: 'inline-block', padding: '12px 24px', backgroundColor: '#06B569', color: '#ffffff', textDecoration: 'none', fontWeight: 700, fontSize: '15px', borderRadius: '8px' }}
                >
                  Try to Reactivate Account
                </Button>
              </div>

              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                If you need a data export or have any questions, reach out to our support team at{' '}
                <Link href={`mailto:${supportEmail}?subject=Account Deletion - Data Export Request`} style={{ color: '#06B569', textDecoration: 'underline' }}>
                  {supportEmail}
                </Link>.
              </Text>

              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                Thank you for being part of the <span style={{ backgroundColor: '#D1FAE5', padding: '2px 4px' }}>TrailVerse</span> community. We hope to see you again soon! 🌲
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
                  This is a confirmation that your TrailVerse account has been deleted.
                </Text>
                <Text style={{ margin: 0, fontSize: '11px' }}>
                  <Link href="https://nationalparksexplorerusa.com/faq" style={{ color: '#06B569', textDecoration: 'underline' }}>
                    FAQ
                  </Link>
                  {' · '}
                  <Link href={`mailto:${supportEmail}`} style={{ color: '#06B569', textDecoration: 'underline' }}>
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

export default AccountDeletionEmail;
