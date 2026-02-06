import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signOut, onAuthStateChanged, createUserWithEmailAndPassword, sendPasswordResetEmail, getAuth } from 'firebase/auth';
import { collection, getDocs, doc, setDoc, deleteDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import { auth, db, app as firebaseApp } from '../firebase';
import { AVAILABLE_APPS } from '../constants';

const ADMIN_UID = "vdeS2SIosTWqeauP0PaZIllEG1f2";

export default function AdminPage() {
    const [loading, setLoading] = useState(true);
    const [users, setUsers] = useState([]);
    const [requests, setRequests] = useState([]);
    const [pendingCount, setPendingCount] = useState(0);

    // Form States
    const [newEmail, setNewEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [statusMsg, setStatusMsg] = useState({ text: '', type: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Edit Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editUid, setEditUid] = useState('');
    const [editEmail, setEditEmail] = useState('');
    const [editAllowedApps, setEditAllowedApps] = useState([]);

    const navigate = useNavigate();

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (!user || user.uid !== ADMIN_UID) {
                alert("⛔ Accesso Negato.");
                navigate('/app');
            } else {
                setLoading(false);
                loadData();
            }
        });
        return () => unsubscribe();
    }, [navigate]);

    const loadData = () => {
        loadUsers();
        const unsubRequests = onSnapshot(collection(db, "registration_requests"), (snap) => {
            const reqs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setRequests(reqs);
            setPendingCount(reqs.length);
        }, (error) => {
            console.error("Requests Load Error:", error);
        });
        return unsubRequests; // Cleanup handled by component unmount roughly, or strict useEffect return logic if we persist unsub
    };

    const loadUsers = async () => {
        try {
            const snap = await getDocs(collection(db, "users"));
            setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
        } catch (e) { console.error(e); }
    };

    // --- ACTIONS ---

    const handleCreateUser = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setStatusMsg({ text: 'Creazione...', type: 'text-textMuted' });

        try {
            // Secondary App Trick to create user without logging out Admin
            const secondaryApp = initializeApp(firebaseApp.options, "SecondaryAppManual" + Date.now()); // Unique name to avoid conflicts
            const secondaryAuth = getAuth(secondaryApp);
            const userCred = await createUserWithEmailAndPassword(secondaryAuth, newEmail, newPassword);
            const newUser = userCred.user;

            await setDoc(doc(db, "users", newUser.uid), { email: newEmail, role: 'user', createdAt: new Date() });

            // Cleanup: secondaryApp doesn't have a direct delete() method exposed easily in modular v9+, 
            // but we just let it be garbage collected or use it once. 
            // Actually, signOut is enough for auth state, but the app instance remains. 
            // It's fine for this admin panel usage.
            await signOut(secondaryAuth);

            setStatusMsg({ text: '✅ Utente creato!', type: 'text-green-500' });
            setNewEmail(''); setNewPassword('');
            loadUsers();
        } catch (error) {
            setStatusMsg({ text: '❌ Errore: ' + error.code, type: 'text-red-500' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const approveRequest = async (req) => {
        const password = prompt(`Inserisci una password provvisoria per ${req.email}:`, "Nexus2025");
        if (!password) return;

        try {
            const secondaryApp = initializeApp(firebaseApp.options, "SecondaryAppRequest" + Date.now());
            const secondaryAuth = getAuth(secondaryApp);
            const userCred = await createUserWithEmailAndPassword(secondaryAuth, req.email, password);
            const newUser = userCred.user;

            await setDoc(doc(db, "users", newUser.uid), { email: req.email, role: 'user', createdAt: new Date() });
            await deleteDoc(doc(db, "registration_requests", req.id));
            await signOut(secondaryAuth);

            alert(`✅ Utente creato!\n\nEmail: ${req.email}\nPassword: ${password}\nUID: ${newUser.uid}`);
            loadUsers();
        } catch (e) {
            alert("Errore: " + e.message);
        }
    };

    const rejectRequest = async (id) => {
        if (!confirm("Rifiutare e cancellare questa richiesta?")) return;
        try {
            await deleteDoc(doc(db, "registration_requests", id));
        } catch (e) { alert("Errore: " + e.message); }
    };

    const deleteUser = async (uid) => {
        if (confirm("Eliminare i dati di questo utente? (Attenzione: l'account Auth rimarrà attivo, solo i dati DB saranno cancellati)")) {
            try {
                await deleteDoc(doc(db, "users", uid));
                alert("Dati eliminati.");
                loadUsers();
            } catch (e) { alert("Errore: " + e.message); }
        }
    };

    const resetPwd = async (email) => {
        if (!email) return alert("Email non valida");
        if (confirm(`Inviare reset password a ${email}?`)) {
            try { await sendPasswordResetEmail(auth, email); alert("📧 Email inviata!"); } catch (e) { alert("Errore: " + e.message); }
        }
    };

    const openEditModal = (u) => {
        setEditUid(u.uid);
        setEditEmail(u.email);
        setEditAllowedApps(u.allowedApps || AVAILABLE_APPS.map(a => a.id));
        setIsEditModalOpen(true);
    };

    const saveEditUser = async () => {
        try {
            await updateDoc(doc(db, "users", editUid), {
                email: editEmail,
                allowedApps: editAllowedApps
            });
            setIsEditModalOpen(false);
            loadUsers();
        } catch (e) { alert("Errore: " + e.message); }
    };

    if (loading) return null;

    return (
        <div className="min-h-screen p-8 flex flex-col items-center">
            <div className="fixed top-6 right-6 z-50 flex gap-2">
                <Link to="/app" className="flex items-center gap-2 bg-[#18181b] hover:bg-[#27272a] border border-white/5 text-textMuted hover:text-white px-4 py-2 rounded-full text-xs font-semibold transition-all no-underline shadow-lg">
                    🏠 Home
                </Link>
            </div>

            <div className="w-full max-w-6xl space-y-8 pt-10">

                <div className="flex flex-col md:flex-row justify-between items-end gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3"><span className="text-2xl">🛡️</span> Pannello Admin</h1>
                        <p className="text-sm text-textMuted mt-1">Gestione centralizzata utenti Nexus</p>
                    </div>
                    <div className="flex gap-4">
                        <div className="bg-white/5 px-4 py-2 rounded-xl border border-white/10">
                            <span className="text-xs text-textMuted uppercase font-bold">Richieste</span>
                            <p className="text-xl font-bold text-yellow-500 text-right">{pendingCount}</p>
                        </div>
                        <div className="bg-white/5 px-4 py-2 rounded-xl border border-white/10">
                            <span className="text-xs text-textMuted uppercase font-bold">Utenti Attivi</span>
                            <p className="text-xl font-bold text-white text-right">{users.length}</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Add User Form */}
                    <div className="lg:col-span-1">
                        <div className="bento-card p-6 shadow-2xl h-fit border-l-4 border-l-white/20 bg-cardDark">
                            <h2 className="text-lg font-bold text-white mb-4">➕ Aggiungi Manualmente</h2>
                            <form onSubmit={handleCreateUser} className="space-y-4">
                                <div className="space-y-1">
                                    <label className="input-label">Email</label>
                                    <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="email@esempio.com" required className="input-field" />
                                </div>
                                <div className="space-y-1">
                                    <label className="input-label">Password</label>
                                    <input type="text" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Minimo 6 caratteri" required className="input-field" />
                                </div>
                                <div className={`text-xs text-center min-h-[20px] font-bold ${statusMsg.type}`}>{statusMsg.text}</div>
                                <button type="submit" disabled={isSubmitting} className="w-full btn-primary text-black bg-white hover:bg-gray-200 mt-2 disabled:opacity-50">
                                    {isSubmitting ? 'Creazione...' : 'Crea Account'}
                                </button>
                            </form>
                        </div>
                    </div>

                    <div className="lg:col-span-2 flex flex-col gap-6">

                        {/* Requests List */}
                        {requests.length > 0 && (
                            <div className="bento-card p-6 border-l-4 border-l-yellow-500/50 bg-cardDark">
                                <div className="flex justify-between items-center mb-4">
                                    <h2 className="text-lg font-bold text-white flex items-center gap-2">📩 Richieste in Sospeso <span className="animate-pulse w-2 h-2 rounded-full bg-yellow-500"></span></h2>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm text-textMuted">
                                        <thead className="text-xs uppercase bg-white/5 text-white">
                                            <tr>
                                                <th className="px-4 py-3 rounded-l-lg">Email</th>
                                                <th className="px-4 py-3">Motivazione</th>
                                                <th className="px-4 py-3 rounded-r-lg text-right">Azioni</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {requests.map(req => (
                                                <tr key={req.id} className="hover:bg-white/5">
                                                    <td className="px-4 py-3 font-bold text-white">{req.email}</td>
                                                    <td className="px-4 py-3 text-xs text-textMuted italic">"{req.reason}"</td>
                                                    <td className="px-4 py-3 text-right flex justify-end gap-2">
                                                        <button onClick={() => approveRequest(req)} className="bg-green-500/10 hover:bg-green-500/20 text-green-500 text-xs font-bold px-3 py-1.5 rounded-lg border border-green-500/20 transition-all">Approva ✅</button>
                                                        <button onClick={() => rejectRequest(req.id)} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold px-3 py-1.5 rounded-lg border border-red-500/20 transition-all">Rifiuta ❌</button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Users List */}
                        <div className="bento-card p-6 min-h-[400px] bg-cardDark">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-lg font-bold text-white">Lista Utenti</h2>
                                <button onClick={loadUsers} className="text-xs text-textMuted hover:text-white bg-white/5 px-3 py-1 rounded-lg">Aggiorna ↻</button>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm text-textMuted">
                                    <thead className="text-xs uppercase bg-white/5 text-white">
                                        <tr>
                                            <th className="px-4 py-3 rounded-l-lg">Email</th>
                                            <th className="px-4 py-3">UID</th>
                                            <th className="px-4 py-3 rounded-r-lg text-right">Azioni</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {users.length === 0 ? <tr><td colspan="3" className="text-center py-4">Nessun utente.</td></tr> : users.map(u => {
                                            const isMe = u.uid === ADMIN_UID;
                                            return (
                                                <tr key={u.uid} className="hover:bg-white/5 transition-colors">
                                                    <td className="px-4 py-3 font-medium text-white">{u.email || 'N/A'} {isMe && <span className="text-[10px] bg-white/10 px-1 rounded ml-1">TU</span>}</td>
                                                    <td className="px-4 py-3 text-xs font-mono text-textMuted truncate max-w-[100px]" title={u.uid}>{u.uid}</td>
                                                    <td className="px-4 py-3 text-right flex justify-end gap-2">
                                                        <button onClick={() => resetPwd(u.email)} className="p-1.5 rounded hover:bg-white/10 text-textMuted hover:text-white" title="Reset Password">🔑</button>
                                                        <button onClick={() => openEditModal(u)} className="p-1.5 rounded hover:bg-white/10 text-textMuted hover:text-white" title="Modifica">✏️</button>
                                                        {!isMe && <button onClick={() => deleteUser(u.uid)} className="p-1.5 rounded hover:bg-red-500/20 text-red-500" title="Elimina">🗑️</button>}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Edit Modal */}
            {isEditModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                    <div className="bg-cardDark w-full max-w-sm rounded-2xl border border-white/10 shadow-2xl p-6">
                        <h3 className="text-lg font-bold text-white mb-4">Modifica Utente</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="input-label">Email (Database)</label>
                                <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} className="input-field" />
                                <p className="text-[10px] text-textMuted mt-1">Nota: Modifica solo l'email visualizzata nel DB.</p>
                            </div>

                            <div>
                                <label className="input-label mb-2 block">Applicazioni Abilitate</label>
                                <div className="space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar">
                                    {AVAILABLE_APPS.map(app => (
                                        <label key={app.id} className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-white/5 border border-transparent hover:border-white/10 transition-all select-none">
                                            <input
                                                type="checkbox"
                                                checked={editAllowedApps.includes(app.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setEditAllowedApps(prev => [...prev, app.id]);
                                                    } else {
                                                        setEditAllowedApps(prev => prev.filter(id => id !== app.id));
                                                    }
                                                }}
                                                className="accent-white w-4 h-4"
                                            />
                                            <span className="text-xl">{app.icon}</span>
                                            <span className="text-sm text-white font-medium">{app.name}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button onClick={() => setIsEditModalOpen(false)} className="flex-1 btn-secondary text-xs">Annulla</button>
                                <button onClick={saveEditUser} className="flex-1 btn-primary text-black bg-white hover:bg-gray-200 text-xs">Salva</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
