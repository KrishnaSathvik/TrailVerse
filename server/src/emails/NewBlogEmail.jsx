import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
  Tailwind,
} from '@react-email/components';
import * as React from 'react';

const NewBlogEmail = ({
  username = 'there',
  blogTitle = 'Exploring America\'s Hidden Gems: Lesser-Known National Parks',
  blogExcerpt = 'Discover the hidden treasures of America\'s national park system. From the remote wilderness of Gates of the Arctic to the stunning beauty of Dry Tortugas, these lesser-known parks offer incredible experiences...',
  blogUrl = 'https://nationalparksexplorerusa.com/blog/latest-post',
  blogImageUrl = 'https://via.placeholder.com/600x300/059669/ffffff?text=National+Park+Blog',
  blogCategory = 'Park Guides',
  publishDate = 'January 15, 2025',
  readTime = '5 min read',
  authorName = 'TrailVerse Team',
}) => {
  const previewText = `New TrailVerse post: ${blogTitle}`;

  return (
    <Html>
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Head />
        <Body className="bg-gray-50 font-sans">
          <Container className="bg-white mx-auto my-0 max-w-[600px]">
            {/* Header */}
            <Section className="bg-purple-600 py-12 px-8 text-center">
              <Img
                src="https://www.nationalparksexplorerusa.com/android-chrome-192x192.png"
                width="64"
                height="64"
                alt="TrailVerse"
                className="mx-auto mb-6 rounded-xl"
              />
              <Heading className="text-white text-3xl font-bold m-0 mb-3">
                New Blog Post
              </Heading>
              <Text className="text-purple-100 text-lg m-0">
                Fresh insights from TrailVerse
              </Text>
            </Section>

            {/* Main Content */}
            <Section className="px-8 py-10">
              <div className="text-center mb-8">
                <Text className="text-gray-900 text-2xl font-bold m-0 mb-4">
                  Hi {username}!
                </Text>
                <Text className="text-gray-600 text-lg leading-relaxed m-0 max-w-2xl mx-auto">
                  We just published a new article about America's national parks that we think you'll love! Check it out below.
                </Text>
              </div>

              {/* Blog Post Card */}
              <Section className="border border-gray-200 rounded-xl overflow-hidden mb-10 shadow-sm">
                <div className="p-8 text-center">
                  {/* Category Badge */}
                  <div className="mb-6">
                    <span className="inline-block bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-full">
                      {blogCategory}
                    </span>
                  </div>
                  
                  {/* Title */}
                  <Heading className="text-gray-900 text-2xl font-bold m-0 mb-6 leading-tight">
                    {blogTitle}
                  </Heading>

                  {/* Meta Info */}
                  <div className="flex items-center justify-center gap-6 mb-6 text-base text-gray-500">
                    <div className="flex items-center gap-2">
                      <Text className="m-0">📅</Text>
                      <Text className="m-0">{publishDate}</Text>
                    </div>
                    <div className="flex items-center gap-2">
                      <Text className="m-0">⏱️</Text>
                      <Text className="m-0">{readTime}</Text>
                    </div>
                  </div>

                  {/* Excerpt */}
                  <Text className="text-gray-600 text-base leading-relaxed mb-8 max-w-2xl mx-auto">
                    {blogExcerpt}
                  </Text>
                  {/* CTA Button */}
                  <Button
                    className="bg-green-600 text-white rounded-xl px-8 py-4 text-lg font-bold no-underline inline-block shadow-lg"
                    href={blogUrl}
                  >
                    📖 Read Full Article
                  </Button>
                </div>
              </Section>

              {/* Blog CTA */}
              <div className="bg-green-50 rounded-xl p-8 mb-10 border border-green-200 text-center">
                <Text className="text-gray-900 text-xl font-bold m-0 mb-4">
                  Explore More Articles
                </Text>
                <Text className="text-gray-600 text-base m-0 mb-6">
                  Discover more amazing articles about national parks, hiking tips, and travel guides on our blog.
                </Text>
                <Button
                  className="bg-green-600 text-white rounded-xl px-8 py-4 text-lg font-bold no-underline inline-block shadow-lg"
                  href="https://nationalparksexplorerusa.com/blog"
                >
                  📚 Visit Our Blog
                </Button>
              </div>

              {/* Preferences */}
              <div className="text-center">
                <Text className="text-gray-600 text-base m-0 mb-4">
                  Manage your email preferences
                </Text>
                <div className="text-center">
                  <Link 
                    href="https://nationalparksexplorerusa.com/preferences" 
                    className="text-green-600 text-base font-semibold underline inline-block mr-6"
                  >
                    ⚙️ Update Preferences
                  </Link>
                  <Link 
                    href="https://nationalparksexplorerusa.com/unsubscribe" 
                    className="text-gray-500 text-base font-semibold underline inline-block mr-6"
                  >
                    📧 Unsubscribe
                  </Link>
                </div>
              </div>
            </Section>

            {/* Footer */}
            <Section className="bg-gray-100 px-8 py-8 border-t border-gray-200">
              <div className="text-center">
                <div className="flex items-center justify-center gap-3 mb-4">
                  <Img
                    src="https://www.nationalparksexplorerusa.com/android-chrome-192x192.png"
                    width="32"
                    height="32"
                    alt="TrailVerse"
                    className="rounded-lg"
                  />
                  <Text className="text-gray-800 text-lg font-bold m-0">
                    TrailVerse
                  </Text>
                </div>
                <Text className="text-gray-500 text-sm m-0 mb-2">
                  You're receiving this because you subscribed to TrailVerse blog updates.
                </Text>
                <Text className="text-gray-500 text-sm m-0">
                  © 2025 TrailVerse. All rights reserved.
                </Text>
              </div>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default NewBlogEmail;
