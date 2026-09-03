import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCqhdEDn5L7jWIuWMLu5Tr5lYHvgzIhBbQ",
  authDomain: "tk-web-b37f2.firebaseapp.com",
  databaseURL: "https://tk-web-b37f2-default-rtdb.firebaseio.com",
  projectId: "tk-web-b37f2",
  storageBucket: "tk-web-b37f2.firebasestorage.app",
  messagingSenderId: "1024181888015",
  appId: "1:1024181888015:web:8b5fc93840d59e0cbcaf7a",
  measurementId: "G-5SL862X5L1"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

