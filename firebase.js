import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    getDocs, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc,
    getDoc, // Ajouté
    setDoc, // Ajouté
    query,
    orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut,
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

let firebaseConfig;

try {
    const module = await import('./config.js');
    firebaseConfig = module.firebaseConfig;
    console.log("✅ Config locale trouvée");
} catch (e) {
    console.warn("⚠️ config.js introuvable ou erreur d'import, tentative avec build-config...");
    try {
        const module = await import('./build-config.js');
        firebaseConfig = module.firebaseConfig;
        console.log("✅ Config build trouvée");
    } catch (error) {
        console.error("❌ Aucune config trouvée");
    }
}

// Vérification de sécurité avant d'initialiser
if (!firebaseConfig) {
    const msg = "ERREUR CRITIQUE : La configuration Firebase est vide ou manquante. Vérifiez que 'config.js' contient bien 'export { firebaseConfig };' à la fin.";
    console.error(msg);
    alert(msg);
    throw new Error(msg);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Export mis à jour avec getDoc et setDoc
export { db, auth, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, setDoc, query, orderBy, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged };