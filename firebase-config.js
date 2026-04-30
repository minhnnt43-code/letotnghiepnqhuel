// ============================================
// FIREBASE CONFIGURATION
// ============================================
// Hướng dẫn: Truy cập https://console.firebase.google.com
// 1. Tạo project mới
// 2. Vào Project Settings > General > Your apps > Web
// 3. Copy firebaseConfig paste vào đây
// 4. Bật Realtime Database (chọn rules: test mode)
// ============================================

const firebaseConfig = {
  apiKey: "AIzaSyDQTbP14nkzpFwFP-9-l3cbNjhylnYA5WU",
  authDomain: "websitetotnghiepanhquochuu.firebaseapp.com",
  databaseURL: "https://websitetotnghiepanhquochuu-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "websitetotnghiepanhquochuu",
  storageBucket: "websitetotnghiepanhquochuu.firebasestorage.app",
  messagingSenderId: "561239810729",
  appId: "1:561239810729:web:6e6d8bcb96caba2ab87fb8",
  measurementId: "G-0ZHSQ1EGFK"
};

let db = null;
let firebaseReady = false;

function initFirebase() {
  try {
    if (firebaseConfig.apiKey === "YOUR_API_KEY") {
      console.warn("Firebase chưa được cấu hình!");
      return false;
    }
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
    firebaseReady = true;
    console.log("Firebase connected!");
    return true;
  } catch (e) {
    console.error("Firebase init error:", e);
    return false;
  }
}
