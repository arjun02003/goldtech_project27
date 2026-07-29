const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for Vercel frontend
app.use(cors({
  origin: ['https://goldtech-project27.vercel.app', 'https://goldtech-project27-1.onrender.com', 'http://localhost:3000'],
  credentials: true
}));

// Configuration
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin123';
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
const AUTH_TOKEN = 'goldtech_auth_token_secure_2026';

// Initialize directories
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Multer storage setup for machine photos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Generate safe unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage });

// Middlewares
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// Auth helper middleware (supports both cookie and Authorization header)
function checkAuth(req, res, next) {
  const cookieToken = req.cookies.admin_token;
  const headerToken = (req.headers.authorization || '').replace('Bearer ', '');
  if (cookieToken === AUTH_TOKEN || headerToken === AUTH_TOKEN) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized. Please login.' });
  }
}

// Redirect middleware for admin root
app.get('/admin', (req, res) => {
  res.redirect('/admin/index.html');
});

// Redirect singular our-product requests to correct plural route
app.get('/our-product', (req, res) => {
  res.redirect('/our-products/');
});
app.get('/our-product/', (req, res) => {
  res.redirect('/our-products/');
});

// Intercept HTML pages for editor injection when ?admin_edit=true
app.use((req, res, next) => {
  if (req.query.admin_edit === 'true') {
    // Check auth cookie, if not valid redirect to login
    const token = req.cookies.admin_token;
    if (token !== AUTH_TOKEN) {
      return res.redirect('/admin/login.html?redirect=' + encodeURIComponent(req.originalUrl));
    }

    let reqPath = req.path;
    if (reqPath.endsWith('/')) {
      reqPath += 'index.html';
    } else if (!path.extname(reqPath)) {
      reqPath += '/index.html';
    }

    const filePath = path.join(FRONTEND_DIR, reqPath);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      try {
        let html = fs.readFileSync(filePath, 'utf8');
        const $ = cheerio.load(html);
        
        // Inject editing styles and scripts
        $('head').append('<link rel="stylesheet" href="/admin/css/editor-inject.css">');
        $('body').append('<script src="/admin/js/editor-inject.js"></script>');
        
        return res.send($.html());
      } catch (err) {
        console.error('Error loading page in editor:', err);
        return res.status(500).send('Error loading page in editor');
      }
    }
  }
  next();
});

// Serve static assets
app.use('/uploads', express.static(uploadsDir));
app.use('/admin', express.static(path.join(__dirname, '../frontend/admin')));
app.use(express.static(path.join(__dirname, '../frontend')));

// Auth APIs
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    res.cookie('admin_token', AUTH_TOKEN, { path: '/', httpOnly: true, sameSite: 'none', secure: true });
    res.json({ success: true, message: 'Logged in successfully.', token: AUTH_TOKEN });
  } else {
    res.status(401).json({ error: 'Invalid username or password.' });
  }
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('admin_token', { path: '/', sameSite: 'none', secure: true });
  res.json({ success: true, message: 'Logged out successfully.' });
});

app.get('/api/auth-status', (req, res) => {
  const cookieToken = req.cookies.admin_token;
  const headerToken = (req.headers.authorization || '').replace('Bearer ', '');
  res.json({ authenticated: cookieToken === AUTH_TOKEN || headerToken === AUTH_TOKEN });
});

// Pages CRUD APIs
app.get('/api/pages', checkAuth, (req, res) => {
  try {
    const rootDir = FRONTEND_DIR;
    const dirs = fs.readdirSync(rootDir, { withFileTypes: true });
    const pages = [];

    // Add homepage
    if (fs.existsSync(path.join(rootDir, 'index.html'))) {
      pages.push({
        title: 'Home Page',
        slug: '',
        path: '/',
        file: 'index.html'
      });
    }

    dirs.forEach(dirent => {
      if (dirent.isDirectory()) {
        const name = dirent.name;
        // Skip system directories
        if (['.git', 'node_modules', 'admin', 'uploads', 'scratch', 'backend'].includes(name)) {
          return;
        }

        const indexPath = path.join(rootDir, name, 'index.html');
        if (fs.existsSync(indexPath)) {
          let title = name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          try {
            const html = fs.readFileSync(indexPath, 'utf8');
            const $ = cheerio.load(html);
            const htmlTitle = $('title').text();
            if (htmlTitle) {
              title = htmlTitle.split(' - ')[0].split(' | ')[0].trim();
            }
          } catch (e) {
            // Fallback to slug-based title
          }

          pages.push({
            title: title,
            slug: name,
            path: `/${name}/`,
            file: `${name}/index.html`
          });
        }
      }
    });

    res.json({ pages });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list pages: ' + err.message });
  }
});

