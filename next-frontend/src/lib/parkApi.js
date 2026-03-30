const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';

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

export async function getParkDetails(parkCode) {
  const res = await fetch(`${BASE_URL}/parks/${parkCode}/details`, {
    next: { revalidate: 1800 },
  });

  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Failed to fetch park details: ${res.status}`);
  }

  const json = await res.json();
  return json.data;
}
