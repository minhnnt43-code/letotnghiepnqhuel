// ============================================
// ADMIN.JS - Admin panel logic
// ============================================

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin';
let currentAdminYear = '2022_2023';
let gbFilter = 'all';

// ========== AUTH ==========
document.addEventListener('DOMContentLoaded', () => {
  if (sessionStorage.getItem('adminAuth') === 'true') {
    showDashboard();
  }
  // Enter key on login
  document.getElementById('loginPass').addEventListener('keydown', e => {
    if (e.key === 'Enter') login();
  });
  document.getElementById('loginUser').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('loginPass').focus();
  });
});

function login() {
  const user = document.getElementById('loginUser').value.trim();
  const pass = document.getElementById('loginPass').value;
  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    sessionStorage.setItem('adminAuth', 'true');
    showDashboard();
  } else {
    document.getElementById('loginError').style.display = 'block';
    setTimeout(() => document.getElementById('loginError').style.display = 'none', 3000);
  }
}

function logout() {
  sessionStorage.removeItem('adminAuth');
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('loginUser').value = '';
  document.getElementById('loginPass').value = '';
}

function showDashboard() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('dashboard').style.display = 'flex';
  initFirebase();
  if (firebaseReady) {
    document.getElementById('fbStatusText').innerHTML = '<span style="color:#10b981"><i class="fas fa-check-circle"></i> Firebase đã kết nối!</span>';
    loadAdminSettings();
    loadAdminGallery(currentAdminYear);
    loadYearDescription(currentAdminYear);
    loadAdminGuestbook();
    loadStats();
  } else {
    document.getElementById('fbStatusText').innerHTML = '<span style="color:var(--red)"><i class="fas fa-exclamation-triangle"></i> Firebase chưa được cấu hình! Vui lòng cập nhật firebase-config.js</span>';
  }
}

// ========== NAV ==========
function switchPage(pageId, el) {
  document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + pageId).classList.add('active');
  document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
  el.classList.add('active');
  if (el.tagName !== 'A') return;
  event.preventDefault();
}

// ========== STATS ==========
function loadStats() {
  if (!firebaseReady) return;
  // Count photos
  db.ref('gallery').once('value', snap => {
    let count = 0;
    const data = snap.val();
    if (data) {
      Object.values(data).forEach(year => {
        if (year && typeof year === 'object') count += Object.keys(year).length;
      });
    }
    document.getElementById('statPhotos').textContent = count;
  });
  // Count guestbook
  db.ref('guestbook').once('value', snap => {
    const data = snap.val();
    let total = 0, pending = 0;
    if (data) {
      Object.values(data).forEach(gb => {
        total++;
        if (!gb.approved) pending++;
      });
    }
    document.getElementById('statGuestbook').textContent = total;
    document.getElementById('statPending').textContent = pending;
  });
}

// ========== SETTINGS ==========
function loadAdminSettings() {
  if (!firebaseReady) return;
  db.ref('settings').once('value', snap => {
    const data = snap.val();
    if (!data) return;
    if (data.graduateName) document.getElementById('setName').value = data.graduateName;
    if (data.eventDate) document.getElementById('setDate').value = data.eventDate;
    if (data.eventTime) document.getElementById('setTime').value = data.eventTime;
    if (data.eventLocation) document.getElementById('setLocation').value = data.eventLocation;
  });
}

function saveSettings() {
  if (!firebaseReady) { showToast('Firebase chưa kết nối!', 'error'); return; }
  const data = {
    graduateName: document.getElementById('setName').value.trim() || 'Nguyễn Quốc Hữu',
    eventDate: document.getElementById('setDate').value,
    eventTime: document.getElementById('setTime').value.trim(),
    eventLocation: document.getElementById('setLocation').value.trim()
  };
  db.ref('settings').set(data).then(() => {
    showToast('Đã lưu thông tin sự kiện! ✅', 'success');
  }).catch(() => showToast('Lỗi khi lưu!', 'error'));
}

// ========== GALLERY ==========
let adminGalleryData = {}; // { key: {url, caption, order, timestamp} }
let editingImageKey = null;

