const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://trailverse.onrender.com/api'
    : 'http://localhost:5001/api');

export async function getAllParkCodes() {
  const res = await fetch(`${BASE_URL}/parks?all=true&nationalParksOnly=true`, {
    next: { revalidate: 86400 },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch park codes: ${res.status}`);
  }

  const json = await res.json();
  return json.data.map((park) => park.parkCode);
}

export async function getAllParkSlugs() {
  const res = await fetch(`${BASE_URL}/parks?all=true&nationalParksOnly=true`, {
    next: { revalidate: 86400 },
  });
  if (!res.ok) throw new Error(`Failed to fetch park slugs: ${res.status}`);
  const json = await res.json();
  return json.data.map((park) => ({
    code: park.parkCode,
    slug: park.fullName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim(),
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
