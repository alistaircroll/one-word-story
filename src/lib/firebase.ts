import { initializeApp, getApps, getApp } from "firebase/app";
import { getDatabase } from "firebase/database";
// import { getAuth } from "firebase/auth"; // Will add auth later if needed for Anonymous Auth

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase (singleton pattern to avoid re-initialization in dev)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getDatabase(app);
// const auth = getAuth(app);

export { app, db };