// Read page HTML content
app.get('/api/pages/read', checkAuth, (req, res) => {
  const pageFile = req.query.file;
  if (!pageFile) {
    return res.status(400).json({ error: 'File parameter is required.' });
  }

  const filePath = path.join(FRONTEND_DIR, pageFile);
  
  // Prevent directory traversal
  if (!filePath.startsWith(FRONTEND_DIR)) {
    return res.status(403).json({ error: 'Access denied.' });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found.' });
  }

  try {
    const html = fs.readFileSync(filePath, 'utf8');
    res.json({ html });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read page: ' + err.message });
  }
});

// Save updated page HTML
app.post('/api/pages/write', checkAuth, (req, res) => {
  const { file: pageFile, html } = req.body;
  if (!pageFile || !html) {
    return res.status(400).json({ error: 'File and HTML parameters are required.' });
  }

  const filePath = path.join(FRONTEND_DIR, pageFile);
  
  // Prevent directory traversal
  if (!filePath.startsWith(FRONTEND_DIR)) {
    return res.status(403).json({ error: 'Access denied.' });
  }

  try {
    // Clean up editor-injected classes, elements, and contenteditable attributes
    const $ = cheerio.load(html);
    
    // Remove editor CSS and JS tags if present
    $('link[href="/admin/css/editor-inject.css"]').remove();
    $('script[src="/admin/js/editor-inject.js"]').remove();
    
    // Remove inline attributes and classes added by editing
    $('[contenteditable]').removeAttr('contenteditable');
    $('.editable-hover-highlight').removeClass('editable-hover-highlight');
    $('.editing-selected').removeClass('editing-selected');

    const cleanHtml = $.html();
    
    fs.writeFileSync(filePath, cleanHtml, 'utf8');
    res.json({ success: true, message: 'Page saved successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to write page: ' + err.message });
  }
});

// Upload center endpoints
app.post('/api/upload', checkAuth, upload.single('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No photo file uploaded.' });
  }
  
  const relativeUrl = `/uploads/${req.file.filename}`;
  res.json({ success: true, url: relativeUrl, filename: req.file.filename });
});

app.get('/api/uploads', checkAuth, (req, res) => {
  try {
    const files = fs.readdirSync(uploadsDir);
    const images = files.map(file => ({
      name: file,
      url: `/uploads/${file}`,
      size: fs.statSync(path.join(uploadsDir, file)).size,
      time: fs.statSync(path.join(uploadsDir, file)).mtimeMs
    })).sort((a, b) => b.time - a.time);

    res.json({ images });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list uploads: ' + err.message });
  }
});

// Delete uploaded image endpoint
app.delete('/api/upload/:filename', checkAuth, (req, res) => {
  const filename = req.params.filename;
  const safeFilename = path.basename(filename);
  const filePath = path.join(uploadsDir, safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Image not found.' });
  }

  try {
    fs.unlinkSync(filePath);
    res.json({ success: true, message: 'Image deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete image: ' + err.message });
  }
});

