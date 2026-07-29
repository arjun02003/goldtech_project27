// Global state
let pages = [];
let uploads = [];

// DOM Elements
const pagesGrid = document.getElementById('pagesGrid');
const galleryGrid = document.getElementById('galleryGrid');
const createModal = document.getElementById('createModal');
const createPageForm = document.getElementById('createPageForm');
const pageTitleInput = document.getElementById('pageTitle');
const pageSlugInput = document.getElementById('pageSlug');
const pageImageSelect = document.getElementById('pageImage');
const fileInput = document.getElementById('fileInput');
const dropzone = document.getElementById('dropzone');
const logoutBtn = document.getElementById('logoutBtn');
const toastEl = document.getElementById('toast');

// Check authentication status first
async function checkAuthentication() {
  try {
    const res = await fetch('/api/auth-status');
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const data = await res.json();
    if (!data.authenticated) {
      window.location.href = '/admin/login.html?redirect=' + encodeURIComponent(window.location.pathname);
    }
  } catch (err) {
    console.error('Failed to verify auth status:', err);
    pagesGrid.innerHTML = `<div class="error-state">
      <h3>Backend Connection Failed ❌</h3>
      <p>Cannot connect to the backend server. If you deployed to Vercel, you also need to deploy the <b>backend</b> folder to Render or cPanel, and update the URL in <code>frontend/admin/js/config.js</code>.</p>
      <p>Error: ${err.message}</p>
    </div>`;
  }
}

// Tab Switching logic
const navItems = document.querySelectorAll('.sidebar .nav-links .nav-item');
const tabContents = document.querySelectorAll('.tab-content');

navItems.forEach(item => {
  item.addEventListener('click', (e) => {
    const tabId = item.getAttribute('data-tab');
    if (!tabId) return; // Add page shortcut button
    
    e.preventDefault();
    
    // Deactivate all
    navItems.forEach(nav => nav.classList.remove('active'));
    tabContents.forEach(tab => tab.classList.remove('active'));
    
    // Activate clicked
    item.classList.add('active');
    document.getElementById(tabId).classList.add('active');
  });
});

document.getElementById('navCreateBtn').addEventListener('click', (e) => {
  e.preventDefault();
  openCreateModal();
});

// Load pages
async function loadPages() {
  pagesGrid.innerHTML = '<div class="loading">Loading pages directory...</div>';
  try {
    const res = await fetch('/api/pages');
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const data = await res.json();
    pages = data.pages || [];
    renderPages();
  } catch (err) {
    console.error('Error loading pages:', err);
    pagesGrid.innerHTML = `<div class="error-state">
      <h3>Backend Connection Failed ❌</h3>
      <p>Cannot connect to the backend server. If you deployed to Vercel, you also need to deploy the <b>backend</b> folder to Render or cPanel, and update the URL in <code>frontend/admin/js/config.js</code>.</p>
    </div>`;
  }
}

