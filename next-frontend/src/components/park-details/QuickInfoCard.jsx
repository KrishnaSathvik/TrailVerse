import React from 'react';
import { Clock, DollarSign, Phone, Globe, MapPin } from '@components/icons';

const QuickInfoCard = ({ park }) => {
  const infoItems = [
    {
      icon: Clock,
      label: 'Hours',
      value: park.operatingHours?.[0]?.standardHours?.monday || 'Varies by season'
    },
    {
      icon: DollarSign,
      label: 'Entrance Fee',
      value: park.entranceFees?.[0]?.cost > 0 
        ? `$${park.entranceFees[0].cost}` 
        : 'Free'
    },
    {
      icon: Phone,
      label: 'Contact',
      value: park.contacts?.phoneNumbers?.[0]?.phoneNumber || 'N/A'
    },
    {
      icon: Globe,
      label: 'Website',
      value: park.url ? 'Visit Website' : 'N/A',
      link: park.url
    },
    {
      icon: MapPin,
      label: 'Address',
      value: park.addresses?.[0]?.line1 || 'N/A'
    }
  ];

  return (
    <div className="rounded-2xl p-6 backdrop-blur"
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)'
      }}
    >
      <h3 className="text-xl font-bold mb-4"
        style={{ color: 'var(--text-primary)' }}
      >
        Quick Info
      </h3>

      <div className="space-y-4">
        {infoItems.map((item, index) => {
          const Icon = item.icon;
          return (
            <div key={index} className="flex gap-3">
              <div className="flex-shrink-0 h-10 w-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: 'var(--surface-hover)' }}
              >
                <Icon className="h-5 w-5" style={{ color: 'var(--text-secondary)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium uppercase tracking-wider mb-1"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {item.label}
                </p>
                {item.link ? (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-forest-400 hover:text-forest-300"
                  >
                    {item.value}
                  </a>
                ) : (
                  <p className="text-sm font-semibold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {item.value}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default QuickInfoCard;
