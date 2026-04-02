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
} from '@react-email/components';
import * as React from 'react';

const fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

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
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={{ margin: 0, padding: 0, backgroundColor: '#0B1D0F', fontFamily, WebkitFontSmoothing: 'antialiased', color: '#111827' }}>
        <Section style={{ backgroundColor: '#0B1D0F', padding: '40px 20px' }}>
          <Container style={{ maxWidth: '600px', backgroundColor: '#ffffff', margin: '0 auto' }}>
            <Section style={{ padding: '40px 50px' }}>

              {/* Logo */}
              <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                <span style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.05em', color: '#111827' }}>
                  TrailVerse
                </span>
              </div>

              {/* Body */}
              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                Hey {username} 👋
              </Text>

              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                Your email <strong>{userEmail}</strong> has been unsubscribed from {reason}. You won't receive any more emails from <span style={{ backgroundColor: '#D1FAE5', padding: '2px 4px' }}>TrailVerse</span>.
              </Text>

              <Text style={{ margin: '0 0 24px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                We respect your decision, but we hope you'll consider rejoining us in the future. You're always welcome back to explore America's incredible national parks!
              </Text>

              {/* What you'll miss */}
              <h3 style={{ margin: '32px 0 16px', fontSize: '18px', fontWeight: 800, color: '#111827' }}>
                🏞️ What you'll be missing:
              </h3>
              <ul style={{ margin: '0 0 24px', paddingLeft: '20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                <li style={{ marginBottom: '8px' }}>
                  <strong>New Blog Articles</strong> — In-depth guides, hiking tips, and park photography advice.
                </li>
                <li style={{ marginBottom: '8px' }}>
                  <strong>Park Events</strong> — Ranger programs, seasonal events, and special activities.
                </li>
                <li style={{ marginBottom: '8px' }}>
                  <strong>Feature Updates</strong> — New AI planning tools, map improvements, and comparison features.
                </li>
                <li style={{ marginBottom: '8px' }}>
                  <strong>Community Reviews</strong> — Real experiences and photo reviews from fellow explorers.
                </li>
              </ul>

              {/* Changed your mind */}
              <h3 style={{ margin: '32px 0 16px', fontSize: '18px', fontWeight: 800, color: '#111827' }}>
                💚 Changed your mind?
              </h3>
              <Text style={{ margin: '0 0 24px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                Come back and stay updated with all our latest content and features. You can also manage your preferences to choose exactly what emails you receive.
              </Text>

              {/* CTA */}
              <div style={{ textAlign: 'center', margin: '40px 0 16px' }}>
                <Button
                  href={resubscribeUrl}
                  style={{ display: 'inline-block', padding: '12px 24px', backgroundColor: '#06B569', color: '#ffffff', textDecoration: 'none', fontWeight: 700, fontSize: '15px', borderRadius: '8px' }}
                >
                  Resubscribe
                </Button>
              </div>
              <div style={{ textAlign: 'center', margin: '0 0 32px' }}>
                <Link href={preferencesUrl} style={{ color: '#06B569', textDecoration: 'underline', fontSize: '13px' }}>
                  Manage email preferences →
                </Link>
              </div>

              {/* Feedback */}
              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                💬 We'd love to know why you're unsubscribing. Your feedback helps us create better content.{' '}
                <Link href="mailto:trailverseteam@gmail.com?subject=Unsubscribe Feedback" style={{ color: '#06B569', textDecoration: 'underline' }}>
                  Share feedback
                </Link>
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
                  This confirms you've been unsubscribed from our mailing list.
                </Text>
                <Text style={{ margin: 0, fontSize: '11px' }}>
                  <Link href="https://nationalparksexplorerusa.com/blog" style={{ color: '#06B569', textDecoration: 'underline' }}>
                    Visit blog
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

export default UnsubscribeEmail;
