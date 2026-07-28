(function() {
  let activeImageEl = null;

  // Make text elements editable
  function enableTextEditing() {
    const selectors = 'h1, h2, h3, h4, h5, h6, p, li, td, th, .elementor-heading-title, .elementor-button-text, .entry-title';
    const elements = document.querySelectorAll(selectors);
    
    elements.forEach(el => {
      // Avoid making wrappers editable if they contain large structural blocks
      if (el.children.length > 3 && (el.tagName === 'DIV' || el.tagName === 'LI')) {
        return; 
      }
      el.setAttribute('contenteditable', 'true');
      
      // Listen for modifications
      el.addEventListener('input', () => {
        notifyParentOfChange();
      });
    });

    // Disable all links inside the editor iframe to prevent navigation while editing
    document.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    });
  }

  // Make images clickable/replaceable
  function enableImageEditing() {
    document.querySelectorAll('img').forEach(img => {
      img.classList.add('editable-img');
      img.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openImageSelector(img);
      });
    });
  }

  // Inform parent window that a modification has occurred
  function notifyParentOfChange() {
    window.parent.postMessage('content_changed', '*');
  }

  // Create and inject the image selection modal
  function injectImageModal() {
    if (document.getElementById('cmsImageModal')) return;

    const modalHtml = `
      <div class="cms-inject-modal" id="cmsImageModal">
        <div class="cms-inject-content">
          <div class="cms-inject-header">
            <span>Select Machine Photo</span>
            <button class="cms-inject-close" id="cmsModalCloseBtn">&times;</button>
          </div>
          <div class="cms-inject-body">
            <div class="cms-inject-upload-section" id="cmsModalUploadBtn">
              <span style="font-weight: 500; font-size: 0.9rem;">+ Upload New Machine Photo</span>
              <input type="file" id="cmsModalFileInput" style="display:none;" accept="image/*">
            </div>
            <div class="cms-inject-gallery" id="cmsModalGallery">
              <div style="text-align: center; width: 100%; color: #9ca3af; padding: 1.5rem; font-size: 0.85rem;">
                Loading gallery...
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    const div = document.createElement('div');
    div.innerHTML = modalHtml.trim();
    document.body.appendChild(div.firstChild);

    // Bind event handlers
    document.getElementById('cmsModalCloseBtn').addEventListener('click', closeCmsModal);
    
    const uploadBtn = document.getElementById('cmsModalUploadBtn');
    const fileInput = document.getElementById('cmsModalFileInput');
    
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleModalFileUpload);
  }

  // Open the image selection modal
  async function openImageSelector(img) {
    activeImageEl = img;
    img.classList.add('editing-selected');
    
    injectImageModal();
    const modal = document.getElementById('cmsImageModal');
    modal.classList.add('active');
    
    await loadModalGallery();
  }

  function closeCmsModal() {
    const modal = document.getElementById('cmsImageModal');
    if (modal) {
      modal.classList.remove('active');
    }
    if (activeImageEl) {
      activeImageEl.classList.remove('editing-selected');
      activeImageEl = null;
    }
  }

  // Fetch uploaded images list for modal gallery
  async function loadModalGallery() {
    const galleryEl = document.getElementById('cmsModalGallery');
    try {
      const res = await fetch('/api/uploads');
      const data = await res.json();
      const images = data.images || [];
      
      if (images.length === 0) {
        galleryEl.innerHTML = `
          <div style="text-align: center; width: 100%; color: #9ca3af; padding: 1.5rem; font-size: 0.85rem;">
            No uploaded photos. Upload one above!
          </div>
        `;
        return;
      }
      
      galleryEl.innerHTML = images.map(img => `
        <div class="cms-inject-gallery-item" data-url="${img.url}">
          <img src="${img.url}" class="cms-inject-gallery-img" alt="${img.name}">
        </div>
      `).join('');

      // Add click listener to gallery items
      galleryEl.querySelectorAll('.cms-inject-gallery-item').forEach(item => {
        item.addEventListener('click', () => {
          const url = item.getAttribute('data-url');
          selectImage(url);
        });
      });
      
    } catch (err) {
      galleryEl.innerHTML = `
        <div style="text-align: center; width: 100%; color: #ef4444; padding: 1.5rem; font-size: 0.85rem;">
          Failed to load gallery.
        </div>
      `;
    }
  }

  // Upload file inside modal
  async function handleModalFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('photo', file);

    const galleryEl = document.getElementById('cmsModalGallery');
    galleryEl.innerHTML = '<div style="text-align: center; width: 100%; padding: 1.5rem; font-size: 0.85rem;">Uploading photo...</div>';

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      
      if (res.ok) {
        const data = await res.json();
        // Automatically select the newly uploaded image
        selectImage(data.url);
      } else {
        alert('Upload failed.');
        loadModalGallery();
      }
    } catch (err) {
      alert('Upload failed due to network error.');
      loadModalGallery();
    }
  }

  // Set the image src to selected photo
  function selectImage(url) {
    if (activeImageEl) {
      activeImageEl.src = url;
      
      // CRITICAL: Remove srcset and sizes so that the new local image uploader source
      // actually displays, instead of the original WP responsive sizes which are absolute links
      activeImageEl.removeAttribute('srcset');
      activeImageEl.removeAttribute('sizes');
      
      notifyParentOfChange();
    }
    closeCmsModal();
  }

  // Preparation before saving (strip editor helper tags and contenteditables)
  window.prepareForSave = function() {
    // 1. Remove editor uploader modals
    const modal = document.getElementById('cmsImageModal');
    if (modal) {
      modal.remove();
    }

    // 2. Remove editing highlight classes
    document.querySelectorAll('.editable-img').forEach(img => {
      img.classList.remove('editable-img');
      img.classList.remove('editing-selected');
    });

    // 3. Remove contenteditable attributes
    document.querySelectorAll('[contenteditable]').forEach(el => {
      el.removeAttribute('contenteditable');
    });
  };

  // Restore editor state after save finishes
  window.restoreAfterSave = function() {
    enableTextEditing();
    enableImageEditing();
  };

  // Run initializations on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      enableTextEditing();
      enableImageEditing();
    });
  } else {
    enableTextEditing();
    enableImageEditing();
  }
})();
