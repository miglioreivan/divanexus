import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase'; // Ensure db is exported from firebase.js
import { AVAILABLE_APPS } from '../constants';

import { ADMIN_UID } from './AdminPage';

export default function AppPage() {
    const [loading, setLoading] = useState(true);
    const [allowedApps, setAllowedApps] = useState([]);
    const [currentUserUid, setCurrentUserUid] = useState(null);
    const [userName, setUserName] = useState('');
    const [userDob, setUserDob] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                navigate('/');
            } else {
                setCurrentUserUid(user.uid);
                try {
                    // Fetch user specific data (allowed apps)
                    const userSnap = await getDoc(doc(db, "users", user.uid));
                    if (userSnap.exists()) {
                        const userData = userSnap.data();
                        setAllowedApps(userData.allowedApps || AVAILABLE_APPS.map(a => a.id));
                        if (userData.name) setUserName(userData.name);
                        if (userData.dateOfBirth) setUserDob(userData.dateOfBirth);
                    } else {
                        // Fallback if no user doc (shouldn't happen usually)
                        setAllowedApps(AVAILABLE_APPS.map(a => a.id));
                    }
                } catch (error) {
                    console.error("Error fetching user data:", error);
                    // On error, safely default to showing nothing or everything? 
                    // Let's show everything to avoid locking out on network glitches, or handle gracefully.
                    // For now, default to all.
                    setAllowedApps(AVAILABLE_APPS.map(a => a.id));
                } finally {
                    setLoading(false);
                }
            }
        });
        return () => unsubscribe();
    }, [navigate]);

    const handleLogout = () => {
        signOut(auth).then(() => navigate('/'));
    };

    if (loading) return null;

    return (
        <div className={`min-h-screen p-4 md:p-8 flex flex-col items-center justify-center transition-opacity duration-300 ${loading ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>

            <div className="fixed top-6 right-6 z-50">
                <button
                    id="logoutBtn"
                    onClick={handleLogout}
                    className="btn-secondary rounded-full px-4 py-2 text-xs font-semibold shadow-lg bg-cardDark hover:bg-red-500/10 hover:text-red-400"
                >
                    Esci
                </button>
            </div>

            <div className="max-w-5xl w-full space-y-8">

                <div className="text-center md:text-left pl-2">
                    <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">Benvenuto</h1>
                    <p className="text-textMuted mt-2 text-sm">Scegli un'applicazione per iniziare.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                    {/* Admin Card - Only visible to Admin */}
                    {currentUserUid === ADMIN_UID && (
                        <Link to="/admin" className="bento-card p-8 group hover:scale-[1.02] hover:border-yellow-500/30 cursor-pointer block no-underline relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                                <span className="text-9xl">🛡️</span>
                            </div>

                            <div className="relative z-10 flex flex-col h-full justify-between min-h-[180px]">
                                <div className="w-12 h-12 rounded-2xl bg-yellow-500/10 flex items-center justify-center text-2xl group-hover:bg-yellow-500 group-hover:text-black transition-colors border border-yellow-500/20">
                                    🛡️
                                </div>

                                <div>
                                    <h2 className="text-2xl font-bold text-white mb-1 group-hover:text-yellow-400 transition-colors">Admin Panel</h2>
                                    <p className="text-sm text-textMuted">Gestione utenti e richieste.</p>
                                </div>
                            </div>
                        </Link>
                    )}

                    {AVAILABLE_APPS.filter(app => allowedApps.includes(app.id)).map(app => {
                        const isLoveTracker = app.id === 'lovetracker';
                        const hoverBorderColor = isLoveTracker ? 'hover:border-rose-500/30' : 'hover:border-indigo-500/30';
                        const iconBgColor = isLoveTracker ? 'bg-rose-500/10 group-hover:bg-rose-500' : 'bg-indigo-500/10 group-hover:bg-indigo-500';
                        const iconBorderHelper = isLoveTracker ? 'border-rose-500/20' : 'border-indigo-500/20';
                        const titleColor = isLoveTracker ? 'group-hover:text-rose-400' : 'group-hover:text-indigo-400';

                        return (
                            <Link key={app.id} to={app.path} className={`bento-card p-8 group hover:scale-[1.02] ${hoverBorderColor} cursor-pointer block no-underline relative overflow-hidden`}>
                                <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <span className="text-9xl">{app.icon}</span>
                                </div>

                                <div className="relative z-10 flex flex-col h-full justify-between min-h-[180px]">
                                    <div className={`w-12 h-12 rounded-2xl ${iconBgColor} flex items-center justify-center text-2xl group-hover:text-white transition-colors border ${iconBorderHelper}`}>
                                        {app.icon}
                                    </div>

                                    <div>
                                        <h2 className={`text-2xl font-bold text-white mb-1 ${titleColor} transition-colors`}>{app.name}</h2>
                                        <p className="text-sm text-textMuted">{app.description}</p>
                                    </div>
                                </div>
                            </Link>
                        );
                    })}

                    {/* Life Progress Widget */}
                    {userDob && (
                        <div className="bento-card p-6 relative overflow-hidden bg-gradient-to-br from-[#202020] to-[#000000] border border-white/10 flex flex-col justify-between min-h-[180px]">
                            <div className="flex items-start justify-between z-10 relative">
                                <div className="relative w-[70px] h-[70px]">
                                    <svg className="w-full h-full transform -rotate-90">
                                        <circle cx="35" cy="35" r="30" stroke="#222" strokeWidth="6" fill="none" />
                                        <circle cx="35" cy="35" r="30" stroke="#FFD723" strokeWidth="6" fill="none" strokeDasharray={2 * Math.PI * 30} strokeDashoffset={2 * Math.PI * 30 - ((1 - (Math.ceil((new Date(new Date().getFullYear() + (new Date() > new Date(new Date().getFullYear(), new Date(userDob).getMonth(), new Date(userDob).getDate()) ? 1 : 0), new Date(userDob).getMonth(), new Date(userDob).getDate()) - new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())) / (1000 * 60 * 60 * 24))) / ((new Date().getFullYear() + (new Date() > new Date(new Date().getFullYear(), new Date(userDob).getMonth(), new Date(userDob).getDate()) ? 1 : 0)) % 4 === 0 ? 366 : 365)) * 2 * Math.PI * 30} strokeLinecap="round" />
                                    </svg>
                                </div>
                            </div>
                            <div className="z-10 relative mt-4">
                                <h3 className="text-[#ccff00] font-bold text-lg leading-tight">{userName ? userName.charAt(0).toUpperCase() + userName.slice(1) : 'Utente'}'s Life</h3>
                                <p className="text-gray-400 text-xs font-bold">{new Date(userDob).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} • {Math.floor((new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()) - new Date(new Date(userDob).getFullYear(), new Date(userDob).getMonth(), new Date(userDob).getDate())) / (1000 * 60 * 60 * 24))} days</p>
                            </div>
                            <div className="absolute right-6 bottom-6 z-10 flex items-baseline gap-1">
                                <span className="text-4xl font-bold text-[#b8bdfb]">{( (Math.floor((new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()) - new Date(new Date(userDob).getFullYear(), new Date(userDob).getMonth(), new Date(userDob).getDate())) / (1000 * 60 * 60 * 24)) + 1) / 365.25 ).toFixed(2)}</span>
                                <span className="text-xs font-bold text-gray-500 leading-tight">years<br/>old</span>
                            </div>
                        </div>
                    )}

                    {AVAILABLE_APPS.filter(app => allowedApps.includes(app.id)).length === 0 && currentUserUid !== ADMIN_UID && (
                        <div className="col-span-full text-center text-textMuted py-10">
                            Non hai accesso a nessuna applicazione. Contatta l'amministratore.
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}

