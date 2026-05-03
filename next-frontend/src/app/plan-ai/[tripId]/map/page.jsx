import { redirect } from 'next/navigation';

export default async function Page({ params }) {
  const { tripId } = await params;
  redirect(`/plan-ai/${tripId}/plan`);
}
