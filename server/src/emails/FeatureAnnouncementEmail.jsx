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
  unsubscribeUrl = 'https://nationalparksexplorerusa.com/unsubscribe',
}) => {
  const previewText = `New in TrailVerse: drag-and-drop itinerary builder, PDF export, trip sharing, live NPS data in AI, and more.`;

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
                We shipped a bunch of updates to <span style={{ backgroundColor: '#D1FAE5', padding: '2px 4px' }}>TrailVerse</span> this week. Here's what's new.
              </Text>

              {/* Feature 1: Itinerary Builder */}
              <h3 style={{ margin: '32px 0 8px', fontSize: '16px', fontWeight: 800, color: '#111827' }}>
                🗓️ Drag-and-Drop Itinerary Builder
              </h3>
              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                After the AI generates your trip plan, it now converts into a visual itinerary. Drag stops between days, reorder activities, add custom stops, and edit notes — all before you go.
              </Text>

              {/* Feature 2: PDF Export */}
              <h3 style={{ margin: '24px 0 8px', fontSize: '16px', fontWeight: 800, color: '#111827' }}>
                📄 PDF Export
              </h3>
              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                One-click export any trip plan as a printable PDF — day-by-day itinerary, stop details, and trip info. Great for when you're in the park with no signal.
              </Text>

              {/* Feature 3: Trip Sharing */}
              <h3 style={{ margin: '24px 0 8px', fontSize: '16px', fontWeight: 800, color: '#111827' }}>
                🔗 Trip Sharing
              </h3>
              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                Share any saved trip with a public link. Your friends can view the full plan — no account needed.
              </Text>

              {/* Feature 4: Live NPS Data */}
              <h3 style={{ margin: '24px 0 8px', fontSize: '16px', fontWeight: 800, color: '#111827' }}>
                📡 Live NPS Data in AI Responses
              </h3>
              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                When you ask about a park, the AI now pulls real-time alerts, closures, campground status, and visitor center hours directly from the National Park Service.
              </Text>

              {/* Feature 5: Provider Switcher */}
              <h3 style={{ margin: '24px 0 8px', fontSize: '16px', fontWeight: 800, color: '#111827' }}>
                🤖 Switch Between Claude & GPT-4
              </h3>
              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                You can now switch AI providers mid-conversation. Try both and use whichever works best for your trip.
              </Text>

              {/* Feature 6: Webcams */}
              <h3 style={{ margin: '24px 0 8px', fontSize: '16px', fontWeight: 800, color: '#111827' }}>
                📹 Live Webcams & Videos
              </h3>
              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                Watch live webcam feeds and videos right from the park detail page. See real conditions before you visit.
              </Text>

              {/* Feature 7: Around This Park */}
              <h3 style={{ margin: '24px 0 8px', fontSize: '16px', fontWeight: 800, color: '#111827' }}>
                📍 Around This Park
              </h3>
              <Text style={{ margin: '0 0 8px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                Find nearby essentials in Google Maps without leaving your planning flow:
              </Text>
              <ul style={{ margin: '0 0 20px', paddingLeft: '20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                <li style={{ marginBottom: '4px' }}>
                  <strong>Lodging</strong> — hotels, lodges, and stays near the park
                </li>
                <li style={{ marginBottom: '4px' }}>
                  <strong>Food</strong> — restaurants and quick stops nearby
                </li>
                <li style={{ marginBottom: '4px' }}>
                  <strong>Gas</strong> — fuel stops before or after your visit
                </li>
                <li style={{ marginBottom: '4px' }}>
                  <strong>Attractions</strong> — nearby points of interest and landmarks
                </li>
              </ul>

              {/* More updates */}
              <h3 style={{ margin: '32px 0 12px', fontSize: '16px', fontWeight: 800, color: '#111827' }}>
                Also new:
              </h3>
              <ul style={{ margin: '0 0 24px', paddingLeft: '20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                <li style={{ marginBottom: '6px' }}>
                  <strong>Permits info</strong> — RIDB permit data added to park details
                </li>
                <li style={{ marginBottom: '6px' }}>
                  <strong>Better park pages</strong> — operating hours, directions, fees, passes, and brochures reorganized
                </li>
              </ul>

              {/* CTA */}
              <div style={{ textAlign: 'center', margin: '40px 0 16px' }}>
                <Button
                  href={planUrl}
                  style={{ display: 'inline-block', padding: '12px 24px', backgroundColor: '#06B569', color: '#ffffff', textDecoration: 'none', fontWeight: 700, fontSize: '15px', borderRadius: '8px' }}
                >
                  Try the AI Planner
                </Button>
              </div>
              <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                <Button
                  href={exploreUrl}
                  style={{ display: 'inline-block', padding: '12px 24px', backgroundColor: '#111827', color: '#ffffff', textDecoration: 'none', fontWeight: 700, fontSize: '15px', borderRadius: '8px' }}
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
                Thanks for choosing <span style={{ backgroundColor: '#D1FAE5', padding: '2px 4px' }}>TrailVerse</span> to plan your national park adventures. If you're enjoying it, share it with your friends and family — the more, the merrier on the trails!
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
