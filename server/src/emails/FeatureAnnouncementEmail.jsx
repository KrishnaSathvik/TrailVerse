import {
  Body,
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
  chatgptUrl = 'https://chatgpt.com/plugins/trailverse',
  planUrl = 'https://www.nationalparksexplorerusa.com/plan-ai',
  itinerariesUrl = 'https://www.nationalparksexplorerusa.com/itineraries',
  unsubscribeUrl = 'https://www.nationalparksexplorerusa.com/unsubscribe',
}) => {
  const previewText = "It's been a while since I shared an update about TrailVerse.";

  const textStyle = { margin: '0 0 20px', fontSize: '15px', lineHeight: '1.65', color: '#111827' };
  const linkStyle = { color: '#06B569', textDecoration: 'underline', fontWeight: 700 };
  const trailieIcon = 'https://www.nationalparksexplorerusa.com/trailie-avatar.png';
  const chatgptIcon = 'https://www.nationalparksexplorerusa.com/brand/chatgpt.png';
  const iconStyle = { display: 'inline-block', verticalAlign: 'middle', marginRight: '6px' };

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

              <Text style={textStyle}>Hey everyone,</Text>

              <Text style={textStyle}>
                It&apos;s been a while since I shared an update about TrailVerse!
              </Text>

              <Text style={textStyle}>
                I&apos;ve been making a lot of improvements to Trailie, especially around making travel planning feel more natural. You can ask questions, explore destinations, build a trip, and change your plans just by having a conversation.
              </Text>

              <Text style={textStyle}>
                You can give Trailie a try here:
                <br />
                <Link href={planUrl} style={linkStyle}>
                  <Img src={trailieIcon} alt="" width="18" height="18" style={iconStyle} />
                  {planUrl}
                </Link>
              </Text>

              <Text style={textStyle}>
                I&apos;ve also added <strong>sample itineraries</strong> if you&apos;re looking for inspiration. You can explore trips to Yellowstone, Yosemite, Glacier, Utah, and more:
                <br />
                <Link href={itinerariesUrl} style={linkStyle}>{itinerariesUrl}</Link>
              </Text>

              <Text style={textStyle}>
                And something else I&apos;m excited about—<strong>TrailVerse is also available in ChatGPT!</strong> You can use it to explore national parks, check park information, compare destinations, and plan trips right from a ChatGPT conversation:
                <br />
                <Link href={chatgptUrl} style={linkStyle}>
                  <Img src={chatgptIcon} alt="" width="18" height="18" style={iconStyle} />
                  {chatgptUrl}
                </Link>
              </Text>

              <Text style={textStyle}>
                Beyond Trailie, I&apos;ve been making a lot of smaller improvements throughout TrailVerse to make exploring destinations and planning trips easier.
              </Text>

              <Text style={textStyle}>
                If you have a trip in mind, even just a rough idea, I&apos;d really love for you to try Trailie and see how it feels.
              </Text>

              <Text style={textStyle}>
                And if something doesn&apos;t work well, or there&apos;s something you wish it could do, email me at{' '}
                <Link href="mailto:trailverseteam@gmail.com" style={linkStyle}>trailverseteam@gmail.com</Link>
                . That feedback genuinely helps me figure out what to improve next.
              </Text>

              <Text style={textStyle}>
                Thanks for following along and supporting TrailVerse!
              </Text>

              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
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
