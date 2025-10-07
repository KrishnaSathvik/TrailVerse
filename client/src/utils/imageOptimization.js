export const getOptimizedImageUrl = (url, width = 800) => {
  if (!url) return null;
  
  // If it's an NPS image, we can't optimize it
  if (url.includes('nps.gov')) {
    return url;
  }

  // For other images, you can use a service like Cloudinary or Imgix
  // Example with Cloudinary:
  // return `https://res.cloudinary.com/your-cloud/image/fetch/w_${width},f_auto,q_auto/${url}`;
  
  return url;
};

export const preloadImage = (src) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
};

export const preloadImages = (urls) => {
  return Promise.all(urls.map(url => preloadImage(url)));
};

export const getImageDimensions = (url) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight
      });
    };
    img.onerror = reject;
    img.src = url;
  });
};
