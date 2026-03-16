// ==================== Firebase Initialization ====================
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyD_35ndCAFRu4tkyyK6jliIS8l3QqGVgK8",
  authDomain: "cmf-mcs.firebaseapp.com",
  projectId: "cmf-mcs",
  storageBucket: "cmf-mcs.firebasestorage.app",
  messagingSenderId: "156302336546",
  appId: "1:156302336546:web:373c1b25d24c4a9131e07b",
  measurementId: "G-PJY3RN9XLH"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);