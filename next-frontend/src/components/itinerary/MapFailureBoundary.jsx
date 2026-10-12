'use client';

import * as React from 'react';

/**
 * Maps runtime failures must degrade quietly — never take down the trip page.
 */
export default class MapFailureBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.warn('[ItineraryMapView] map runtime failed; showing fallback', error?.message);
  }

  render() {
    return this.state.failed
      ? <div className="h-full w-full" data-testid="itinerary-map-runtime-blocked" />
      : this.props.children;
  }
}
