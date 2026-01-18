import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

export default function AppPage() {
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (!user) {
                navigate('/');
            } else {
                setLoading(false);
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

                    <Link to="/love-tracker" className="bento-card p-8 group hover:scale-[1.02] hover:border-rose-500/30 cursor-pointer block no-underline relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                            <span className="text-9xl">❤️</span>
                        </div>

                        <div className="relative z-10 flex flex-col h-full justify-between min-h-[180px]">
                            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center text-2xl group-hover:bg-rose-500 group-hover:text-white transition-colors border border-rose-500/20">
                                ❤️
                            </div>

                            <div>
                                <h2 className="text-2xl font-bold text-white mb-1 group-hover:text-rose-400 transition-colors">Love Tracker</h2>
                                <p className="text-sm text-textMuted">Diario intimo, statistiche e calendario attività.</p>
                            </div>
                        </div>
                    </Link>

                    <Link to="/university" className="bento-card p-8 group hover:scale-[1.02] hover:border-indigo-500/30 cursor-pointer block no-underline relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                            <span className="text-9xl">🎓</span>
                        </div>

                        <div className="relative z-10 flex flex-col h-full justify-between min-h-[180px]">
                            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-2xl group-hover:bg-indigo-500 group-hover:text-white transition-colors border border-indigo-500/20">
                                🎓
                            </div>

                            <div>
                                <h2 className="text-2xl font-bold text-white mb-1 group-hover:text-indigo-400 transition-colors">Università</h2>
                                <p className="text-sm text-textMuted">Orario lezioni, libretto voti e scadenze.</p>
                            </div>
                        </div>
                    </Link>





                </div>
            </div>
        </div>
    );
}
