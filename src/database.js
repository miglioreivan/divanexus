import { auth, db } from './firebase';
import { 
    doc, 
    getDoc, 
    setDoc, 
    deleteDoc, 
    getDocs, 
    collection, 
    addDoc 
} from 'firebase/firestore';

// Centralized helper to perform fetch requests to the Vercel Serverless API Proxy
async function callApi(action, args = {}) {
    const user = auth.currentUser;
    const headers = {
        'Content-Type': 'application/json'
    };

    if (user) {
        try {
            // Exchanging current auth state with secure Firebase JWT
            const token = await user.getIdToken();
            headers['Authorization'] = `Bearer ${token}`;
        } catch (e) {
            console.warn("⚠️ Impossibile ottenere il token di Firebase Auth:", e);
        }
    }

    try {
        const response = await fetch('/api/db', {
            method: 'POST',
            headers,
            body: JSON.stringify({ action, args })
        });

        if (response.status === 503) {
            // Redis not configured on Vercel side, triggers Firestore fallback
            const errData = await response.json().catch(() => ({}));
            if (errData.isFallback) {
                throw new Error("SERVER_FALLBACK");
            }
        }

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
    } catch (e) {
        // Handles local development environment checks (e.g. without vercel dev running) or forced fallbacks
        if (
            e.message === "SERVER_FALLBACK" || 
            e.message.includes("Failed to fetch") || 
            e.message.includes("404") ||
            e.name === "TypeError" // Typical local network error when API doesn't exist
        ) {
            console.info("ℹ️ Vercel API non disponibile. Eseguo fallback automatico client-side su Firestore.");
            return null; // Signals client to use local Firestore fallback
        }
        throw e;
    }
}

// ----------------------------------------------------
// 1. USER PROFILES
// ----------------------------------------------------

/**
 * Recupera il profilo di un utente
 */
export async function getUserProfile(uid) {
    try {
        const res = await callApi('getUserProfile', { uid });
        if (res !== null) return res;
    } catch (e) {
        console.error("Errore API (getUserProfile):", e.message);
    }

    // Fallback Firestore
    const docRef = doc(db, "users", uid);
    const snap = await getDoc(docRef);
    return snap.exists() ? snap.data() : null;
}

/**
 * Salva o aggiorna il profilo di un utente
 */
export async function setUserProfile(uid, profileData, options = { merge: true }) {
    try {
        const res = await callApi('setUserProfile', { uid, profileData, options });
        if (res !== null) return;
    } catch (e) {
        console.error("Errore API (setUserProfile):", e.message);
    }

    // Fallback Firestore
    await setDoc(doc(db, "users", uid), profileData, options);
}

/**
 * Ottiene la lista di tutti gli utenti registrati (solo per Admin)
 */
export async function getAllUsers() {
    try {
        const res = await callApi('getAllUsers');
        if (res !== null) return res;
    } catch (e) {
        console.error("Errore API (getAllUsers):", e.message);
    }

    // Fallback Firestore
    const snap = await getDocs(collection(db, "users"));
    return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

/**
 * Cancella il profilo di un utente
 */
export async function deleteUserProfile(uid) {
    try {
        const res = await callApi('deleteUserProfile', { uid });
        if (res !== null) return;
    } catch (e) {
        console.error("Errore API (deleteUserProfile):", e.message);
    }

    // Fallback Firestore
    await deleteDoc(doc(db, "users", uid));
}

// ----------------------------------------------------
// 2. LOVE TRACKER DATA
// ----------------------------------------------------

/**
 * Recupera i dati del LoveTracker di un utente
 */
export async function getLoveTrackerData(uid) {
    try {
        const res = await callApi('getLoveTrackerData', { uid });
        if (res !== null) return res;
    } catch (e) {
        console.error("Errore API (getLoveTrackerData):", e.message);
    }

    // Fallback Firestore
    const docRef = doc(db, "users", uid, "loveTracker", "main");
    const snap = await getDoc(docRef);
    return snap.exists() ? (snap.data().data || {}) : {};
}

/**
 * Salva i dati del LoveTracker di un utente
 */
export async function setLoveTrackerData(uid, loveData) {
    try {
        const res = await callApi('setLoveTrackerData', { uid, loveData });
        if (res !== null) return;
    } catch (e) {
        console.error("Errore API (setLoveTrackerData):", e.message);
    }

    // Fallback Firestore
    await setDoc(doc(db, "users", uid, "loveTracker", "main"), { 
        data: loveData, 
        lastUpdate: new Date() 
    });
}

// ----------------------------------------------------
// 3. UNIVERSITY DATA
// ----------------------------------------------------

/**
 * Recupera i dati universitari di un utente
 */
export async function getUniversityData(uid) {
    try {
        const res = await callApi('getUniversityData', { uid });
        if (res !== null) return res;
    } catch (e) {
        console.error("Errore API (getUniversityData):", e.message);
    }

    // Fallback Firestore
    const docRef = doc(db, "users", uid, "university", "main");
    const snap = await getDoc(docRef);
    if (snap.exists()) {
        return snap.data();
    } else {
        return { uniData: { exams: [], deadlines: [], schedule: [], subjects: [] }, isUniPublic: false };
    }
}

/**
 * Salva i dati universitari di un utente
 */
export async function setUniversityData(uid, uniData, isUniPublic = false) {
    try {
        const res = await callApi('setUniversityData', { uid, uniData, isUniPublic });
        if (res !== null) return;
    } catch (e) {
        console.error("Errore API (setUniversityData):", e.message);
    }

    // Fallback Firestore
    await setDoc(doc(db, "users", uid, "university", "main"), { 
        uniData, 
        isUniPublic 
    }, { merge: true });
}

// ----------------------------------------------------
// 4. REGISTRATION REQUESTS
// ----------------------------------------------------

/**
 * Recupera tutte le richieste di registrazione (solo Admin)
 */
export async function getRegistrationRequests() {
    try {
        const res = await callApi('getRegistrationRequests');
        if (res !== null) return res;
    } catch (e) {
        console.error("Errore API (getRegistrationRequests):", e.message);
    }

    // Fallback Firestore
    const snap = await getDocs(collection(db, "registration_requests"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Crea una richiesta di registrazione (pubblica)
 */
export async function addRegistrationRequest(requestData) {
    try {
        const res = await callApi('addRegistrationRequest', { requestData });
        if (res !== null) return res;
    } catch (e) {
        console.error("Errore API (addRegistrationRequest):", e.message);
    }

    // Fallback Firestore
    const docRef = await addDoc(collection(db, "registration_requests"), requestData);
    return { id: docRef.id };
}

/**
 * Elimina una richiesta di registrazione (solo Admin)
 */
export async function deleteRegistrationRequest(id) {
    try {
        const res = await callApi('deleteRegistrationRequest', { id });
        if (res !== null) return;
    } catch (e) {
        console.error("Errore API (deleteRegistrationRequest):", e.message);
    }

    // Fallback Firestore
    await deleteDoc(doc(db, "registration_requests", id));
}
