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

let firebaseConfig;

try {
    // 1. On essaie de charger la config locale (gitignored)
    const module = await import('./config.js');
    firebaseConfig = module.firebaseConfig;
    console.log("✅ Configuration chargée depuis config.js (Local)");
} catch (e) {
    // 2. Si échec (fichier absent), on charge la config de build/prod
    console.warn("⚠️ config.js non trouvé, tentative avec build-config.js...");
    try {
        const module = await import('./build-config.js');
        firebaseConfig = module.firebaseConfig;
        console.log("✅ Configuration chargée depuis build-config.js");
    } catch (error) {
        console.error("❌ Aucune configuration trouvée (ni config.js, ni build-config.js). L'app va planter.");
        throw error;
    }
}

// Initialisation avec la config trouvée
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db, collection, getDocs, addDoc, updateDoc, deleteDoc, doc };