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

const FeatureAnnouncementEmail = ({
  username = 'there',
  userEmail = 'user@example.com',
  planUrl = 'https://nationalparksexplorerusa.com/plan-ai',
  exploreUrl = 'https://nationalparksexplorerusa.com/explore',
  magazineUrl = 'https://nationalparksexplorerusa.com/magazine',
  unsubscribeUrl = 'https://nationalparksexplorerusa.com/unsubscribe',
}) => {
  const previewText = `New in TrailVerse: Plan My Trip, personalized For Me recommendations, park photos in chat, interactive magazine, and more.`;

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

              {/* Greeting */}
              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                Hey {username} 👋
              </Text>

              <Text style={{ margin: '0 0 24px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                We've been busy. Here's everything new in <span style={{ backgroundColor: '#D1FAE5', padding: '2px 4px' }}>TrailVerse</span> over the last couple of weeks.
              </Text>

              {/* Feature 1: Plan My Trip */}
              <h3 style={{ margin: '32px 0 8px', fontSize: '16px', fontWeight: 800, color: '#111827' }}>
                🗺️ Plan My Trip
              </h3>
              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                Hit "Plan My Trip" in the AI chat, pick your park, dates, group size, interests, budget, and fitness level — and it sends everything straight to the AI. No more typing out all your preferences. Change your mind later? Open it again and update — the AI adjusts your plan on the fly.
              </Text>

              {/* Feature 2: For Me */}
              <h3 style={{ margin: '24px 0 8px', fontSize: '16px', fontWeight: 800, color: '#111827' }}>
                ✨ For Me — Personalized Recommendations
              </h3>
              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                If you've planned trips to 3 or more parks, you'll see a "For Me" button on the AI planner page. Tap it and the AI analyzes your past conversations and trip details to suggest your next adventure — places that match your style but you haven't explored yet.
              </Text>

              {/* Feature 3: Park Photos in Chat */}
              <h3 style={{ margin: '24px 0 8px', fontSize: '16px', fontWeight: 800, color: '#111827' }}>
                📸 Park Photos in AI Chat
              </h3>
              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                When you ask about a park, the AI now includes official park photos in its response. Get a visual preview of where you're headed, right in the conversation.
              </Text>

              {/* Feature 4: Magazine */}
              <h3 style={{ margin: '24px 0 8px', fontSize: '16px', fontWeight: 800, color: '#111827' }}>
                📖 TrailVerse Magazine
              </h3>
              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                A 16-page digital magazine covering everything TrailVerse offers — the AI planner, interactive map, park pages, compare tool, itinerary builder, daily nature feed, events, blog, and more. One place to see what the platform can do.
              </Text>

              {/* Feature 6: Map Upgrades */}
              <h3 style={{ margin: '24px 0 8px', fontSize: '16px', fontWeight: 800, color: '#111827' }}>
                🗺️ Interactive Map — All 470+ Parks
              </h3>
              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                The map now renders all 470+ parks reliably — no more "park not found" errors. Larger markers, a color legend, and a new "Compare Park" button right on the map card so you can send any park straight to comparison.
              </Text>

              {/* Feature 7: Chat History */}
              <h3 style={{ margin: '24px 0 8px', fontSize: '16px', fontWeight: 800, color: '#111827' }}>
                💬 Better Chat History
              </h3>
              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                Your saved conversations now show descriptive titles based on what you actually asked about, instead of generic labels. Find your past trips faster.
              </Text>

              {/* CTA */}
              <div style={{ textAlign: 'center', margin: '40px 0 16px' }}>
                <Button
                  href={planUrl}
                  style={{ display: 'inline-block', padding: '12px 24px', backgroundColor: '#06B569', color: '#ffffff', textDecoration: 'none', fontWeight: 700, fontSize: '15px', borderRadius: '8px' }}
                >
                  Try the AI Planner
                </Button>
              </div>
              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <Button
                  href={magazineUrl}
                  style={{ display: 'inline-block', padding: '12px 24px', backgroundColor: '#111827', color: '#ffffff', textDecoration: 'none', fontWeight: 700, fontSize: '15px', borderRadius: '8px' }}
                >
                  Read the Magazine
                </Button>
              </div>
              <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                <Button
                  href={exploreUrl}
                  style={{ display: 'inline-block', padding: '12px 24px', backgroundColor: '#ffffff', color: '#111827', textDecoration: 'none', fontWeight: 700, fontSize: '15px', borderRadius: '8px', border: '1px solid #d1d5db' }}
                >
                  Explore Parks
                </Button>
              </div>

              {/* Instagram */}
              <Text style={{ margin: '0 0 24px', fontSize: '15px', lineHeight: '1.6', color: '#111827', textAlign: 'center' }}>
                Follow the journey on Instagram:{' '}
                <Link href="https://instagram.com/travelswithkrishna" style={{ color: '#06B569', textDecoration: 'underline', fontWeight: 700 }}>
                  @travelswithkrishna
                </Link>
              </Text>

              {/* Sign off */}
              <Text style={{ margin: '0 0 16px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                Thanks for being part of <span style={{ backgroundColor: '#D1FAE5', padding: '2px 4px' }}>TrailVerse</span>. If you're enjoying it, share it with your friends and family — the more, the merrier on the trails!
              </Text>
              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                Happy trails
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
                  You're receiving this because you have a TrailVerse account.
                </Text>
                <Text style={{ margin: 0, fontSize: '11px' }}>
                  <Link href="https://nationalparksexplorerusa.com/faq" style={{ color: '#06B569', textDecoration: 'underline' }}>
                    FAQ
                  </Link>
                  {' · '}
                  <Link href="mailto:trailverseteam@gmail.com" style={{ color: '#06B569', textDecoration: 'underline' }}>
                    Contact support
                  </Link>
                  {' · '}
                  <Link href={unsubscribeUrl} style={{ color: '#6b7280', textDecoration: 'underline' }}>
                    Unsubscribe
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

export default FeatureAnnouncementEmail;
