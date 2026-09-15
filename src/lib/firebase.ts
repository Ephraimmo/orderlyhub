import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Shared with the ForkFleet Super Admin console — same Firebase project,
// same Cloud Firestore database. Realtime Database is no longer used, so no
// `databaseURL` is configured (Firestore resolves from `projectId`).
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBCTflur84nQjEc-YdsD_p2sR8eI7BD6nA",
  authDomain: "e-comm-bd997.firebaseapp.com",
  projectId: "e-comm-bd997",
  storageBucket: "e-comm-bd997.appspot.com",
  messagingSenderId: "280613901400",
  appId: "1:280613901400:web:bf168e55508b9102dda62d",
} as const;

const app = initializeApp(FIREBASE_CONFIG, "forkfleet-main");
export const auth = getAuth(app);
export default app;
