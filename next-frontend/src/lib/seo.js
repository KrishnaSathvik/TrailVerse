/** @type {import('next').Metadata} */
export const privatePageRobots = {
  index: false,
  follow: false,
};

/** @type {import('next').Metadata['robots']} */
export const indexablePageRobots = {
  index: true,
  follow: true,
  googleBot: {
    index: true,
    follow: true,
  },
};

/**
 * @param {{ title: string; description?: string }} options
 * @returns {import('next').Metadata}
 */
export function privatePageMetadata({ title, description }) {
  return {
    title,
    ...(description ? { description } : {}),
    robots: privatePageRobots,
  };
}
