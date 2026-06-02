// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyD_35ndCAFRu4tkyyK6jliIS8l3QqGVgK8",
  authDomain: "cmf-mcs.firebaseapp.com",
  projectId: "cmf-mcs",
  storageBucket: "cmf-mcs.firebasestorage.app",
  messagingSenderId: "156302336546",
  appId: "1:156302336546:web:373c1b25d24c4a9131e07b",
  measurementId: "G-PJY3RN9XLH"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

