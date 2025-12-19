import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
    apiKey: "AIzaSyAQL_esONHBs76UnutB4GmfOmKUUTNWRdk",
    authDomain: "divanetto-space.firebaseapp.com",
    projectId: "divanetto-space",
    storageBucket: "divanetto-space.firebasestorage.app",
    messagingSenderId: "929101364514",
    appId: "1:929101364514:web:6f8d55616122b2ff2b797b",
    measurementId: "G-1R1040FMY6"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const analytics = getAnalytics(app);

export { app, auth, db, analytics };