// Add New Machine Page (Cloning template and inserting to navigation menu)
app.post('/api/pages/create', checkAuth, (req, res) => {
  const { title, slug, description, image } = req.body;
  if (!title || !slug) {
    return res.status(400).json({ error: 'Title and Slug are required.' });
  }

  // Validate slug to prevent folder names with special chars or traversal
  const safeSlug = slug.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-');
  const newPageDir = path.join(FRONTEND_DIR, safeSlug);

  if (fs.existsSync(newPageDir)) {
    return res.status(400).json({ error: `A page with slug '${safeSlug}' already exists.` });
  }

  // Find a template page to clone. Defaulting to 3d-printing-machine, or first available product page
  let templateSlug = '3d-printing-machine';
  let templatePath = path.join(FRONTEND_DIR, templateSlug, 'index.html');

  if (!fs.existsSync(templatePath)) {
    // Scan root for any product folder with an index.html as a fallback
    const dirs = fs.readdirSync(FRONTEND_DIR, { withFileTypes: true });
    for (const dir of dirs) {
      if (dir.isDirectory() && !['.git', 'node_modules', 'admin', 'uploads', 'scratch', 'backend'].includes(dir.name)) {
        const checkPath = path.join(FRONTEND_DIR, dir.name, 'index.html');
        if (fs.existsSync(checkPath)) {
          templateSlug = dir.name;
          templatePath = checkPath;
          break;
        }
      }
    }
  }

  if (!fs.existsSync(templatePath)) {
    // If no template folder found, check if root index.html exists
    const rootIndex = path.join(FRONTEND_DIR, 'index.html');
    if (fs.existsSync(rootIndex)) {
      templatePath = rootIndex;
    } else {
      return res.status(500).json({ error: 'No template HTML file found to clone.' });
    }
  }

  try {
    // 1. Create page directory
    fs.mkdirSync(newPageDir);

    // 2. Read template and parse with cheerio
    let html = fs.readFileSync(templatePath, 'utf8');
    const $ = cheerio.load(html);

    // 3. Update title, descriptions, metadata
    $('title').text(`${title} - Industrial Printers Manufacturer | Goldtech Graphics Pvt. Ltd.`);
    $('meta[name="description"]').attr('content', description || `${title} details and specifications.`);
    $('meta[property="og:title"]').attr('content', title);
    $('meta[property="og:description"]').attr('content', description || `${title} details and specifications.`);
    $('link[rel="canonical"]').attr('href', `https://goldtechgraphicsinfo.com/${safeSlug}/`);

    // Update main heading (try to find h1 or elements containing title of template)
    let templateTitleText = templateSlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    
    // Find heading tags and replace text
    $('h1, h2, h3').each((i, el) => {
      const elText = $(el).text().trim();
      if (elText.toLowerCase() === templateTitleText.toLowerCase() || elText.toLowerCase().includes('printing machine')) {
        $(el).text(title);
      }
    });

    // If an image was uploaded, try to replace the first large image or product image in the content
    if (image) {
      // Find elementor image elements or general content images to swap
      let imageSwapped = false;
      $('img').each((i, el) => {
        const src = $(el).attr('src') || '';
        // Look for large images in wp-content that are likely the main product image
        if (!imageSwapped && (src.includes('/wp-content/uploads/') || src.includes('Untitled-design') || src.includes('get-more-information'))) {
          $(el).attr('src', image);
          $(el).removeAttr('srcset'); // Remove srcset so our local image is loaded
          imageSwapped = true;
        }
      });
      // Fallback: If no image was swapped, just set the first img
      if (!imageSwapped) {
        $('img').first().attr('src', image).removeAttr('srcset');
      }
    }

    // Save the new page HTML
    fs.writeFileSync(path.join(newPageDir, 'index.html'), $.html(), 'utf8');

    // 4. Update the navigation menus on ALL pages
    const menuLinkHtml = `<li class="menu-item menu-item-type-post_type menu-item-object-page"><a href="/${safeSlug}/" class="elementor-item">${title}</a></li>`;
    
    const rootDir = FRONTEND_DIR;
    const dirs = fs.readdirSync(rootDir, { withFileTypes: true });
    
    // Add home page index.html
    const htmlFilesToUpdate = [];
    if (fs.existsSync(path.join(rootDir, 'index.html'))) {
      htmlFilesToUpdate.push(path.join(rootDir, 'index.html'));
    }

    dirs.forEach(dirent => {
      if (dirent.isDirectory()) {
        const name = dirent.name;
        if (['.git', 'node_modules', 'admin', 'uploads', 'scratch', 'backend'].includes(name)) return;
        const p = path.join(rootDir, name, 'index.html');
        if (fs.existsSync(p)) {
          htmlFilesToUpdate.push(p);
        }
      }
    });

    // Inject menu items in all html files
    htmlFilesToUpdate.forEach(filePath => {
      try {
        const pageHtml = fs.readFileSync(filePath, 'utf8');
        const page$ = cheerio.load(pageHtml);
        
        // Find Astra / Elementor menus and append the new page
        const menus = page$('.elementor-nav-menu');
        if (menus.length > 0) {
          menus.each((i, menu) => {
            page$(menu).append(menuLinkHtml);
          });
          fs.writeFileSync(filePath, page$.html(), 'utf8');
        }
      } catch (err) {
        console.error(`Failed to update menu in ${filePath}:`, err);
      }
    });

    res.json({ success: true, message: `New page '${title}' created successfully at /${safeSlug}/`, path: `/${safeSlug}/` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create page: ' + err.message });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`=============================================================`);
  console.log(`🚀 Goldtech Graphics CMS & Admin Server running at:`);
  console.log(`   👉 http://localhost:${PORT}/admin`);
  console.log(`=============================================================`);
});
