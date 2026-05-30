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
  exploreByActivityUrl = 'https://www.nationalparksexplorerusa.com/discover',
  mapUrl = 'https://www.nationalparksexplorerusa.com/map',
  compareUrl = 'https://www.nationalparksexplorerusa.com/compare',
  chatgptUrl = 'https://chatgpt.com/apps/trailverse/asdk_app_69e9c67943c08191a37c464b803ebdbe',
  planUrl = 'https://www.nationalparksexplorerusa.com/plan-ai',
  exploreUrl = 'https://www.nationalparksexplorerusa.com/explore',
  testimonialsUrl = 'https://www.nationalparksexplorerusa.com/testimonials',
  unsubscribeUrl = 'https://www.nationalparksexplorerusa.com/unsubscribe',
}) => {
  const previewText =
    'TrailVerse is officially a ChatGPT app — plus park pages, voice, map, and more.';

  const linkStyle = { color: '#06B569', textDecoration: 'underline', fontWeight: 700 };

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={{ margin: 0, padding: 0, backgroundColor: '#0B1D0F', fontFamily, WebkitFontSmoothing: 'antialiased', color: '#111827' }}>
        <Section style={{ backgroundColor: '#0B1D0F', padding: '40px 20px' }}>
          <Container style={{ maxWidth: '600px', backgroundColor: '#ffffff', margin: '0 auto' }}>
            <Section style={{ padding: '40px 50px' }}>

              <div style={{ textAlign: 'center', marginBottom: '32px' }}>
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

              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                Hey {username} 👋
              </Text>

              <Text style={{ margin: '0 0 24px', fontSize: '15px', lineHeight: '1.65', color: '#111827' }}>
                Been a while since my last update. I&apos;ve been fixing bugs, working through suggestions, and shipping changes on{' '}
                <span style={{ backgroundColor: '#D1FAE5', padding: '2px 4px', fontWeight: 700 }}>TrailVerse</span>. Here&apos;s what&apos;s new — biggest first:
              </Text>

              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.65', color: '#111827' }}>
                After a long wait, <strong>TrailVerse is officially a ChatGPT app</strong>. Open ChatGPT → <strong>Apps</strong> → search <strong>TrailVerse</strong> (or{' '}
                <Link href={chatgptUrl} style={linkStyle}>
                  try here
                </Link>
                ). From there you can plan trips, get park details (weather, alerts, fees, campgrounds), compare parks, search 470+ NPS sites, and find ranger programs — the same stuff you get on TrailVerse, just inside ChatGPT.
              </Text>

              <Hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '8px 0 32px' }} />

              <h2 style={{ margin: '0 0 24px', fontSize: '20px', fontWeight: 800, color: '#111827', letterSpacing: '-0.02em' }}>
                A few more updates:
              </h2>

              <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 800, color: '#111827' }}>
                🏞️ Park pages — easier tabs
              </h3>
              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                Same sections as before (overview, alerts, things to do, campgrounds, photos, and more) — I redesigned the tab layout so everything is easier to find in one place. See it on{' '}
                <Link href="https://www.nationalparksexplorerusa.com/parks/yellowstone-national-park" style={linkStyle}>
                  Yellowstone
                </Link>
                .
              </Text>

              <h3 style={{ margin: '24px 0 8px', fontSize: '16px', fontWeight: 800, color: '#111827' }}>
                💬 Trailie — polished
              </h3>
              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                The planner chat you already know, cleaned up a bit.{' '}
                <Link href={planUrl} style={linkStyle}>
                  Open Trailie
                </Link>
              </Text>

              <h3 style={{ margin: '24px 0 8px', fontSize: '16px', fontWeight: 800, color: '#111827' }}>
                🎙️ Voice on every page
              </h3>
              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                Tap the mic anywhere on TrailVerse and ask Trailie out loud — no typing, no jumping to a separate screen.
              </Text>

              <h3 style={{ margin: '24px 0 8px', fontSize: '16px', fontWeight: 800, color: '#111827' }}>
                🧭 Explore by Activity
              </h3>
              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                Browse by activity, park type, state, and topic — learn what you can do and find parks that match.{' '}
                <Link href={exploreByActivityUrl} style={linkStyle}>
                  Explore by Activity
                </Link>
              </Text>

              <h3 style={{ margin: '24px 0 8px', fontSize: '16px', fontWeight: 800, color: '#111827' }}>
                🚌 Transit tab on park pages
              </h3>
              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                Shuttles, stops, and getting around inside the park — on the park page, in the Transit tab.
              </Text>

              <h3 style={{ margin: '24px 0 8px', fontSize: '16px', fontWeight: 800, color: '#111827' }}>
                🗺️ Map — redesigned
              </h3>
              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                All NPS parks and sites on one map; search a park, see nearby sights and campgrounds, tap a pin for details.{' '}
                <Link href={mapUrl} style={linkStyle}>
                  Open the map
                </Link>
              </Text>

              <h3 style={{ margin: '24px 0 8px', fontSize: '16px', fontWeight: 800, color: '#111827' }}>
                ⚖️ Compare — any park type
              </h3>
              <Text style={{ margin: '0 0 28px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                Not just the 63 national parks — monuments, recreation areas, historic sites, and more.{' '}
                <Link href={compareUrl} style={linkStyle}>
                  Compare parks
                </Link>
              </Text>

              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.7', color: '#111827' }}>
                If a trip went well, I&apos;d love a{' '}
                <Link href={testimonialsUrl} style={linkStyle}>
                  testimonial
                </Link>{' '}
                or a quick review on a park page — only if you want to. It really helps the next person planning.
              </Text>

              <div style={{ textAlign: 'center', margin: '36px 0 32px' }}>
                <Button
                  href={exploreUrl}
                  style={{ display: 'inline-block', padding: '14px 28px', backgroundColor: '#06B569', color: '#ffffff', textDecoration: 'none', fontWeight: 700, fontSize: '15px', borderRadius: '8px' }}
                >
                  Explore parks
                </Button>
              </div>

              <Text style={{ margin: '0 0 24px', fontSize: '15px', lineHeight: '1.6', color: '#111827', textAlign: 'center' }}>
                Follow along on Instagram:{' '}
                <Link href="https://instagram.com/travelswithkrishna" style={linkStyle}>
                  @travelswithkrishna
                </Link>
              </Text>

              <Text style={{ margin: '0 0 16px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                Thanks for being here. If TrailVerse helped you plan a trip, tell a friend who&apos;s heading to a park this year.
              </Text>
              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                Happy trails,
                <br />
                Krishna
              </Text>

              <Hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '40px 0 32px' }} />

              <div style={{ textAlign: 'center' }}>
                <div style={{ marginBottom: '16px' }}>
                  <span style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.05em', color: '#111827' }}>
                    TrailVerse
                  </span>
                </div>
                <Text style={{ margin: '0 0 8px', fontSize: '11px', color: '#6b7280' }}>
                  You&apos;re receiving this because you have a TrailVerse account.
                </Text>
                <Text style={{ margin: 0, fontSize: '11px' }}>
                  <Link href="https://www.nationalparksexplorerusa.com/faq" style={linkStyle}>
                    FAQ
                  </Link>
                  {' · '}
                  <Link href="mailto:trailverseteam@gmail.com" style={linkStyle}>
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
