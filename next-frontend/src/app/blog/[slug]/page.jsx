import BlogPostClient from './BlogPostClient';

const SITE_URL = 'https://www.nationalparksexplorerusa.com';

function getApiBaseUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'http://127.0.0.1:5001/api';
  return configuredUrl.endsWith('/api') ? configuredUrl : `${configuredUrl}/api`;
}

function toAbsoluteImageUrl(imageUrl) {
  if (!imageUrl || imageUrl.trim() === '' || imageUrl.startsWith('data:')) {
    return `${SITE_URL}/og-image-trailverse.jpg`;
  }

  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }

  return imageUrl.startsWith('/') ? `${SITE_URL}${imageUrl}` : `${SITE_URL}/${imageUrl}`;
}

async function getPostBySlug(slug) {
  try {
    const response = await fetch(`${getApiBaseUrl()}/blogs/${slug}`, {
      next: { revalidate: 300 }
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    return payload?.data || null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  if (!post) {
    return {
      title: 'This story isn’t available | TrailVerse',
      description: 'The requested blog post could not be found.'
    };
  }

  const title = `${post.title} | TrailVerse`;
  const description = post.excerpt || 'Read the latest national park stories and planning guides on TrailVerse.';
  const image = toAbsoluteImageUrl(post.featuredImage);
  const url = `${SITE_URL}/blog/${post.slug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: 'TrailVerse',
      images: [{ url: image, width: 1200, height: 630, alt: post.title }],
      type: 'article'
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image]
    }
  };
}

export default async function BlogPostPage({ params }) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  const blogStructuredData = post
    ? {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: post.title,
        description: post.excerpt,
        image: [
          {
            '@type': 'ImageObject',
            url: toAbsoluteImageUrl(post.featuredImage),
            width: 1200,
            height: 630
          }
        ],
        author: {
          '@type': 'Person',
          name: post.author || 'TrailVerse Team'
        },
        publisher: {
          '@type': 'Organization',
          name: 'TrailVerse',
          logo: {
            '@type': 'ImageObject',
            url: `${SITE_URL}/logo.png`,
            width: 512,
            height: 512
          }
        },
        datePublished: post.publishedAt,
        dateModified: post.updatedAt || post.publishedAt,
        mainEntityOfPage: {
          '@type': 'WebPage',
          '@id': `${SITE_URL}/blog/${post.slug}`
        },
        articleSection: post.category || 'Travel',
        keywords: post.tags?.length ? post.tags.join(', ') : undefined,
        wordCount: post.content ? post.content.split(/\s+/).filter(Boolean).length : 0,
        inLanguage: 'en-US',
        url: `${SITE_URL}/blog/${post.slug}`
      }
    : null;

  const breadcrumbStructuredData = post
    ? {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}/blog` },
          { '@type': 'ListItem', position: 3, name: post.title, item: `${SITE_URL}/blog/${post.slug}` }
        ]
      }
    : null;

  return (
    <>
      {blogStructuredData && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(blogStructuredData) }}
        />
      )}
      {breadcrumbStructuredData && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbStructuredData) }}
        />
      )}
      {post?.seoSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: post.seoSchema }}
        />
      )}
      <BlogPostClient slug={slug} initialPost={post} />
    </>
  );
}
