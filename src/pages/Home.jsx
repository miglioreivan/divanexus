import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

export default function Home() {
    const [loading, setLoading] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Request Modal State
    const [reqEmail, setReqEmail] = useState('');
    const [reqReason, setReqReason] = useState('');
    const [isReqSubmitting, setIsReqSubmitting] = useState(false);

    const navigate = useNavigate();
    const cardRef = useRef(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                navigate('/app');
            } else {
                setLoading(false);
            }
        });
        return () => unsubscribe();
    }, [navigate]);

    const handleLogin = async (e) => {
        e?.preventDefault(); // Handle both button click and form submit
        if (!email || !password) return;

        setError('');
        setIsSubmitting(true);

        try {
            await signInWithEmailAndPassword(auth, email, password);
            // Navigation handled by onAuthStateChanged
        } catch (err) {
            console.error(err);
            setIsSubmitting(false);

            if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
                setError("Email o password errati.");
            } else if (err.code === 'auth/too-many-requests') {
                setError("Troppi tentativi. Riprova più tardi.");
            } else {
                setError("Errore di accesso: " + err.code);
            }

            // Shake animation
            if (cardRef.current) {
                cardRef.current.animate([
                    { transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }
                ], { duration: 300 });
            }
        }
    };

    const handleRequestSubmit = async (e) => {
        e.preventDefault();
        setIsReqSubmitting(true);

        try {
            await addDoc(collection(db, "registration_requests"), {
                email: reqEmail,
                reason: reqReason,
                status: 'pending',
                timestamp: new Date()
            });

            alert("Richiesta inviata! L'amministratore valuterà la tua richiesta.");
            setIsModalOpen(false);
            setReqEmail('');
            setReqReason('');
        } catch (err) {
            console.error(err);
            alert("Errore nell'invio della richiesta.");
        } finally {
            setIsReqSubmitting(false);
        }
    };

    return (
        <div className={`min-h-screen flex flex-col items-center justify-center p-4 transition-opacity duration-500 ${loading ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
            <div className="w-full max-w-sm space-y-6">

                <div className="text-center space-y-2">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/5 border border-white/10 mb-4 shadow-2xl">
                        <span className="text-3xl">💠</span>
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-white">Nexus</h1>
                    <p className="text-sm text-textMuted">Il tuo hub personale</p>
                </div>

                <div ref={cardRef} className="bento-card p-8 shadow-2xl">
                    <form id="loginForm" className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleLogin(); }}>

                        <div className="space-y-1">
                            <label className="input-label">Email</label>
                            <input
                                type="email"
                                id="email"
                                placeholder="nome@esempio.com"
                                required
                                autoComplete="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="input-field"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="input-label">Password</label>
                            <input
                                type="password"
                                id="password"
                                placeholder="••••••••"
                                required
                                autoComplete="current-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="input-field"
                            />
                        </div>

                        <div id="errorMsg" className={`text-danger text-xs text-center min-h-[20px] transition-opacity ${error ? 'opacity-100' : 'opacity-0'}`}>
                            {error || "Credenziali non valide"}
                        </div>

                        <button
                            type="button"
                            id="submitBtn"
                            onClick={handleLogin}
                            disabled={isSubmitting}
                            style={{ opacity: isSubmitting ? 0.7 : 1, pointerEvents: isSubmitting ? 'none' : 'auto' }}
                            className="w-full bg-white hover:bg-gray-200 text-black font-bold py-3 rounded-xl transition-all active:scale-95 shadow-lg shadow-white/5 mt-2"
                        >
                            {isSubmitting ? <span className="animate-pulse">Caricamento...</span> : "Accedi →"}
                        </button>
                    </form>

                    <div className="mt-6 text-center border-t border-white/5 pt-4">
                        <p className="text-xs text-textMuted">Non hai un account?</p>
                        <button onClick={() => setIsModalOpen(true)} className="text-xs font-bold text-white hover:underline mt-1 transition-colors">
                            Richiedi accesso al sistema
                        </button>
                    </div>
                </div>

                <div className="text-center text-[10px] text-textMuted opacity-50">
                    &copy; 2025 Nexus System
                </div>
            </div>

            {/* Request Modal */}
            <div id="requestModal" className={`fixed inset-0 bg-black/90 backdrop-blur-md items-center justify-center z-[100] p-4 ${isModalOpen ? 'flex' : 'hidden'}`}>
                <div className="bg-cardDark w-full max-w-sm rounded-2xl border border-white/10 shadow-2xl p-6 relative">
                    <h3 className="text-lg font-bold text-white mb-1">Richiedi Accesso</h3>
                    <p className="text-xs text-textMuted mb-4">Invia una richiesta all'amministratore.</p>

                    <form id="requestForm" className="space-y-3" onSubmit={handleRequestSubmit}>
                        <input
                            type="email"
                            id="reqEmail"
                            placeholder="La tua email"
                            required
                            value={reqEmail}
                            onChange={(e) => setReqEmail(e.target.value)}
                            className="input-field"
                        />

                        <textarea
                            id="reqReason"
                            rows="3"
                            placeholder="Motivazione (es. Sono un collega...)"
                            required
                            value={reqReason}
                            onChange={(e) => setReqReason(e.target.value)}
                            className="input-field resize-none"
                        ></textarea>

                        <div className="flex gap-2 pt-2">
                            <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 btn-secondary text-xs">Annulla</button>
                            <button
                                type="submit"
                                disabled={isReqSubmitting}
                                style={{ opacity: isReqSubmitting ? 0.7 : 1 }}
                                className="flex-1 btn-primary text-black text-xs hover:text-black"
                            >
                                {isReqSubmitting ? "Invio..." : "Invia Richiesta"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