function switchAdminGalleryYear(year, el) {
  currentAdminYear = year;
  document.querySelectorAll('#adminGalleryTabs .gallery-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  loadAdminGallery(year);
  loadYearDescription(year);
}

// ========== YEAR DESCRIPTION ==========
function loadYearDescription(year) {
  if (!firebaseReady) return;
  const textarea = document.getElementById('yearDescText');
  textarea.value = '';
  db.ref('yearDescriptions/' + year).once('value', snap => {
    textarea.value = snap.val() || '';
  });
}

function saveYearDescription() {
  if (!firebaseReady) { showToast('Firebase chưa kết nối!', 'error'); return; }
  const text = document.getElementById('yearDescText').value.trim();
  db.ref('yearDescriptions/' + currentAdminYear).set(text).then(() => {
    showToast('Đã lưu mô tả năm học! ✅', 'success');
  }).catch(() => showToast('Lỗi khi lưu!', 'error'));
}

function loadAdminGallery(year) {
  if (!firebaseReady) return;
  const grid = document.getElementById('adminGalleryGrid');
  grid.innerHTML = '<p style="color:var(--gray)">Đang tải...</p>';

  db.ref('gallery/' + year).once('value', snap => {
    grid.innerHTML = '';
    const data = snap.val();
    adminGalleryData = data || {};
    if (!data) {
      grid.innerHTML = '<p style="color:var(--gray)">Chưa có ảnh nào cho năm học này.</p>';
      return;
    }

    // Sort by order field, then by timestamp
    const entries = Object.entries(data).sort((a, b) => {
      const orderA = a[1].order ?? 9999;
      const orderB = b[1].order ?? 9999;
      if (orderA !== orderB) return orderA - orderB;
      return (a[1].timestamp || 0) - (b[1].timestamp || 0);
    });

    entries.forEach(([key, val], index) => {
      const url = convertDriveLink(val.url);
      const item = document.createElement('div');
      item.className = 'admin-gallery-row';
      item.dataset.key = key;
      item.innerHTML = `
        <div class="agr-thumb">
          <img src="${url}" alt="Gallery" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%2250%25%22 x=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 font-size=%2214%22>❌</text></svg>'">
        </div>
        <div class="agr-info">
          <div class="agr-caption">${val.caption ? escapeHtml(val.caption) : '<span style="color:var(--gray);font-style:italic">Chưa có chú thích</span>'}</div>
          <div class="agr-url" title="${escapeHtml(val.url)}">${escapeHtml(val.url).substring(0, 50)}${val.url.length > 50 ? '...' : ''}</div>
        </div>
        <div class="agr-actions">
          <button class="btn-icon" onclick="moveImage('${key}', -1)" title="Di chuyển lên" ${index === 0 ? 'disabled' : ''}>
            <i class="fas fa-chevron-up"></i>
          </button>
          <button class="btn-icon" onclick="moveImage('${key}', 1)" title="Di chuyển xuống" ${index === entries.length - 1 ? 'disabled' : ''}>
            <i class="fas fa-chevron-down"></i>
          </button>
          <button class="btn-icon btn-icon-edit" onclick="openEditModal('${key}')" title="Chỉnh sửa">
            <i class="fas fa-pen"></i>
          </button>
          <button class="btn-icon btn-icon-delete" onclick="deleteGalleryImage('${currentAdminYear}','${key}')" title="Xóa">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      `;
      grid.appendChild(item);
    });
  });
}

function addGalleryImage() {
  if (!firebaseReady) { showToast('Firebase chưa kết nối!', 'error'); return; }
  const url = document.getElementById('addImageUrl').value.trim();
  const caption = document.getElementById('addImageCaption').value.trim();
  if (!url) { showToast('Vui lòng nhập link ảnh!', 'error'); return; }

  // Get current max order
  let maxOrder = 0;
  Object.values(adminGalleryData).forEach(v => {
    if (v.order && v.order > maxOrder) maxOrder = v.order;
  });

  db.ref('gallery/' + currentAdminYear).push({
    url: url,
    caption: caption || '',
    order: maxOrder + 1,
    timestamp: Date.now()
  }).then(() => {
    showToast('Đã thêm ảnh! 🖼️', 'success');
    document.getElementById('addImageUrl').value = '';
    document.getElementById('addImageCaption').value = '';
    loadAdminGallery(currentAdminYear);
    loadStats();
  }).catch(() => showToast('Lỗi khi thêm ảnh!', 'error'));
}

function deleteGalleryImage(year, key) {
  if (!confirm('Xóa ảnh này?')) return;
  db.ref('gallery/' + year + '/' + key).remove().then(() => {
    showToast('Đã xóa ảnh!', 'success');
    loadAdminGallery(year);
    loadStats();
  }).catch(() => showToast('Lỗi khi xóa!', 'error'));
}

// ========== EDIT MODAL ==========
function openEditModal(key) {
  editingImageKey = key;
  const data = adminGalleryData[key];
  if (!data) return;
  document.getElementById('editImageUrl').value = data.url || '';
  document.getElementById('editImageCaption').value = data.caption || '';
  document.getElementById('editImageModal').style.display = 'flex';
}

function closeEditModal() {
  document.getElementById('editImageModal').style.display = 'none';
  editingImageKey = null;
}

function saveEditImage() {
  if (!editingImageKey || !firebaseReady) return;
  const url = document.getElementById('editImageUrl').value.trim();
  const caption = document.getElementById('editImageCaption').value.trim();
  if (!url) { showToast('Link ảnh không được để trống!', 'error'); return; }

  db.ref('gallery/' + currentAdminYear + '/' + editingImageKey).update({
    url: url,
    caption: caption
  }).then(() => {
    showToast('Đã cập nhật ảnh! ✅', 'success');
    closeEditModal();
    loadAdminGallery(currentAdminYear);
  }).catch(() => showToast('Lỗi khi cập nhật!', 'error'));
}

// ========== REORDER ==========
function moveImage(key, direction) {
  if (!firebaseReady) return;
  const entries = Object.entries(adminGalleryData).sort((a, b) => {
    const orderA = a[1].order ?? 9999;
    const orderB = b[1].order ?? 9999;
    if (orderA !== orderB) return orderA - orderB;
    return (a[1].timestamp || 0) - (b[1].timestamp || 0);
  });

  const currentIndex = entries.findIndex(e => e[0] === key);
  const targetIndex = currentIndex + direction;
  if (targetIndex < 0 || targetIndex >= entries.length) return;

  const currentKey = entries[currentIndex][0];
  const targetKey = entries[targetIndex][0];
  const currentOrder = entries[currentIndex][1].order ?? currentIndex;
  const targetOrder = entries[targetIndex][1].order ?? targetIndex;

  // Swap orders
  const updates = {};
  updates[currentKey + '/order'] = targetOrder;
  updates[targetKey + '/order'] = currentOrder;

  db.ref('gallery/' + currentAdminYear).update(updates).then(() => {
    loadAdminGallery(currentAdminYear);
  }).catch(() => showToast('Lỗi khi đổi vị trí!', 'error'));
}

// ========== GUESTBOOK ADMIN ==========
function loadAdminGuestbook() {
  if (!firebaseReady) return;
  const list = document.getElementById('adminGuestbookList');
  list.innerHTML = '<p style="color:var(--gray)">Đang tải...</p>';

  db.ref('guestbook').orderByChild('timestamp').once('value', snap => {
    list.innerHTML = '';
    const data = snap.val();
    if (!data) {
      list.innerHTML = '<p style="color:var(--gray)">Chưa có lưu bút nào.</p>';
      return;
    }

    const entries = Object.entries(data).sort((a, b) => b[1].timestamp - a[1].timestamp);
    entries.forEach(([key, val]) => {
      if (gbFilter === 'pending' && val.approved) return;
      if (gbFilter === 'approved' && !val.approved) return;

      const date = new Date(val.timestamp);
      const timeStr = date.toLocaleString('vi-VN');
      const statusBadge = val.approved
        ? '<span class="badge badge-approved">Đã duyệt</span>'
        : '<span class="badge badge-pending">Chờ duyệt</span>';

      const item = document.createElement('div');
      item.className = 'admin-gb-item';
      item.innerHTML = `
        <div class="admin-gb-content">
          <div class="name">${escapeHtml(val.name)} ${statusBadge}</div>
          <div class="message">${escapeHtml(val.message)}</div>
          <div class="meta"><i class="fas fa-clock"></i> ${timeStr}</div>
        </div>
        <div class="admin-gb-actions">
          ${!val.approved ? `<button class="btn btn-sm btn-primary" onclick="approveGuestbook('${key}')"><i class="fas fa-check"></i></button>` : ''}
          <button class="btn btn-sm btn-danger" onclick="deleteGuestbook('${key}')"><i class="fas fa-trash"></i></button>
        </div>
      `;
      list.appendChild(item);
    });

    if (list.children.length === 0) {
      list.innerHTML = '<p style="color:var(--gray)">Không có lưu bút nào phù hợp bộ lọc.</p>';
    }
  });
}

function filterGuestbook(filter) {
  gbFilter = filter;
  document.querySelectorAll('[id^="filter"]').forEach(btn => {
    btn.className = 'btn btn-sm ' + (btn.id === 'filter' + filter.charAt(0).toUpperCase() + filter.slice(1) ? 'btn-primary' : 'btn-secondary');
  });
  loadAdminGuestbook();
}

function approveGuestbook(key) {
  db.ref('guestbook/' + key).update({ approved: true }).then(() => {
    showToast('Đã duyệt lưu bút! ✅', 'success');
    loadAdminGuestbook();
    loadStats();
  }).catch(() => showToast('Lỗi!', 'error'));
}

function deleteGuestbook(key) {
  if (!confirm('Xóa lưu bút này?')) return;
  db.ref('guestbook/' + key).remove().then(() => {
    showToast('Đã xóa lưu bút!', 'success');
    loadAdminGuestbook();
    loadStats();
  }).catch(() => showToast('Lỗi!', 'error'));
}

// ========== UTILS ==========
function convertDriveLink(url) {
  if (!url) return '';
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return `https://lh3.googleusercontent.com/d/${match[1]}`;
  return url;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3500);
}
