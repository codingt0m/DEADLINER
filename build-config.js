/* build-config.js */
const fs = require('fs');
const path = require('path');

// 1. Définition du dossier de sortie (standard Vercel)
const outputDir = '.';

// Création du dossier s'il n'existe pas
if (!fs.existsSync(outputDir)){
    fs.mkdirSync(outputDir);
}

// 2. Génération du contenu de config.js avec les variables d'environnement
const configContent = `// Fichier généré automatiquement par Vercel
const firebaseConfig = {
  apiKey: "${process.env.apiKey}",
  authDomain: "${process.env.authDomain}",
  projectId: "${process.env.projectId}",
  storageBucket: "${process.env.storageBucket}",
  messagingSenderId: "${process.env.messagingSenderId}",
  appId: "${process.env.appId}"
};

export { firebaseConfig };`;

// Écriture de config.js DANS le dossier public
fs.writeFileSync(path.join(outputDir, 'config.js'), configContent);
console.log('✅ public/config.js généré.');

// 3. Liste des fichiers statiques à copier vers public
const filesToCopy = [
    'index.html', 
    'style.css', 
    'app.js', 
    'firebase.js'
];

// Copie des fichiers
filesToCopy.forEach(file => {
    if (fs.existsSync(file)) {
        fs.copyFileSync(file, path.join(outputDir, file));
        console.log(`➡️ Copié : ${file}`);
    } else {
        console.warn(`⚠️ Attention : Fichier source ${file} introuvable.`);
    }
});

console.log('🎉 Build terminé : Site prêt dans le dossier /public');