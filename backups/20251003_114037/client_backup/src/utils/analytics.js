import ReactGA from 'react-ga4';

const TRACKING_ID = process.env.REACT_APP_GA_TRACKING_ID;

export const initGA = () => {
  if (TRACKING_ID) {
    ReactGA.initialize(TRACKING_ID, {
      gaOptions: {
        siteSpeedSampleRate: 100
      }
    });
    console.log('✅ Google Analytics initialized');
  }
};

export const logPageView = () => {
  ReactGA.send({ 
    hitType: 'pageview', 
    page: window.location.pathname + window.location.search 
  });
};

export const trackPageView = (path) => {
  ReactGA.send({ hitType: 'pageview', page: path });
};

export const logEvent = (category, action, label) => {
  ReactGA.event({
    category,
    action,
    label
  });
};

export const trackEvent = (category, action, label) => {
  ReactGA.event({ category, action, label });
};

// Custom events
export const logParkView = (parkName) => {
  logEvent('Park', 'View', parkName);
};

export const logSearch = (searchQuery) => {
  logEvent('Search', 'Query', searchQuery);
};

export const logShare = (platform, content) => {
  logEvent('Share', platform, content);
};

export const logAIChat = (message) => {
  logEvent('AI', 'Chat', message);
};

export const logBlogView = (blogTitle) => {
  logEvent('Blog', 'View', blogTitle);
};

export const logEventView = (eventTitle) => {
  logEvent('Event', 'View', eventTitle);
};

export const logUserAction = (action, details) => {
  logEvent('User', action, details);
};
