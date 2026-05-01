// ============================================
// SCRIPT.JS - Main page logic
// ============================================

let currentYear = 'di-qua-cung-nhau';
let galleryImages = [];
let lightboxIndex = 0;
let guestbookLastKey = null;
const GB_PAGE_SIZE = 12;
let gbCooldownActive = false;

// ========== CACHE UTILITIES (giảm Firebase reads) ==========
const CACHE_TTL = {
  settings: 300000,   // 5 phút — settings ít thay đổi
  gallery: 120000,    // 2 phút — gallery ít thay đổi
  guestbook: 60000    // 1 phút — guestbook cần cập nhật sớm hơn
};

function cacheGet(key) {
  try {
    const raw = sessionStorage.getItem('fb_' + key);
    if (!raw) return null;
    const { data, ts, ttl } = JSON.parse(raw);
    if (Date.now() - ts > ttl) {
      sessionStorage.removeItem('fb_' + key);
      return null; // Hết hạn
    }
    return data;
  } catch { return null; }
}

function cacheSet(key, data, ttl) {
  try {
    sessionStorage.setItem('fb_' + key, JSON.stringify({ data, ts: Date.now(), ttl }));
  } catch { /* sessionStorage full — bỏ qua */ }
}

function cacheClear(key) {
  sessionStorage.removeItem('fb_' + key);
}

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', () => {
  initFirebase();
  initNav();
  initSparkles();
  initInvitationCanvas();

  if (firebaseReady) {
    loadSettings();
    loadGallery(currentYear);
    loadGuestbook();
  } else {
    setDefaultContent();
  }

  // Live preview cho thiệp mời
  const guestNameInput = document.getElementById('guestName');
  if (guestNameInput) {
    guestNameInput.addEventListener('input', () => {
      const raw = guestNameInput.value.trim();
      const formatted = raw ? raw.toLowerCase().split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : '';
      invCurrentName = formatted; // Update current name for download
      renderInvitationCanvas(formatted);
    });
  }

  // Hide loader
  setTimeout(() => {
    document.getElementById('pageLoader').classList.add('hide');
  }, 800);
});

// ========== NAVIGATION ==========
function initNav() {
  const navbar = document.getElementById('navbar');
  const toggle = document.getElementById('navToggle');
  const links = document.getElementById('navLinks');

  // Scroll effect
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        navbar.classList.toggle('scrolled', window.scrollY > 60);
        updateActiveLink();
        ticking = false;
      });
      ticking = true;
    }
  });

  // Mobile toggle
  toggle.addEventListener('click', () => {
    links.classList.toggle('open');
  });

  // Close on link click
  links.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => links.classList.remove('open'));
  });
}

function updateActiveLink() {
  const sections = ['hero', 'gallery', 'invitation', 'guestbook'];
  const scrollPos = window.scrollY + 150;
  sections.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const link = document.querySelector(`.nav-links a[href="#${id}"]`);
    if (el.offsetTop <= scrollPos && el.offsetTop + el.offsetHeight > scrollPos) {
      document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
      link?.classList.add('active');
    }
  });
}

// ========== SPARKLES ==========
function initSparkles() {
  const hero = document.querySelector('.hero');
  for (let i = 0; i < 15; i++) {
    const s = document.createElement('div');
    s.className = 'sparkle';
    s.style.left = Math.random() * 100 + '%';
    s.style.top = Math.random() * 80 + '%';
    s.style.animationDelay = Math.random() * 3 + 's';
    s.style.width = s.style.height = (3 + Math.random() * 5) + 'px';
    hero.appendChild(s);
  }
}

// ========== LOAD SETTINGS ==========
function applySettings(data) {
  if (!data) { setDefaultContent(); return; }
  if (data.graduateName) {
    document.getElementById('graduateName').textContent = data.graduateName;
  }
  if (data.eventTime) {
    document.getElementById('eventTime').textContent = data.eventTime;
  }
  if (data.eventLocation) {
    document.getElementById('eventLocation').textContent = data.eventLocation;
  }
  if (data.eventDate) {
    startCountdown(new Date(data.eventDate));
  }
  const opacity = data.heroBgOpacity !== undefined ? data.heroBgOpacity : 0.35;
  const blur = data.heroBgBlur !== undefined ? data.heroBgBlur : 6;
  const brightness = data.heroBgBrightness !== undefined ? data.heroBgBrightness : 0.85;

  document.querySelectorAll('.hero-bg-img').forEach((img, index) => {
    // Chỉ làm mờ ảnh ở giữa (index = 1), 2 ảnh bên trái phải (index 0, 2) giữ nguyên độ rõ nét
    if (index === 1) {
      img.style.opacity = opacity;
      img.style.filter = `blur(${blur}px) brightness(${brightness})`;
    } else {
      img.style.opacity = 1; // Rõ nét 100%
      img.style.filter = `brightness(${brightness})`; // Chỉ giữ lại brightness để đồng bộ ánh sáng
    }
  });

  // Apply overlay opacity
  if (data.heroBgOverlay !== undefined) {
    document.querySelector('.hero').style.setProperty('--overlay-opacity', data.heroBgOverlay);
  }

  // Apply invitation scale
  if (data.invitationScale !== undefined) {
    const invCard = document.getElementById('invitation-card');
    if (invCard) invCard.style.setProperty('--inv-scale', data.invitationScale);
  }
}

