import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAMTFs6Crfb1CdKooWS2nGs0N0XiT-7H_U",
  authDomain: "eduadmin-8afe2.firebaseapp.com",
  projectId: "eduadmin-8afe2",
  storageBucket: "eduadmin-8afe2.firebasestorage.app",
  messagingSenderId: "122093844253",
  appId: "1:122093844253:web:61f8758c72c5c505bd13f4"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
