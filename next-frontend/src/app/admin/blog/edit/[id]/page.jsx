'use client';

import { useParams } from 'next/navigation';
import BlogPostForm from '@/components/admin/BlogPostForm';

export default function EditBlogPage() {
  const params = useParams();
  return <BlogPostForm mode="edit" postId={params.id} />;
}