function loadSettings() {
  // Thử lấy từ cache trước
  const cached = cacheGet('settings');
  if (cached) {
    applySettings(cached);
    return; // ← Không gọi Firebase!
  }
  // Cache miss → gọi Firebase 1 lần duy nhất (.once thay vì .on)
  db.ref('settings').once('value', snap => {
    const data = snap.val();
    cacheSet('settings', data, CACHE_TTL.settings);
    applySettings(data);
  });
}

function setDefaultContent() {
  document.getElementById('eventTime').textContent = 'Vui lòng cấu hình từ trang Admin';
  document.getElementById('eventLocation').textContent = 'Vui lòng cấu hình từ trang Admin';
}

// ========== COUNTDOWN ==========
let countdownInterval = null;
function startCountdown(targetDate) {
  if (countdownInterval) clearInterval(countdownInterval);

  function update() {
    const now = new Date();
    const diff = targetDate - now;
    if (diff <= 0) {
      document.getElementById('cd-days').textContent = '🎉';
      document.getElementById('cd-hours').textContent = '🎓';
      document.getElementById('cd-mins').textContent = '🎊';
      document.getElementById('cd-secs').textContent = '✨';
      clearInterval(countdownInterval);
      return;
    }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    document.getElementById('cd-days').textContent = String(d).padStart(2, '0');
    document.getElementById('cd-hours').textContent = String(h).padStart(2, '0');
    document.getElementById('cd-mins').textContent = String(m).padStart(2, '0');
    document.getElementById('cd-secs').textContent = String(s).padStart(2, '0');
  }
  update();
  countdownInterval = setInterval(update, 1000);
}

// ========== GALLERY / CAROUSEL ==========
let carouselIndex = 0;
let galleryData = []; // [{url, caption}]

function convertDriveLink(url) {
  if (!url) return '';
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return `https://lh3.googleusercontent.com/d/${match[1]}`;
  return url;
}


function initGalleryTabs() {
  document.querySelectorAll('.gallery-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.gallery-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentYear = tab.dataset.year;
      loadGallery(currentYear);
    });
  });
}
initGalleryTabs();

function loadGallery(year) {
  if (!firebaseReady) return;
  const slide = document.getElementById('carouselSlide');
  const thumbs = document.getElementById('carouselThumbs');
  const caption = document.getElementById('carouselCaption');
  const counter = document.getElementById('carouselCounter');
  const empty = document.getElementById('galleryEmpty');
  const yearDesc = document.getElementById('yearDescription');
  const yearKey = year.replace(/-/g, '_');

  // Thử cache trước
  const cachedDesc = cacheGet('desc_' + yearKey);
  const cachedGallery = cacheGet('gallery_' + yearKey);

  if (cachedDesc !== null && cachedGallery !== null) {
    // Có cache → render ngay, không gọi Firebase
    applyYearDesc(yearDesc, cachedDesc);
    applyGalleryData(cachedGallery, slide, thumbs, caption, counter);
    return;
  }

  // Không có cache → loading rồi gọi Firebase
  slide.innerHTML = '<div class="gallery-empty" id="galleryEmpty"><i class="fas fa-spinner fa-spin"></i><p>Đang tải...</p></div>';
  thumbs.innerHTML = '';
  caption.textContent = '';
  counter.textContent = '';

  // Load year description
  db.ref('yearDescriptions/' + yearKey).once('value', snap => {
    const desc = snap.val();
    cacheSet('desc_' + yearKey, desc, CACHE_TTL.gallery);
    applyYearDesc(yearDesc, desc);
  });

  db.ref('gallery/' + yearKey).limitToFirst(30).once('value', snap => {
    const data = snap.val();
    cacheSet('gallery_' + yearKey, data, CACHE_TTL.gallery);
    applyGalleryData(data, slide, thumbs, caption, counter);
  });
}

