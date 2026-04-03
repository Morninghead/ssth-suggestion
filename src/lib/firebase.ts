import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, updateDoc, doc, query, orderBy, Timestamp } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getAuth } from 'firebase/auth';
import { getAnalytics } from 'firebase/analytics';
import { compressImage } from './imageCompression';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "YOUR_API_KEY",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "YOUR_PROJECT.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "YOUR_PROJECT.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "YOUR_SENDER_ID",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "YOUR_APP_ID",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const analytics = typeof window !== 'undefined' && firebaseConfig.measurementId ? getAnalytics(app) : null;
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

// Helper to upload images
export const uploadImages = async (files: File[], ticketId: string, prefix: string): Promise<string[]> => {
  const urls: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const compressed = await compressImage(files[i]);
    const storageRef = ref(storage, `tickets/${ticketId}/${prefix}_${i}_${compressed.name}`);
    await uploadBytes(storageRef, compressed);
    const url = await getDownloadURL(storageRef);
    urls.push(url);
  }
  return urls;
};

export { app, analytics, db, storage, auth, collection, addDoc, getDocs, updateDoc, doc, query, orderBy, Timestamp };

