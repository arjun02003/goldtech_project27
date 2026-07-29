// Smart API routing: If we're on the Render backend, use relative URLs (same-origin)
// If we're on Vercel (or anywhere else), redirect API calls to the Render backend
const RENDER_HOSTS = ['goldtech-project27-1.onrender.com', 'localhost'];
const isOnBackend = RENDER_HOSTS.some(h => window.location.hostname.includes(h));

window.API_BASE_URL = isOnBackend ? '' : 'https://goldtech-project27-1.onrender.com';

const originalFetch = window.fetch;
window.fetch = function() {
  let [resource, config] = arguments;
  
  // If requesting the API, prefix with the backend URL (empty string if same-origin)
  if (typeof resource === 'string' && resource.startsWith('/api/')) {
    resource = window.API_BASE_URL + resource;
  }
  
  // Always include credentials (cookies) for cross-origin authentication
  if (!config) {
    config = {};
  }
  config.credentials = 'include';
  
  return originalFetch(resource, config);
};
