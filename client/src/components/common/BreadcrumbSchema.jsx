import React from 'react';

const BreadcrumbSchema = ({ items }) => {
  if (!items || items.length === 0) return null;

  const breadcrumbStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url
    }))
  };

  return (
    <script type="application/ld+json">
      {JSON.stringify(breadcrumbStructuredData)}
    </script>
  );
};

export default BreadcrumbSchema;
