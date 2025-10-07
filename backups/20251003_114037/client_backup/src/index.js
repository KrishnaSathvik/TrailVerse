import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import ErrorBoundary from './components/common/ErrorBoundary';
import reportWebVitals from './reportWebVitals';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

// Register service worker
serviceWorkerRegistration.register({
  onSuccess: () => console.log('Service Worker registered'),
  onUpdate: (registration) => {
    if (window.confirm('New version available! Reload to update?')) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      window.location.reload();
    }
  }
});

// Send to analytics
reportWebVitals((metric) => {
  console.log(metric);
  
  // Send to Google Analytics
  if (window.gtag) {
    window.gtag('event', metric.name, {
      value: Math.round(metric.value),
      event_category: 'Web Vitals',
      event_label: metric.id,
      non_interaction: true,
    });
  }
});
