import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

/**
 * Centralized auth guard hook. Redirects to `redirectTo` if not authenticated.
 * Returns { user, loading } for consistent handling across all pages.
 */
export function useAuthGuard({ redirectTo = '/' } = {}) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            if (!currentUser) {
                navigate(redirectTo);
            } else {
                setUser(currentUser);
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, [navigate, redirectTo]);

    return { user, loading };
}
