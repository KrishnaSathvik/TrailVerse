import {
  getWebcamCta,
  getWebcamImage,
  getWebcamStatusDisplay,
  sanitizeNpsImageUrl,
} from '../webcamUtils';

describe('webcamUtils', () => {
  it('fixes doubled NPS image hosts', () => {
    expect(
      sanitizeNpsImageUrl(
        'https://www.nps.govhttps://www.nps.gov/common/uploads/webcam/test.jpg'
      )
    ).toBe('https://www.nps.gov/common/uploads/webcam/test.jpg');
  });

  it('returns sanitized webcam image', () => {
    const img = getWebcamImage({
      title: 'Test Cam',
      images: [
        {
          url: 'https://www.nps.govhttps://www.nps.gov/common/uploads/webcam/a.jpg',
          altText: 'view',
        },
      ],
    });
    expect(img?.url).toBe('https://www.nps.gov/common/uploads/webcam/a.jpg');
    expect(img?.alt).toBe('view');
  });

  it('uses View on NPS for inactive feeds', () => {
    const cta = getWebcamCta({
      url: 'https://www.nps.gov/media/webcam/view.htm?id=1',
      status: 'Inactive',
      statusMessage: 'Camera offline for maintenance.',
      isStreaming: true,
    });
    expect(cta.label).toBe('View on NPS');
    expect(cta.hint).toContain('offline');
  });

  it('uses Open livestream for active streaming feeds', () => {
    const cta = getWebcamCta({
      url: 'https://www.nps.gov/media/webcam/view.htm?id=1',
      status: 'Active',
      isStreaming: true,
    });
    expect(cta.label).toBe('Open livestream');
  });

  it('classifies active status', () => {
    expect(getWebcamStatusDisplay({ status: 'Active' }).isActive).toBe(true);
  });
});
