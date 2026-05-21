import { auth as firebaseAuth } from './firebase';
import { 
    signInWithEmailAndPassword as fbSignIn,
    signOut as fbSignOut,
    onAuthStateChanged as fbOnAuthStateChanged,
    createUserWithEmailAndPassword as fbCreateUser,
    sendPasswordResetEmail as fbSendReset
} from 'firebase/auth';

let currentSessionUser = null;
let isInitialized = false;
let useFirebaseFallback = false;
const authListeners = new Set();

// Internal helper to verify the active session from Vercel Serverless API
async function checkAuthSession() {
    if (isInitialized) return currentSessionUser;
    
    try {
        const res = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'me' })
        });
        
        // Handle 404 local dev without api or 503 unconfigured fallback status
        if (res.status === 503 || res.status === 404) {
            const errData = await res.json().catch(() => ({}));
            if (errData.isFallback || res.status === 404) {
                throw new Error("AUTH_FALLBACK");
            }
        }
        
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        
        const data = await res.json();
        if (data.authenticated) {
            currentSessionUser = data.user;
        } else {
            currentSessionUser = null;
        }
        useFirebaseFallback = false;
    } catch (e) {
        console.info("ℹ️ Vercel Auth API non disponibile. Ripiego automaticamente su Firebase Auth.", e.message);
        useFirebaseFallback = true;
    }
    
    isInitialized = true;
    return currentSessionUser;
}

// 1. onAuthStateChanged
export function onAuthStateChanged(authIgnored, callback) {
    if (isInitialized && useFirebaseFallback) {
        return fbOnAuthStateChanged(firebaseAuth, callback);
    }
    
    authListeners.add(callback);
    
    if (isInitialized) {
        callback(currentSessionUser);
    } else {
        checkAuthSession().then((user) => {
            if (useFirebaseFallback) {
                authListeners.delete(callback);
                fbOnAuthStateChanged(firebaseAuth, callback);
            } else {
                callback(user);
            }
        });
    }
    
    return () => {
        authListeners.delete(callback);
    };
}

// 2. signInWithEmailAndPassword
export async function signInWithEmailAndPassword(authIgnored, email, password) {
    await checkAuthSession();
    
    if (useFirebaseFallback) {
        return await fbSignIn(firebaseAuth, email, password);
    }
    
    const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'login',
            args: { email, password }
        })
    });
    
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const err = new Error(errData.error || `HTTP ${res.status}`);
        // Map common Firebase errors to avoid breaking client form code
        err.code = res.status === 401 ? 'auth/wrong-password' : 'auth/unknown';
        throw err;
    }
    
    const data = await res.json();
    currentSessionUser = data.user;
    
    // Notify all frontend auth state listeners
    authListeners.forEach(cb => cb(currentSessionUser));
    return { user: currentSessionUser };
}

// 3. signOut
export async function signOut(authIgnored) {
    await checkAuthSession();
    
    if (useFirebaseFallback) {
        return await fbSignOut(firebaseAuth);
    }
    
    try {
        await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'logout' })
        });
    } catch (e) {
        console.error("Errore chiamata logout API:", e);
    }
    
    currentSessionUser = null;
    authListeners.forEach(cb => cb(null));
}

// 4. createUserWithEmailAndPassword
export async function createUserWithEmailAndPassword(authIgnored, email, password) {
    await checkAuthSession();
    
    if (useFirebaseFallback) {
        return await fbCreateUser(firebaseAuth, email, password);
    }
    
    const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'createUser',
            args: { email, password, role: 'user' }
        })
    });
    
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
    }
    
    const data = await res.json();
    return { user: { uid: data.uid, email } };
}

// 5. sendPasswordResetEmail
export async function sendPasswordResetEmail(authIgnored, email) {
    await checkAuthSession();
    if (useFirebaseFallback) {
        return await fbSendReset(firebaseAuth, email);
    }
    alert("Funzione di reset password non supportata in modalità Upstash custom. Contatta l'amministratore per cambiare la password.");
}

// 6. updateEmail
export async function updateEmail(userIgnored, newEmail) {
    await checkAuthSession();
    if (useFirebaseFallback) {
        const { updateEmail: fbUpdateEmail } = await import('firebase/auth');
        return await fbUpdateEmail(firebaseAuth.currentUser, newEmail);
    }

    const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'updateAuth',
            args: { email: newEmail }
        })
    });

    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    currentSessionUser = data.user;
    authListeners.forEach(cb => cb(currentSessionUser));
}

// 7. updatePassword
export async function updatePassword(userIgnored, newPassword) {
    await checkAuthSession();
    if (useFirebaseFallback) {
        const { updatePassword: fbUpdatePassword } = await import('firebase/auth');
        return await fbUpdatePassword(firebaseAuth.currentUser, newPassword);
    }

    const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'updateAuth',
            args: { password: newPassword }
        })
    });

    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    currentSessionUser = data.user;
    authListeners.forEach(cb => cb(currentSessionUser));
}

// 8. getAuth
export function getAuth(app) {
    return {};
}

// Emulated auth instance to avoid broken references
export const auth = {};
