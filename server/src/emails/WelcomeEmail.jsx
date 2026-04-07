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

const WelcomeEmail = ({
  username = 'there',
  userEmail = 'user@example.com',
  loginUrl = 'https://nationalparksexplorerusa.com/login',
}) => {
  const previewText = `Welcome to TrailVerse, ${username}! Your adventure begins now.`;

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
                Welcome to <span style={{ backgroundColor: '#D1FAE5', padding: '2px 4px' }}>TrailVerse</span>! Your account has been created with <strong>{userEmail}</strong> and you're ready to explore America's incredible national parks.
              </Text>

              <Text style={{ margin: '0 0 24px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                Exploring national parks is one of the most rewarding ways to experience America's natural beauty. At <span style={{ backgroundColor: '#D1FAE5', padding: '2px 4px' }}>TrailVerse</span>, we've made it easy to discover, plan, and track your adventures.
              </Text>

              {/* What you can do */}
              <h3 style={{ margin: '32px 0 16px', fontSize: '18px', fontWeight: 800, color: '#111827' }}>
                What you can do now:
              </h3>
              <ol style={{ margin: '0 0 24px', paddingLeft: '20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                <li style={{ marginBottom: '8px' }}>
                  <strong>Explore 470+ Parks & Sites</strong> — Browse by state, filter by activities, and view parks on an interactive map.
                </li>
                <li style={{ marginBottom: '8px' }}>
                  <strong>Dual AI Trip Planning</strong> — Build personalized itineraries with Claude or ChatGPT based on your dates, pace, and interests. Your chat history is saved so you can keep refining.
                </li>
                <li style={{ marginBottom: '8px' }}>
                  <strong>Compare Parks Side-by-Side</strong> — Compare up to 4 parks with detailed metrics to pick the right destination.
                </li>
                <li style={{ marginBottom: '8px' }}>
                  <strong>Weather & Park Alerts</strong> — Check real-time weather, 5-day forecasts, and official NPS alerts before you go.
                </li>
                <li style={{ marginBottom: '8px' }}>
                  <strong>Save Favorites & Track Visits</strong> — Build wish lists, mark parks as visited, and write reviews with photos.
                </li>
              </ol>

              {/* Get Started */}
              <h3 style={{ margin: '32px 0 16px', fontSize: '18px', fontWeight: 800, color: '#111827' }}>
                Get started in 3 steps:
              </h3>
              <ol style={{ margin: '0 0 24px', paddingLeft: '20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                <li style={{ marginBottom: '8px' }}>
                  Head to <strong>Explore</strong> and browse parks by state or activity.
                </li>
                <li style={{ marginBottom: '8px' }}>
                  Open <strong>Plan with AI</strong> and tell it where and when you want to go.
                </li>
                <li style={{ marginBottom: '8px' }}>
                  Save your favorites and start building your National Park bucket list.
                </li>
              </ol>

              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                — The <span style={{ backgroundColor: '#D1FAE5', padding: '2px 4px' }}>TrailVerse</span> team
              </Text>

              {/* CTA */}
              <div style={{ textAlign: 'center', margin: '40px 0 32px' }}>
                <Button
                  href={loginUrl}
                  style={{ display: 'inline-block', padding: '12px 24px', backgroundColor: '#06B569', color: '#ffffff', textDecoration: 'none', fontWeight: 700, fontSize: '15px', borderRadius: '8px' }}
                >
                  Start Exploring
                </Button>
              </div>

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
                  You're receiving this because you created a TrailVerse account.
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

export default WelcomeEmail;
