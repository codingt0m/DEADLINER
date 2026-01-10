// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    getDocs, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// IMPORT DE LA CONFIGURATION EXTERNE
import { firebaseConfig } from "./config.js";

// Initialisation
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// On ré-exporte tout pour que app.js puisse l'utiliser
export { db, collection, getDocs, addDoc, updateDoc, deleteDoc, doc };