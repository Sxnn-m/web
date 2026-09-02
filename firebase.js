import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyANsvCFPhN98uqqpRzk231gDZBgzCJ7D3w",
  authDomain: "tkprints-74d09.firebaseapp.com",
  projectId: "tkprints-74d09",
  storageBucket: "tkprints-74d09.firebasestorage.app",
  messagingSenderId: "76351828788",
  appId: "1:76351828788:web:9359a8edbd6a417cea6b61",
  measurementId: "G-0MK2755Z3X"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

