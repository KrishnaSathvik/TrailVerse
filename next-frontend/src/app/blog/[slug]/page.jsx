import { notFound } from 'next/navigation';
import BlogPostClient from './BlogPostClient';
import { blogMetaDescription, blogRobots } from '@/lib/blogSeo';

const SITE_URL = 'https://www.nationalparksexplorerusa.com';

function getApiBaseUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'http://127.0.0.1:5001/api';
  return configuredUrl.endsWith('/api') ? configuredUrl : `${configuredUrl}/api`;
}

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'https://trailverse.onrender.com/api').replace(/\/api\/?$/, '');

function toAbsoluteImageUrl(imageUrl) {
  if (!imageUrl || imageUrl.trim() === '' || imageUrl.startsWith('data:')) {
    return `${SITE_URL}/og-image-trailverse.jpg`;
  }

  // Social crawlers need a direct image URL — /_next/image routes don't work.
  // Blog images are relative paths like /uploads/blog/... served by the Express backend.
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }
  const path = imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`;
  return `${API_ORIGIN}${path}`;
}

async function getPostBySlug(slug) {
  try {
    const response = await fetch(`${getApiBaseUrl()}/blogs/${slug}`, {
      next: { revalidate: 60 }
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
  const description = blogMetaDescription(post.metaDescription || post.excerpt);
  const image = toAbsoluteImageUrl(post.featuredImage);
  const url = `${SITE_URL}/blog/${post.slug}`;

  return {
    title,
    description,
    robots: blogRobots(post),
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

  if (!post) {
    notFound();
  }

  const blogStructuredData = post
    ? {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: post.title,
        description: blogMetaDescription(post.metaDescription || post.excerpt),
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
          name: (post.author && post.author !== 'Admin') ? post.author : 'Krishna'
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
