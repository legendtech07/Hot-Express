// ============================================================
// HOT EXPRESS — Firebase initialization
// Every other JS module imports { auth, db } from this file.
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAoA0cmyqLd3M8kgCIIb411gEAeQ02JgCw",
  authDomain: "hot-express-81a1d.firebaseapp.com",
  projectId: "hot-express-81a1d",
  storageBucket: "hot-express-81a1d.firebasestorage.app",
  messagingSenderId: "363258604472",
  appId: "1:363258604472:web:2f04b289ce5640edd5bd4d",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// The only two cities Hot Express currently operates in.
// Add to this list when the service expands to a new state.
export const SERVICE_LOCATIONS = ["Ondo", "Enugu"];