function applyYearDesc(yearDesc, desc) {
  if (desc) {
    yearDesc.innerHTML = `<i class="fas fa-quote-left"></i> ${escapeHtml(desc)}`;
    yearDesc.style.display = 'block';
  } else {
    yearDesc.style.display = 'none';
  }
}

function applyGalleryData(data, slide, thumbs, caption, counter) {
  galleryData = [];
  galleryImages = [];

  if (!data) {
    slide.innerHTML = '<div class="gallery-empty" id="galleryEmpty"><i class="fas fa-images"></i><p>Chưa có hình ảnh cho mục này.</p></div>';
    updateCarouselNav();
    return;
  }

  // Sort by order, then timestamp
  const entries = Object.entries(data).sort((a, b) => {
    const orderA = a[1].order ?? 9999;
    const orderB = b[1].order ?? 9999;
    if (orderA !== orderB) return orderA - orderB;
    return (a[1].timestamp || 0) - (b[1].timestamp || 0);
  });

  entries.forEach(([key, imgData]) => {
    const url = convertDriveLink(imgData.url);
    galleryData.push({ url, caption: imgData.caption || '' });
    galleryImages.push(url);
  });

  // Build thumbnails
  thumbs.innerHTML = '';
  galleryData.forEach((item, i) => {
    const thumb = document.createElement('div');
    thumb.className = 'carousel-thumb' + (i === 0 ? ' active' : '');
    thumb.innerHTML = `<img src="${item.url}" alt="Thumb" loading="lazy" onerror="this.parentElement.style.display='none'">`;
    thumb.addEventListener('click', () => goToSlide(i));
    thumbs.appendChild(thumb);
  });

  carouselIndex = 0;
  showSlide(0);
}

function showSlide(index) {
  if (galleryData.length === 0) return;
  carouselIndex = index;
  const slide = document.getElementById('carouselSlide');
  const caption = document.getElementById('carouselCaption');
  const counter = document.getElementById('carouselCounter');
  const item = galleryData[index];

  slide.innerHTML = `<img src="${item.url}" alt="${item.caption || 'Ảnh kỷ niệm'}" class="carousel-fade-in" onclick="openLightbox(${index})" onerror="this.alt='Không thể tải ảnh'">`;
  caption.textContent = item.caption || '';
  counter.textContent = `${index + 1} / ${galleryData.length}`;

  // Update thumbnails
  document.querySelectorAll('.carousel-thumb').forEach((t, i) => {
    t.classList.toggle('active', i === index);
  });

  // Scroll active thumb into view
  const activeThumb = document.querySelector('.carousel-thumb.active');
  if (activeThumb) activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });

  updateCarouselNav();
}

function carouselNav(dir) {
  if (galleryData.length === 0) return;
  let next = carouselIndex + dir;
  if (next < 0) next = galleryData.length - 1;
  if (next >= galleryData.length) next = 0;
  showSlide(next);
}

function goToSlide(index) {
  showSlide(index);
}

function updateCarouselNav() {
  const prev = document.getElementById('carouselPrev');
  const next = document.getElementById('carouselNext');
  if (!prev || !next) return;
  const hasImages = galleryData.length > 0;
  prev.disabled = !hasImages;
  next.disabled = !hasImages;
  prev.style.visibility = hasImages ? 'visible' : 'hidden';
  next.style.visibility = hasImages ? 'visible' : 'hidden';
}

// Keyboard navigation for carousel (when gallery section is in viewport)
document.addEventListener('keydown', e => {
  // Don't interfere with lightbox keyboard nav
  const lb = document.getElementById('lightbox');
  if (lb && lb.classList.contains('active')) return;
  // Don't interfere with input fields
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  const gallerySection = document.getElementById('gallery');
  if (!gallerySection) return;
  const rect = gallerySection.getBoundingClientRect();
  const inView = rect.top < window.innerHeight && rect.bottom > 0;

  if (inView && galleryData.length > 0) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); carouselNav(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); carouselNav(1); }
  }
});

// ========== LIGHTBOX ==========
function openLightbox(index) {
  lightboxIndex = index;
  const lb = document.getElementById('lightbox');
  document.getElementById('lightboxImg').src = galleryImages[index];
  lb.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('active');
  document.body.style.overflow = '';
}

function navLightbox(dir) {
  lightboxIndex = (lightboxIndex + dir + galleryImages.length) % galleryImages.length;
  document.getElementById('lightboxImg').src = galleryImages[lightboxIndex];
}

