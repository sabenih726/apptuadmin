// firebase-config.js
export const firebaseConfig = {
    apiKey: "AIzaSyAQcqTo-sWcgVTiXd84eBeeeDKTo7R_A10",
    authDomain: "apptuadmin.firebaseapp.com",
    projectId: "apptuadmin",
    storageBucket: "apptuadmin.firebasestorage.app",
    messagingSenderId: "115288218019",
    appId: "1:115288218019:web:ed4bd28f251649a332e216",
    measurementId: "G-K4VQESPXRL"
};

export const appId = "apptuadmin";

// Collection paths
export const getCollectionPath = () => {
    return `absensi`; // Simplified path for Firestore
};

// Alternative path jika menggunakan struktur artifacts
export const getArtifactsPath = () => {
    return `/artifacts/${appId}/public/data/absensi`;
};
