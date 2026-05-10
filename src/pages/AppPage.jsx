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

                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pl-2">
                    <div className="text-center lg:text-left flex-grow">
                        <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">Benvenuto</h1>
                        <p className="text-textMuted mt-2 text-sm">Scegli un'applicazione per iniziare.</p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 items-center flex-shrink-0">
                        {/* Profile App Widget */}
                        {allowedApps.includes('profile') && (
                            <Link to="/profile" className="bento-card p-4 md:px-6 md:py-4 flex items-center gap-5 bg-cardDark border border-white/5 hover:border-teal-500/30 relative overflow-hidden group w-full sm:w-auto min-w-[240px] no-underline transition-all">
                                <div className="absolute -right-4 -top-8 w-32 h-32 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity flex items-center justify-center">
                                    <span className="text-9xl">👤</span>
                                </div>
                                <div className="relative w-12 h-12 flex-shrink-0 rounded-2xl bg-teal-500/10 group-hover:bg-teal-500 flex items-center justify-center text-2xl group-hover:text-white transition-colors border border-teal-500/20">
                                    👤
                                </div>
                                <div className="flex flex-col relative z-10 text-left">
                                    <h3 className="text-xl font-bold text-white group-hover:text-teal-400 transition-colors">Profilo</h3>
                                    <p className="text-xs text-textMuted font-medium">Gestione account</p>
                                </div>
                            </Link>
                        )}

                        {/* Life Progress Widget - Header Version */}
                        {userDob && (() => {
                            const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
                            const dob = new Date(userDob);
                            const dobMonth = dob.getMonth();
                            const dobDate = dob.getDate();
                            const currentYear = today.getFullYear();

                            const thisYearBirthday = new Date(currentYear, dobMonth, dobDate);
                            const hasHadBirthday = today > thisYearBirthday;

                            const nextBirthdayYear = currentYear + (hasHadBirthday ? 1 : 0);
                            const nextBirthday = new Date(nextBirthdayYear, dobMonth, dobDate);

                            const daysToNextBirthday = Math.ceil((nextBirthday - today) / (1000 * 60 * 60 * 24));
                            const daysInYear = nextBirthdayYear % 4 === 0 ? 366 : 365;

                            const progress = 1 - (daysToNextBirthday / daysInYear);
                            const offset = 2 * Math.PI * 20 * (1 - progress);

                            const totalDaysAlive = Math.floor((today - new Date(dob.getFullYear(), dobMonth, dobDate)) / (1000 * 60 * 60 * 24));
                            const yearsOld = ((totalDaysAlive + 1) / 365.25).toFixed(2);

                            return (
                                <div className="bento-card p-4 md:px-6 md:py-4 flex items-center gap-5 bg-cardDark border border-white/5 relative overflow-hidden group w-full sm:w-auto min-w-[240px]">
                                    <div className="absolute -right-4 -top-8 w-32 h-32 opacity-5 pointer-events-none">
                                        <svg className="w-full h-full transform -rotate-90">
                                            <circle cx="64" cy="64" r="56" stroke="#fff" strokeWidth="16" fill="none" />
                                        </svg>
                                    </div>
                                    <div className="relative w-12 h-12 flex-shrink-0">
                                        <svg className="w-full h-full transform -rotate-90">
                                            <circle cx="24" cy="24" r="20" stroke="#222" strokeWidth="4" fill="none" />
                                            <circle cx="24" cy="24" r="20" stroke="#10b981" strokeWidth="4" fill="none" strokeDasharray={2 * Math.PI * 20} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-1000" />
                                        </svg>
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <span className="text-[10px] font-bold text-white">{Math.round(progress * 100)}%</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-col relative z-10 text-left">
                                        <div className="flex items-baseline gap-1.5">
                                            <h3 className="text-xl font-bold text-white">{yearsOld}</h3>
                                            <span className="text-xs text-textMuted uppercase tracking-wider font-medium">Anni</span>
                                        </div>
                                        <p className="text-xs text-emerald-400 font-medium">{totalDaysAlive} giorni di vita</p>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
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

                    {AVAILABLE_APPS.filter(app => allowedApps.includes(app.id) && app.id !== 'profile').map(app => {
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