// Keyboard nav
document.addEventListener('keydown', e => {
  const lb = document.getElementById('lightbox');
  if (!lb.classList.contains('active')) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') navLightbox(-1);
  if (e.key === 'ArrowRight') navLightbox(1);
});

// ========== INVITATION ==========
// Kích thước chuẩn của file thumoi.png (706x1000)
const INV_W = 706;
const INV_H = 1000;
// Vị trí tên: căn giữa toàn bộ chiều ngang của hàng (sau khi xóa "Thân mời" khỏi mẫu)
const INV_NAME_CENTER_X = 353; // ← Tâm của ảnh 706px (= 706/2), chỉnh nếu cần
const INV_NAME_Y = 665;        // ← Chỉnh lên/xuống (px trên ảnh gốc 1000px)
const INV_FONT_SIZE = 34;      // ← Chỉnh kích thước chữ (px trên ảnh gốc)

let invTemplate = null;
let invCurrentName = '';

// Load ảnh mẫu ngay khi trang tải
function initInvitationCanvas() {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    invTemplate = img;
    renderInvitationCanvas('');
  };
  img.src = 'thumoi.png';
}

// Vẽ lên canvas với tỉ lệ tùy chỉnh (scale=1 cho preview, scale=2 cho export)
function drawInvitationOnCanvas(canvas, name, scale = 1) {
  const w = INV_W * scale;
  const h = INV_H * scale;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // Vẽ ảnh nền
  ctx.drawImage(invTemplate, 0, 0, w, h);

  // Vẽ cụm "Thân mời [Tên]" 2 màu căn giữa
  if (name) {
    const fontSize = Math.round(INV_FONT_SIZE * scale);
    const label = 'Thân mời '; // Phần cố định (có khoảng cách sau)

    ctx.font = `bold ${fontSize}px 'Gesco', sans-serif`;
    ctx.lineJoin = 'round';

    // Đo chiều rộng từng phần để tính điểm bắt đầu
    const labelWidth = ctx.measureText(label).width;
    const nameWidth  = ctx.measureText(name).width;
    const totalWidth = labelWidth + nameWidth;
    const startX = INV_NAME_CENTER_X * scale - totalWidth / 2;
    const baseY  = INV_NAME_Y * scale;

    // ── Vẽ "Thân mời " (xanh #398ff1) ──
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 * scale;
    ctx.fillStyle = '#398ff1';
    ctx.textAlign = 'left';
    ctx.strokeText(label, startX, baseY);
    ctx.fillText(label, startX, baseY);

    // ── Vẽ tên khách (cam #ed5548) ──
    ctx.fillStyle = '#ed5548';
    ctx.strokeText(name, startX + labelWidth, baseY);
    ctx.fillText(name, startX + labelWidth, baseY);
  }
}

function renderInvitationCanvas(name) {
  const canvas = document.getElementById('invitation-canvas');
  if (!canvas || !invTemplate) return;
  drawInvitationOnCanvas(canvas, name, 1);
}

function downloadInvitation() {
  const canvas = document.getElementById('invitation-canvas');
  const btn = document.querySelector('#downloadArea .btn');
  const nameInput = document.getElementById('guestName').value.trim();
  
  if (!nameInput) {
    showToast('Vui lòng nhập họ tên của bạn trước khi tải!', 'error');
    document.getElementById('guestName').focus();
    return;
  }

  const nameNoSpace = nameInput.replace(/\s+/g, '');
  const fileName = `ThumoiLTNNguyenQuocHuu_${nameNoSpace}.png`;

  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tải...';
  btn.disabled = true;

  // Tạo canvas 2x (1412x2000) để xuất chất lượng cao
  const hiResCanvas = document.createElement('canvas');
  drawInvitationOnCanvas(hiResCanvas, invCurrentName, 2);

  hiResCanvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = fileName;
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    btn.innerHTML = '<i class="fas fa-download"></i> Tải thiệp mời';
    btn.disabled = false;
    showToast('Đã tải thiệp mời thành công! 📥', 'success');
  }, 'image/png', 1.0);
}

