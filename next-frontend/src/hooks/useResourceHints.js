import { useEffect } from 'react';

export const useResourceHints = () => {
  const prefetchPage = (url) => {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = url;
    document.head.appendChild(link);
  };

  const preconnectDomain = (domain) => {
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = domain;
    document.head.appendChild(link);
  };

  return { prefetchPage, preconnectDomain };
};

export default useResourceHints;
