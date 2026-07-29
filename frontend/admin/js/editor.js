// State
let pageFile = '';
let isDirty = false;

// DOM Elements
const iframe = document.getElementById('editorIframe');
const iframeWrapper = document.getElementById('iframeWrapper');
const pageTitleLabel = document.getElementById('pageTitleLabel');
const pagePathLabel = document.getElementById('pagePathLabel');
const savePageBtn = document.getElementById('savePageBtn');
const saveOverlay = document.getElementById('saveOverlay');
const saveStatusText = document.getElementById('saveStatusText');
const toastEl = document.getElementById('toast');
const deviceButtons = document.querySelectorAll('.device-btn');

// Extract page query param
function initEditor() {
  const urlParams = new URLSearchParams(window.location.search);
  pageFile = urlParams.get('page');
  
  if (!pageFile) {
    alert('No page specified to edit.');
    window.location.href = '/admin/index.html';
    return;
  }

  // Set path label
  pagePathLabel.textContent = `File: /${pageFile}`;
  
  // Format page title label from name
  const name = pageFile.split('/')[0];
  const formattedTitle = name === 'index.html' 
    ? 'Homepage' 
    : name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  pageTitleLabel.textContent = `Editing: ${formattedTitle}`;

  // Load page in iframe with editor parameter
  // Pass token as query param for iframe auth (browser can't send Authorization headers on iframe src)
  const token = localStorage.getItem('admin_token') || '';
  const backendBase = window.API_BASE_URL || '';
  iframe.src = `${backendBase}/${pageFile}?admin_edit=true&auth_token=${encodeURIComponent(token)}`;

  // Set dirty flag when iframe documents receive edits
  window.addEventListener('message', (event) => {
    if (event.data === 'content_changed') {
      isDirty = true;
      savePageBtn.classList.add('pulse'); // we can style this later
    }
  });
}

// Device Viewport switches
deviceButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const size = btn.getAttribute('data-size');
    
    // Toggle active btn
    deviceButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // Toggle class on wrapper
    iframeWrapper.className = 'editor-iframe-wrapper ' + size;
  });
});

// Save Page logic
async function savePage() {
  if (!iframe.contentWindow) return;

  saveStatusText.textContent = 'Cleaning and saving page...';
  saveOverlay.classList.add('active');

  try {
    // Read the current DOM HTML directly from the iframe
    const doc = iframe.contentWindow.document;
    
    // Let the injected script know we are about to save, so it can clean up
    if (iframe.contentWindow.prepareForSave) {
      iframe.contentWindow.prepareForSave();
    }
    
    // Wait a brief moment for the cleanup to run
    await new Promise(resolve => setTimeout(resolve, 100));

    const htmlContent = doc.documentElement.outerHTML;
    
    // Re-enable contenteditable after getting the HTML (if we stay in the editor)
    if (iframe.contentWindow.restoreAfterSave) {
      iframe.contentWindow.restoreAfterSave();
    }

    // Send payload
    const res = await fetch('/api/pages/write', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        file: pageFile,
        html: '<!DOCTYPE html>\n' + htmlContent
      })
    });

    if (res.ok) {
      isDirty = false;
      // Clear pages cache so admin panel reloads fresh data
      pagesCache = null;
      showToast('Page saved successfully!', 'success');
    } else {
      let errMsg = `Save failed (HTTP ${res.status})`;
      try { const d = await res.json(); errMsg = d.error || errMsg; } catch(e) {}
      showToast(errMsg, 'error');
    }
  } catch (err) {
    console.error('Failed to save:', err);
    showToast('Network error: ' + (err.message || 'Check console for details'), 'error');
  } finally {
    saveOverlay.classList.remove('active');
  }
}

// Attach listener to save button
savePageBtn.addEventListener('click', savePage);

// Navigation safety check
function goBack() {
  if (isDirty) {
    if (confirm('You have unsaved changes. Are you sure you want to discard them?')) {
      window.location.href = '/admin/index.html';
    }
  } else {
    window.location.href = '/admin/index.html';
  }
}

// Toast notification helper
function showToast(message, type = 'success') {
  const toastText = document.getElementById('toastText');
  const toastIcon = document.getElementById('toastIcon');
  
  toastEl.className = 'toast'; // reset class
  toastEl.classList.add('show');
  
  if (type === 'success') {
    toastEl.classList.add('toast-success');
    toastIcon.setAttribute('data-feather', 'check-circle');
    toastIcon.style.color = 'var(--success)';
  } else {
    toastEl.classList.add('toast-error');
    toastIcon.setAttribute('data-feather', 'alert-circle');
    toastIcon.style.color = 'var(--danger)';
  }
  
  toastText.textContent = message;
  feather.replace();

  setTimeout(() => {
    toastEl.classList.remove('show');
  }, 4000);
}

// Trigger initializations
initEditor();
// Warn user before closing window with unsaved changes
window.onbeforeunload = function() {
  if (isDirty) {
    return 'You have unsaved changes. Are you sure you want to leave?';
  }
};
