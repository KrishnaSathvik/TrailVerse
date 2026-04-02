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

const NewBlogEmail = ({
  username = 'there',
  blogTitle = 'Exploring America\'s Hidden Gems: Lesser-Known National Parks',
  blogExcerpt = 'Discover the hidden treasures of America\'s national park system. From the remote wilderness of Gates of the Arctic to the stunning beauty of Dry Tortugas, these lesser-known parks offer incredible experiences...',
  blogUrl = 'https://nationalparksexplorerusa.com/blog/latest-post',
  blogImageUrl = '',
  blogCategory = 'Park Guides',
  publishDate = 'January 15, 2025',
  readTime = '5 min read',
  authorName = 'TrailVerse Team',
}) => {
  const previewText = `New TrailVerse post: ${blogTitle}`;

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

              <Text style={{ margin: '0 0 24px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                We just published a new article on the <span style={{ backgroundColor: '#D1FAE5', padding: '2px 4px' }}>TrailVerse</span> blog that we think you'll love!
              </Text>

              {/* Blog Post */}
              <h3 style={{ margin: '32px 0 16px', fontSize: '18px', fontWeight: 800, color: '#111827' }}>
                📖 {blogTitle}
              </h3>

              <Text style={{ margin: '0 0 8px', fontSize: '13px', lineHeight: '1.6', color: '#6b7280' }}>
                {blogCategory} · {publishDate} · {readTime} · by {authorName}
              </Text>

              <Text style={{ margin: '0 0 24px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                {blogExcerpt}
              </Text>

              {/* CTA */}
              <div style={{ textAlign: 'center', margin: '40px 0 32px' }}>
                <Button
                  href={blogUrl}
                  style={{ display: 'inline-block', padding: '12px 24px', backgroundColor: '#06B569', color: '#ffffff', textDecoration: 'none', fontWeight: 700, fontSize: '15px', borderRadius: '8px' }}
                >
                  Read Full Article
                </Button>
              </div>

              {/* Explore More */}
              <h3 style={{ margin: '32px 0 16px', fontSize: '18px', fontWeight: 800, color: '#111827' }}>
                💡 Explore More
              </h3>
              <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.6', color: '#111827' }}>
                Discover more articles about national parks, hiking tips, and travel guides on our blog. Let's make every adventure count!
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
                  You're receiving this because you subscribed to TrailVerse blog updates.
                </Text>
                <Text style={{ margin: 0, fontSize: '11px' }}>
                  <Link href="https://nationalparksexplorerusa.com/unsubscribe" style={{ color: '#06B569', textDecoration: 'underline' }}>
                    Unsubscribe
                  </Link>
                  {' · '}
                  <Link href="https://nationalparksexplorerusa.com/blog" style={{ color: '#06B569', textDecoration: 'underline' }}>
                    Visit blog
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

export default NewBlogEmail;