function renderPages() {
  if (pages.length === 0) {
    pagesGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 3rem;">
        <p style="color: var(--text-secondary);">No pages found in this directory.</p>
      </div>
    `;
    return;
  }

  pagesGrid.innerHTML = pages.map(page => {
    const isHome = page.slug === '';
    return `
      <div class="card">
        <h3 class="card-title">${page.title}</h3>
        <p class="card-desc">Path: <code>${page.path}</code></p>
        <div class="card-meta">
          <span>${isHome ? 'System root' : 'Subpage'}</span>
          <span><code>${page.file}</code></span>
        </div>
        <div class="card-actions">
          <a href="/admin/editor.html?page=${encodeURIComponent(page.file)}" class="btn btn-primary" style="flex: 1; justify-content: center; font-size: 0.8rem;">
            <i data-feather="edit-2" style="width: 14px; height: 14px;"></i>
            <span>Visual Edit</span>
          </a>
          <a href="${page.path}" target="_blank" class="btn btn-secondary" style="font-size: 0.8rem;">
            <i data-feather="external-link" style="width: 14px; height: 14px;"></i>
            <span>View</span>
          </a>
        </div>
      </div>
    `;
  }).join('');

  feather.replace();
}

// Load Media Gallery uploads from API
async function loadUploads() {
  try {
    const res = await fetch('/api/uploads');
    const data = await res.json();
    uploads = data.images || [];
    renderUploads();
    populateImageSelect();
  } catch (err) {
    showToast('Failed to load media uploads.', 'error');
  }
}

function renderUploads() {
  if (uploads.length === 0) {
    galleryGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 3rem;">
        <p style="color: var(--text-secondary);">No photos uploaded yet.</p>
      </div>
    `;
    return;
  }

  galleryGrid.innerHTML = uploads.map(img => {
    return `
      <div class="gallery-item">
        <img src="${img.url}" class="gallery-img" alt="${img.name}">
        <div class="gallery-overlay">
          <span class="gallery-name">${img.name}</span>
          <div style="display: flex; gap: 0.5rem; justify-content: center; margin-top: 0.5rem; width: 100%;">
            <button class="gallery-copy-btn" onclick="copyToClipboard('${img.url}')">
              Copy URL
            </button>
            <button class="gallery-copy-btn" style="background-color: var(--danger); color: #fff;" onclick="deleteImage('${img.name}')">
              Delete
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Copy URL to Clipboard helper
function copyToClipboard(text) {
  navigator.clipboard.writeText(window.location.origin + text)
    .then(() => showToast('Image URL copied to clipboard!', 'success'))
    .catch(() => showToast('Failed to copy link.', 'error'));
}

// Delete Image helper
async function deleteImage(filename) {
  if (!confirm(`Are you sure you want to delete "${filename}"? This will delete the file from the server.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/upload/${encodeURIComponent(filename)}`, {
      method: 'DELETE'
    });

    if (res.ok) {
      showToast('Image deleted successfully.', 'success');
      loadUploads();
    } else {
      const data = await res.json();
      showToast(data.error || 'Failed to delete image.', 'error');
    }
  } catch (err) {
    showToast('Failed to delete image.', 'error');
  }
}
// Populate Image Selection Dropdown
function populateImageSelect() {
  pageImageSelect.innerHTML = '<option value="">-- Select an uploaded photo --</option>';
  uploads.forEach(img => {
    const option = document.createElement('option');
    option.value = img.url;
    option.textContent = img.name;
    pageImageSelect.appendChild(option);
  });
}

// Drag and drop uploader
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});

dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('dragover');
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  if (e.dataTransfer.files.length > 0) {
    uploadFile(e.dataTransfer.files[0]);
  }
});

fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) {
    uploadFile(fileInput.files[0]);
  }
});

async function uploadFile(file) {
  const formData = new FormData();
  formData.append('photo', file);

  showToast('Uploading machine photo...', 'info');

  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });

    if (res.ok) {
      showToast('Photo uploaded successfully!', 'success');
      loadUploads();
    } else {
      const data = await res.json();
      showToast(data.error || 'Upload failed.', 'error');
    }
  } catch (err) {
    showToast('Failed to upload image.', 'error');
  }
}

// Page Creation Modal controls
function openCreateModal() {
  createModal.classList.add('active');
  pageTitleInput.focus();
}

function closeCreateModal() {
  createModal.classList.remove('active');
  createPageForm.reset();
}

// Auto-generate slug from title
pageTitleInput.addEventListener('input', () => {
  const title = pageTitleInput.value;
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // remove special chars
    .replace(/\s+/g, '-')         // replace spaces with dash
    .replace(/-+/g, '-');         // remove multiple dashes
  pageSlugInput.value = slug;
});

// Handle Page Creation form submit
createPageForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const title = pageTitleInput.value;
  const slug = pageSlugInput.value;
  const description = document.getElementById('pageDescription').value;
  const image = pageImageSelect.value;

  showToast('Creating new machine page...', 'info');

  try {
    const res = await fetch('/api/pages/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title, slug, description, image })
    });

    const data = await res.json();

    if (res.ok) {
      showToast('Page created successfully!', 'success');
      closeCreateModal();
      loadPages();
      
      // Prompt user to immediately edit page visually
      setTimeout(() => {
        if (confirm(`Would you like to open the visual editor for "${title}" now?`)) {
          window.location.href = `/admin/editor.html?page=${encodeURIComponent(slug + '/index.html')}`;
        }
      }, 500);
    } else {
      showToast(data.error || 'Failed to create page.', 'error');
    }
  } catch (err) {
    showToast('Error connecting to server.', 'error');
  }
});

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
  } else if (type === 'error') {
    toastEl.classList.add('toast-error');
    toastIcon.setAttribute('data-feather', 'alert-circle');
    toastIcon.style.color = 'var(--danger)';
  } else {
    // Info
    toastIcon.setAttribute('data-feather', 'info');
    toastIcon.style.color = 'var(--accent-color)';
  }
  
  toastText.textContent = message;
  feather.replace();

  setTimeout(() => {
    toastEl.classList.remove('show');
  }, 4000);
}

// Handle Logout
logoutBtn.addEventListener('click', async () => {
  try {
    const res = await fetch('/api/logout', { method: 'POST' });
    if (res.ok) {
      window.location.href = '/admin/login.html';
    }
  } catch (err) {
    showToast('Failed to logout.', 'error');
  }
});

// Initializations
checkAuthentication();
loadPages();
loadUploads();
