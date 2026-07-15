import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

/**
 * Centralized auth guard hook.
 * - When `requireAuth` is true (default): redirects unauthenticated users to `redirectTo`.
 * - When `requireAuth` is false: runs the listener but never redirects — useful for public/guest pages.
 * Returns { user, loading } for consistent handling across all pages.
 */
export function useAuthGuard({ redirectTo = '/', requireAuth = true } = {}) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            if (!currentUser && requireAuth) {
                navigate(redirectTo);
            } else {
                setUser(currentUser);
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, [navigate, redirectTo, requireAuth]);

    return { user, loading };
}
