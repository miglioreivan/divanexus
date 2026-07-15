import { useState, useEffect, useRef } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { AVAILABLE_APPS } from '../constants';

/**
 * Subscribes to Firestore user profile document in real-time.
 * Falls back to all apps on timeout or error to ensure the app grid
 * is never empty for the admin user.
 */
export function useUserData(user) {
    const [userData, setUserData] = useState(null);
    const [loading, setLoading] = useState(true);
    const fallbackTimer = useRef(null);

    useEffect(() => {
        if (!user) {
            setLoading(false);
            setUserData(null);
            return;
        }

        setLoading(true);

        // Safety timeout: if onSnapshot doesn't fire within 8s,
        // fall back to all apps so the page isn't stuck on mobile.
        fallbackTimer.current = setTimeout(() => {
            setUserData({ allowedApps: AVAILABLE_APPS.map(a => a.id) });
            setLoading(false);
        }, 8000);

        const docRef = doc(db, "users", user.uid);
        const unsub = onSnapshot(docRef,
            (docSnap) => {
                clearTimeout(fallbackTimer.current);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setUserData({
                        ...data,
                        allowedApps: (data.allowedApps && data.allowedApps.length > 0)
                            ? data.allowedApps
                            : AVAILABLE_APPS.map(a => a.id),
                    });
                } else {
                    setUserData({ allowedApps: AVAILABLE_APPS.map(a => a.id) });
                }
                setLoading(false);
            },
            (error) => {
                clearTimeout(fallbackTimer.current);
                console.error("useUserData onSnapshot error:", error);
                setUserData({ allowedApps: AVAILABLE_APPS.map(a => a.id) });
                setLoading(false);
            }
        );

        return () => {
            clearTimeout(fallbackTimer.current);
            unsub();
        };
    }, [user]);

    return { userData, loading };
}
