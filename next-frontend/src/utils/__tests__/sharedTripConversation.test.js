import { describe, expect, it } from 'vitest';
import {
  filterParkChatImages,
  isUsableParkChatImageUrl,
} from '../parkChatImages';
import {
  resolveSharedTripParkLink,
  sharedTripConversationMayBeIncomplete,
} from '../sharedTripConversation';

describe('parkChatImages', () => {
  it('accepts direct NPS jpeg uploads', () => {
    expect(
      isUsableParkChatImageUrl(
        'https://www.nps.gov/common/uploads/structured_data/68BFC1AC-BF96-629F-89D261D78F181C64.jpg'
      )
    ).toBe(true);
  });

  it('rejects npgallery asset pages', () => {
    expect(
      isUsableParkChatImageUrl(
        'https://www.nps.gov/npgallery/GetAsset/C8C103AD-06F5-4EAE-ACFA-F5E4670C3E0A'
      )
    ).toBe(false);
  });

  it('filters broken gallery urls from chat attachments', () => {
    const images = [
      { url: 'https://www.nps.gov/common/uploads/structured_data/photo.jpg' },
      { url: 'https://www.nps.gov/npgallery/GetAsset/abc' },
    ];
    expect(filterParkChatImages(images)).toHaveLength(1);
  });
});

describe('sharedTripConversationMayBeIncomplete', () => {
  it('flags day plans without wrap-up sections', () => {
    const conversation = [
      {
        role: 'assistant',
        content: '## Day 1\n- hike\n\n## Day 4\n- drive home\n'.repeat(80),
      },
    ];
    expect(sharedTripConversationMayBeIncomplete(conversation)).toBe(true);
  });
});

describe('resolveSharedTripParkLink', () => {
  it('resolves Zion from conversation when trip title is generic', () => {
    const trip = {
      parkName: 'General Planning',
      title: 'General Planning Session',
      conversation: [
        { role: 'assistant', parkNames: ['Zion'], content: 'Plan for Zion' },
      ],
    };
    const link = resolveSharedTripParkLink(trip);
    expect(link?.href).toBe('/parks/zion-national-park');
    expect(link?.name).toMatch(/Zion/i);
  });

  it('does not create a slug for generic planning labels', () => {
    const trip = {
      parkName: 'General Planning',
      conversation: [],
    };
    expect(resolveSharedTripParkLink(trip)).toBeNull();
  });
});
