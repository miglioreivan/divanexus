import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signOut, updateEmail, updatePassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useAuthGuard } from '../hooks/useAuthGuard';
import { useUserData } from '../hooks/useUserData';

export default function ProfilePage() {
    const navigate = useNavigate();
    const { user, loading } = useAuthGuard();
    const { userData, loading: userDataLoading } = useUserData(user);

    const [name, setName] = useState('');
    const [dob, setDob] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const [isSaving, setIsSaving] = useState(false);
    const [statusMsg, setStatusMsg] = useState({ text: '', type: '' });

    // Initialize local state from userData when it loads
    useEffect(() => {
        if (user) setEmail(user.email);
    }, [user]);

    useEffect(() => {
        if (userData) {
            if (userData.name) setName(userData.name);
            if (userData.dateOfBirth) setDob(userData.dateOfBirth);
        }
    }, [userData]);

    const isLoading = loading || userDataLoading;

    const handleSave = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        setStatusMsg({ text: 'Salvataggio in corso...', type: 'text-textMuted' });

        try {
            // Update Auth Email if changed
            if (email && email !== user.email) {
                await updateEmail(user, email);
            }

            // Update Auth Password if provided
            if (password) {
                await updatePassword(user, password);
            }

            // Update Firestore Profile Data (write to sub-document to avoid overwriting allowedApps/role)
            await setDoc(doc(db, "users", user.uid, "profile", "main"), {
                name,
                dateOfBirth: dob
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

    if (isLoading) return null;

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

                <div className="bento-card p-5 md:p-8 shadow-2xl bg-cardDark border border-white/10 w-full overflow-hidden">
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

                        <div className="space-y-1 w-full max-w-full">
                            <label className="input-label">Data di Nascita</label>
                            <input
                                type="date"
                                value={dob}
                                onChange={(e) => setDob(e.target.value)}
                                className="input-field appearance-none min-w-0 w-full"
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
