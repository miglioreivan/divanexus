import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signOut, onAuthStateChanged, updateEmail, updatePassword } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

export default function ProfilePage() {
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState(null);

    const [name, setName] = useState('');
    const [dob, setDob] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const [isSaving, setIsSaving] = useState(false);
    const [statusMsg, setStatusMsg] = useState({ text: '', type: '' });

    const navigate = useNavigate();

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                navigate('/');
            } else {
                setCurrentUser(user);
                setEmail(user.email);
                try {
                    const userSnap = await getDoc(doc(db, "users", user.uid));
                    if (userSnap.exists()) {
                        const data = userSnap.data();
                        if (data.name) setName(data.name);
                        if (data.dateOfBirth) setDob(data.dateOfBirth);
                    }
                } catch (e) {
                    console.error("Error loading profile:", e);
                }
                setLoading(false);
            }
        });
        return () => unsubscribe();
    }, [navigate]);

    const handleSave = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        setStatusMsg({ text: 'Salvataggio in corso...', type: 'text-textMuted' });

        try {
            // Update Auth Email if changed
            if (email && email !== currentUser.email) {
                await updateEmail(currentUser, email);
            }

            // Update Auth Password if provided
            if (password) {
                await updatePassword(currentUser, password);
            }

            // Update Firestore Profile Data
            await setDoc(doc(db, "users", currentUser.uid), {
                name,
                dateOfBirth: dob,
                email: email // Keep email synced in doc if desired
            }, { merge: true });

            setStatusMsg({ text: '✅ Profilo aggiornato con successo!', type: 'text-green-400' });
            setPassword(''); // Clear password field after save
        } catch (error) {
            console.error("Error saving profile:", error);
            if (error.code === 'auth/requires-recent-login') {
                setStatusMsg({ text: '❌ Errore: Per modificare email o password devi prima disconnetterti e rifare il login.', type: 'text-red-400' });
            } else {
                setStatusMsg({ text: `❌ Errore: ${error.message}`, type: 'text-red-400' });
            }
        } finally {
            setIsSaving(false);
        }
    };

    if (loading) return null;

    // Style override for Profile - Teal
    const pageStyle = {
        '--color-accent': '#14b8a6', // Teal-500
        '--color-accent-hover': '#0d9488', // Teal-600
    };

    return (
        <div className="min-h-screen p-4 md:p-8 flex flex-col items-center justify-center transition-opacity duration-300" style={pageStyle}>
            
            <div className="fixed top-6 right-6 z-50 flex gap-2">
                <Link to="/app" className="btn-secondary rounded-full px-4 py-2 text-xs font-semibold no-underline shadow-lg bg-cardDark hover:bg-white/10">
                    🏠 Home
                </Link>
                <button
                    onClick={() => signOut(auth).then(() => navigate('/'))}
                    className="btn-secondary rounded-full px-4 py-2 text-xs font-semibold shadow-lg bg-cardDark hover:bg-red-500/10 hover:text-red-400"
                >
                    Esci
                </button>
            </div>

            <div className="w-full max-w-md space-y-6">
                
                <div className="text-center space-y-2 mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/20 mb-4 shadow-2xl text-teal-400">
                        <span className="text-3xl">👤</span>
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-white">Profilo Personale</h1>
                    <p className="text-sm text-textMuted">Gestisci i tuoi dati e le credenziali di accesso</p>
                </div>

                <div className="bento-card p-8 shadow-2xl bg-cardDark border border-white/10">
                    <form onSubmit={handleSave} className="space-y-4">
                        
                        <div className="space-y-1">
                            <label className="input-label">Nome Completo</label>
                            <input
                                type="text"
                                placeholder="Mario Rossi"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="input-field"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="input-label">Data di Nascita</label>
                            <input
                                type="date"
                                value={dob}
                                onChange={(e) => setDob(e.target.value)}
                                className="input-field"
                            />
                        </div>

                        <hr className="border-white/5 my-4" />

                        <div className="space-y-1">
                            <label className="input-label">Email di Accesso</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="input-field"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="input-label">Nuova Password</label>
                            <input
                                type="password"
                                placeholder="Lascia vuoto per non modificare"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                minLength={6}
                                className="input-field"
                            />
                        </div>

                        <div className={`text-xs text-center min-h-[20px] font-bold mt-4 ${statusMsg.type}`}>
                            {statusMsg.text}
                        </div>

                        <button
                            type="submit"
                            disabled={isSaving}
                            style={{ opacity: isSaving ? 0.7 : 1, pointerEvents: isSaving ? 'none' : 'auto' }}
                            className="w-full bg-white hover:bg-gray-200 text-black font-bold py-3 rounded-xl transition-all active:scale-95 shadow-lg shadow-white/5 mt-4"
                        >
                            {isSaving ? <span className="animate-pulse">Salvataggio...</span> : "Salva Modifiche"}
                        </button>
                    </form>
                </div>

            </div>
        </div>
    );
}
