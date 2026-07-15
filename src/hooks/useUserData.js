import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { AVAILABLE_APPS } from '../constants';

/**
 * Fetches Firestore user profile data once on mount.
 * Returns { userData, loading } — userData includes name, dateOfBirth, allowedApps, etc.
 */
export function useUserData(user) {
    const [userData, setUserData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) {
            setLoading(false);
            return;
        }

        let cancelled = false;

        const fetchData = async () => {
            try {
                const userSnap = await getDoc(doc(db, "users", user.uid));
                if (!cancelled) {
                    if (userSnap.exists()) {
                        const data = userSnap.data();
                        setUserData({
                            ...data,
                            allowedApps: data.allowedApps || AVAILABLE_APPS.map(a => a.id),
                        });
                    } else {
                        setUserData({ allowedApps: AVAILABLE_APPS.map(a => a.id) });
                    }
                }
            } catch (error) {
                console.error("Error fetching user data:", error);
                if (!cancelled) {
                    setUserData({ allowedApps: AVAILABLE_APPS.map(a => a.id) });
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchData();
        return () => { cancelled = true; };
    }, [user]);

    return { userData, loading };
}
