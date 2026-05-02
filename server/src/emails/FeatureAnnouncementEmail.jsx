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
  const previewText = `Meet Trailie — your new AI trip planner in TrailVerse. Smarter answers, blog-powered knowledge, and one simple conversation to plan any park trip.`;

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
                Big update — your AI trip planner just got a major upgrade. Say hello to <span style={{ backgroundColor: '#D1FAE5', padding: '2px 4px', fontWeight: 700 }}>Trailie</span>.
              </Text>

              {/* Feature 1: Meet Trailie */}
              <h3 style={{ margin: '32px 0 8px', fontSize: '16px', fontWeight: 800, color: '#111827' }}>
                🤖 Meet Trailie
              </h3>
              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                No more choosing between two AI planners. Trailie is one smart assistant that automatically adapts — ask a quick question and get insider tips, ask for a full trip plan and get a detailed day-by-day itinerary with times and logistics. Just talk naturally, Trailie figures out what you need.
              </Text>

              {/* Feature 2: Blog-Powered Answers */}
              <h3 style={{ margin: '24px 0 8px', fontSize: '16px', fontWeight: 800, color: '#111827' }}>
                📚 Blog-Powered Answers
              </h3>
              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                Trailie now draws from our published park guides when answering your questions. That means real visitor tips, seasonal advice, astrophotography spots, and on-the-ground details written from first-hand experience — not just generic travel info.
              </Text>

              {/* What You Can Do With Trailie */}
              <h3 style={{ margin: '24px 0 8px', fontSize: '16px', fontWeight: 800, color: '#111827' }}>
                💬 Things You Can Ask Trailie
              </h3>
              <Text style={{ margin: '0 0 6px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                <span style={{ fontWeight: 700 }}>"Plan a 3-day trip to Yellowstone for a family with kids"</span> — get a full itinerary with kid-friendly trails, campgrounds, and timing.
              </Text>
              <Text style={{ margin: '0 0 6px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                <span style={{ fontWeight: 700 }}>"Bryce Canyon or Zion for a beginner?"</span> — get an honest recommendation based on current conditions, not a wishy-washy "both are great!"
              </Text>
              <Text style={{ margin: '0 0 6px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                <span style={{ fontWeight: 700 }}>"Best time to visit Grand Teton?"</span> — get seasonal advice with real closure info and crowd levels.
              </Text>
              <Text style={{ margin: '0 0 6px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                <span style={{ fontWeight: 700 }}>"What should I pack for Death Valley in March?"</span> — get gear advice tailored to the specific park and season.
              </Text>
              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                <span style={{ fontWeight: 700 }}>"I have a bad knee — what hikes can I still do at Arches?"</span> — Trailie adjusts for your fitness level and flags accessibility info.
              </Text>

              {/* Still Has */}
              <Text style={{ margin: '24px 0 20px', fontSize: '14px', lineHeight: '1.6', color: '#6b7280' }}>
                Trailie still uses real-time NPS closures, campground availability, weather forecasts, and permit info — so every answer reflects what's actually happening at the park right now.
              </Text>

              {/* CTA */}
              <div style={{ textAlign: 'center', margin: '40px 0 16px' }}>
                <Button
                  href={planUrl}
                  style={{ display: 'inline-block', padding: '12px 24px', backgroundColor: '#06B569', color: '#ffffff', textDecoration: 'none', fontWeight: 700, fontSize: '15px', borderRadius: '8px' }}
                >
                  Chat with Trailie
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
                Thanks for being part of <span style={{ backgroundColor: '#D1FAE5', padding: '2px 4px' }}>TrailVerse</span>. Give Trailie a try and let us know what you think — and if you're enjoying it, share it with someone planning their next park trip.
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
