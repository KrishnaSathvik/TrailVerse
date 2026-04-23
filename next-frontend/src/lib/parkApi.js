import { parkToSlug } from '@/utils/parkSlug';
import parkSlugsData from '@/data/park-slugs.json';

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://trailverse.onrender.com/api'
    : 'http://localhost:5001/api');

export async function getAllParkCodes() {
  // National parks only (subset of the prebuild slug list)
  return parkSlugsData
    .filter((p) =>
      (p.designation && p.designation.toLowerCase().includes('national park')) ||
      (p.fullName && p.fullName.toLowerCase().includes('national park'))
    )
    .map((p) => p.parkCode);
}

export async function getAllParkSlugs() {
  return parkSlugsData.map((park) => ({
    code: park.parkCode,
    slug: parkToSlug(park.fullName),
    fullName: park.fullName,
  }));
}

export async function getParkDetailsBySlug(slug) {
  const slugs = await getAllParkSlugs();
  const match = slugs.find((p) => p.slug === slug);
  if (!match) return null;
  return getParkDetails(match.code);
}

export async function getParkDetails(parkCode) {
  try {
    const res = await fetch(`${BASE_URL}/parks/${parkCode}/details`, {
      next: { revalidate: 300 }, // 5 minutes — park details include dynamic NPS data
    });

    if (!res.ok) {
      if (res.status !== 404) {
        console.error(`Failed to fetch park details for ${parkCode}: ${res.status}`);
      }
      return null;
    }

    const json = await res.json();
    return json.data;
  } catch (error) {
    console.error(`Error fetching park details for ${parkCode}:`, error);
    return null;
  }
}