// ========== GUESTBOOK ==========
function submitGuestbook() {
  if (!firebaseReady) { showToast('Firebase chưa được cấu hình!', 'error'); return; }
  if (gbCooldownActive) { showToast('Vui lòng đợi trước khi gửi tiếp!', 'info'); return; }

  const name = document.getElementById('gbName').value.trim();
  const message = document.getElementById('gbMessage').value.trim();

  if (!name || !message) {
    showToast('Vui lòng điền đầy đủ họ tên và lời nhắn!', 'error');
    return;
  }

  const btn = document.getElementById('submitGbBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang gửi...';

  db.ref('guestbook').push({
    name, message,
    timestamp: Date.now(),
    approved: true
  }).then(() => {
    showToast('Đã gửi lưu bút! 💌', 'success');
    document.getElementById('gbName').value = '';
    document.getElementById('gbMessage').value = '';
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Gửi lưu bút';
    btn.disabled = false;
    startCooldown();
    cacheClear('guestbook'); // Xóa cache để reload mới nhất
    loadGuestbook();

  }).catch(() => {
    showToast('Lỗi khi gửi, vui lòng thử lại!', 'error');
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Gửi lưu bút';
    btn.disabled = false;
  });
}

function startCooldown() {
  gbCooldownActive = true;
  let sec = 30;
  const el = document.getElementById('gbCooldown');
  const btn = document.getElementById('submitGbBtn');
  el.style.display = 'block';
  btn.disabled = true;

  const iv = setInterval(() => {
    sec--;
    el.textContent = `Vui lòng đợi ${sec}s trước khi gửi tiếp...`;
    if (sec <= 0) {
      clearInterval(iv);
      gbCooldownActive = false;
      el.style.display = 'none';
      btn.disabled = false;
    }
  }, 1000);
}

function loadGuestbook() {
  if (!firebaseReady) return;
  const grid = document.getElementById('guestbookGrid');

  // Thử cache trước
  const cached = cacheGet('guestbook');
  if (cached) {
    renderGuestbookData(grid, cached);
    return;
  }

  db.ref('guestbook')
    .orderByChild('approved')
    .equalTo(true)
    .limitToLast(GB_PAGE_SIZE)
    .once('value', snap => {
      const data = snap.val();
      cacheSet('guestbook', data, CACHE_TTL.guestbook);
      renderGuestbookData(grid, data);
    });
}

function renderGuestbookData(grid, data) {
  grid.innerHTML = '';
  if (!data) {
    grid.innerHTML = '<div class="gallery-empty" style="grid-column:1/-1"><i class="fas fa-pen-fancy"></i><p>Chưa có lưu bút nào. Hãy là người đầu tiên!</p></div>';
    return;
  }

  const entries = Object.entries(data).sort((a, b) => b[1].timestamp - a[1].timestamp);
  if (entries.length >= GB_PAGE_SIZE) {
    guestbookLastKey = entries[entries.length - 1][0];
    document.getElementById('loadMoreWrap').style.display = 'block';
  }

  entries.forEach(([key, val], i) => {
    grid.appendChild(createGuestbookCard(val, i));
  });
}

function loadMoreGuestbook() {
  if (!firebaseReady || !guestbookLastKey) return;

  db.ref('guestbook')
    .orderByChild('approved')
    .equalTo(true)
    .endBefore(true, guestbookLastKey)
    .limitToLast(GB_PAGE_SIZE)
    .once('value', snap => {
      const data = snap.val();
      if (!data || Object.keys(data).length === 0) {
        document.getElementById('loadMoreWrap').style.display = 'none';
        showToast('Đã hiển thị tất cả lưu bút!', 'info');
        return;
      }
      const grid = document.getElementById('guestbookGrid');
      const entries = Object.entries(data).sort((a, b) => b[1].timestamp - a[1].timestamp);
      guestbookLastKey = entries[entries.length - 1][0];
      entries.forEach(([key, val], i) => {
        grid.appendChild(createGuestbookCard(val, i));
      });
      if (entries.length < GB_PAGE_SIZE) {
        document.getElementById('loadMoreWrap').style.display = 'none';
      }
    });
}

function createGuestbookCard(data, index) {
  const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];
  const color = colors[data.name.length % colors.length];
  const date = new Date(data.timestamp);
  const timeStr = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const card = document.createElement('div');
  card.className = 'guestbook-card';
  card.style.animationDelay = (index * 0.1) + 's';
  card.innerHTML = `
    <div class="gb-header">
      <div class="gb-avatar" style="background:${color}"><i class="fas fa-paper-plane" style="font-size:0.9rem"></i></div>
      <div>
        <div class="gb-name">${escapeHtml(data.name)}</div>
      </div>
    </div>
    <div class="gb-message">${escapeHtml(data.message)}</div>
    <div class="gb-time"><i class="fas fa-clock"></i> ${timeStr}</div>
  `;
  return card;
}

// ========== UTILS ==========
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3500);
}
