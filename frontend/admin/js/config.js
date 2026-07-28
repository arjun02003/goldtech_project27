window.API_BASE_URL = 'https://goldtech-backend.onrender.com'; // Change this to your actual backend deployed URL (e.g. Render, Heroku)
// For local development, use 'http://localhost:3000'

const originalFetch = window.fetch;
window.fetch = function() {
  let [resource, config] = arguments;
  
  // If requesting the API, prefix with the backend URL
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
