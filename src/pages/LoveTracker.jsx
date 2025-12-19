import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import './LoveTracker.css';

const monthNames = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

export default function LoveTracker() {
    const [loading, setLoading] = useState(true);
    const [dataStore, setDataStore] = useState({});
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDateKey, setSelectedDateKey] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);

    // Form State
    const [location, setLocation] = useState('');
    const [protection, setProtection] = useState('Nessuna');
    const [orgasm, setOrgasm] = useState(false);
    const [toys, setToys] = useState(false);

    const navigate = useNavigate();
    const fileInputRef = useRef(null);

    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            if (!user) {
                navigate('/');
            } else {
                setCurrentUser(user);
                const docRef = doc(db, "users", user.uid, "loveTracker", "main");
                const unsubscribeSnapshot = onSnapshot(docRef, (docSnap) => {
                    if (docSnap.exists()) {
                        setDataStore(docSnap.data().data || {});
                    } else {
                        setDataStore({});
                    }
                    setLoading(false);
                }, (error) => {
                    console.error("LoveTracker Load Error:", error);
                    setLoading(false);
                });
                return () => unsubscribeSnapshot();
            }
        });
        return () => unsubscribeAuth();
    }, [navigate]);

    const saveToCloud = async (newData) => {
        if (!currentUser) return;
        // Removing merge: true to ensure deleted keys in the 'data' object are removed from Firestore
        // validation: setDoc without merge replaces the document, which is what we want for the 'data' map
        await setDoc(doc(db, "users", currentUser.uid, "loveTracker", "main"), { data: newData, lastUpdate: new Date() });
    };

    const handleSaveEntry = async (e) => {
        e.preventDefault();
        const obj = { location, protection, orgasm, toys };
        const newData = { ...dataStore };
        if (!newData[selectedDateKey]) newData[selectedDateKey] = [];
        newData[selectedDateKey].push(obj);

        setDataStore(newData); // Optimistic update
        await saveToCloud(newData);

        // Reset form
        setLocation('');
        setProtection('Nessuna');
        setOrgasm(false);
        setToys(false);
    };

    const handleDeleteEntry = async (index) => {
        const newData = { ...dataStore };
        if (!newData[selectedDateKey]) return;

        // Create a copy of the array to avoid direct state mutation
        const newArray = [...newData[selectedDateKey]];
        newArray.splice(index, 1);

        if (newArray.length === 0) {
            delete newData[selectedDateKey];
        } else {
            newData[selectedDateKey] = newArray;
        }

        setDataStore(newData);
        await saveToCloud(newData);
    };

    const calculateStreak = () => {
        const dates = Object.keys(dataStore).sort();
        if (dates.length === 0) return 0;
        let maxStreak = 0;
        let currentStreak = 0;
        let lastDate = null;

        dates.forEach(dateStr => {
            const cur = new Date(dateStr);
            cur.setHours(12, 0, 0, 0);
            if (!lastDate) {
                currentStreak = 1;
                maxStreak = 1;
            } else {
                const diffTime = cur - lastDate;
                const oneDay = 1000 * 60 * 60 * 24;
                if (Math.abs(diffTime - oneDay) < 1000 * 60 * 60) currentStreak++;
                else if (diffTime > oneDay) currentStreak = 1;
            }
            if (currentStreak > maxStreak) maxStreak = currentStreak;
            lastDate = cur;
        });
        return maxStreak;
    };

    const getStats = () => {
        let s = 0, o = 0;
        Object.values(dataStore).forEach(arr => {
            s += arr.length;
            arr.forEach(e => { if (e.orgasm) o++; });
        });
        return {
            total: s,
            rate: s === 0 ? '0%' : Math.round((o / s) * 100) + '%',
            streak: calculateStreak()
        };
    };

    const stats = getStats();

    const changeMonth = (offset) => {
        const newDate = new Date(currentDate);
        newDate.setMonth(newDate.getMonth() + offset);
        setCurrentDate(newDate);
    };

    const openModal = (dateKey) => {
        setSelectedDateKey(dateKey);
        setIsModalOpen(true);
        // Reset form on open
        setLocation('');
        setProtection('Nessuna');
        setOrgasm(false);
        setToys(false);
    };

    const exportData = () => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([JSON.stringify(dataStore)], { type: "application/json" }));
        a.download = "love_backup.json";
        a.click();
    };

    const importData = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const r = new FileReader();
        r.onload = async (ev) => {
            try {
                const newData = { ...dataStore, ...JSON.parse(ev.target.result) };
                await saveToCloud(newData);
                alert("Importato con successo!");
            } catch (err) {
                alert("Errore file.");
            }
        };
        r.readAsText(file);
    };

    // Calendar Generation
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
    const calendarCells = [];

    for (let i = 0; i < firstDay; i++) {
        calendarCells.push(<div key={`empty-${i}`}></div>);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const entries = dataStore[dateKey] || [];
        const active = entries.length > 0;

        calendarCells.push(
            <div
                key={day}
                onClick={() => openModal(dateKey)}
                className={`day-cell relative flex flex-col justify-between p-2 cursor-pointer ${active ? 'bg-white/10 border border-accent/30' : 'bg-white/5 border border-transparent hover:bg-white/10'}`}
            >
                <span className={`text-[10px] font-bold ${active ? 'text-white' : 'text-textMuted'}`}>{day}</span>
                {active && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-2xl text-accent">♥</span>
                    </div>
                )}
            </div>
        );
    }

    if (loading) return null;

    // Style override for LoveTracker - Rose
    const pageStyle = {
        '--color-accent': '#e11d48', // Rose-600
        '--color-accent-hover': '#be123c', // Rose-700
    };

    return (
        <div className={`min-h-screen p-4 md:p-8 flex items-center justify-center transition-opacity duration-300 ${loading ? 'opacity-0' : 'opacity-100'}`} style={pageStyle}>

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

            <div className="max-w-5xl w-full grid grid-cols-1 md:grid-cols-3 gap-6 pt-16 md:pt-0">

                {/* Sidebar Stats */}
                <div className="bento-card col-span-1 md:col-span-1 p-8 flex flex-col justify-between h-full min-h-[600px]">
                    <div className="flex flex-col gap-6">
                        <div>
                            <h1 className="text-3xl font-bold text-white mb-1 tracking-tight">Love<span className="text-accent">Tracker</span></h1>
                            <p className="text-textMuted text-xs font-medium uppercase tracking-widest">Diario Personale</p>
                        </div>
                        <div className="space-y-4">
                            <div className="bg-black/20 p-5 rounded-2xl border border-white/5">
                                <div className="flex items-center justify-between"><p className="text-xs text-textMuted uppercase font-bold tracking-wider">Totale</p><span className="text-xl">❤️</span></div>
                                <p className="text-4xl font-bold text-white mt-2">{stats.total}</p>
                            </div>
                            <div className="bg-black/20 p-5 rounded-2xl border border-white/5">
                                <div className="flex items-center justify-between"><p className="text-xs text-textMuted uppercase font-bold tracking-wider">Orgasmi</p><span className="text-xl">✨</span></div>
                                <div className="flex items-end gap-2 mt-2"><p className="text-3xl font-bold text-accent">{stats.rate}</p></div>
                            </div>
                            <div className="bg-black/20 p-5 rounded-2xl border border-white/5">
                                <div className="flex items-center justify-between"><p className="text-xs text-textMuted uppercase font-bold tracking-wider">Streak Record</p><span className="text-xl">⚡</span></div>
                                <div className="flex items-end gap-2 mt-2"><p className="text-3xl font-bold text-yellow-500">{stats.streak}</p><p className="text-[10px] text-textMuted mb-1 uppercase font-bold">Giorni</p></div>
                            </div>
                        </div>
                    </div>
                    <div className="mt-6 border-t border-white/5 pt-6">
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={exportData} className="btn-secondary py-3 text-xs">Export</button>
                            <button onClick={() => fileInputRef.current.click()} className="btn-secondary py-3 text-xs">Import</button>
                            <input type="file" ref={fileInputRef} accept=".json" className="hidden" onChange={importData} />
                        </div>
                    </div>
                </div>

                {/* Calendar */}
                <div className="bento-card col-span-1 md:col-span-2 p-8 relative flex flex-col">
                    <div className="flex justify-between items-center mb-8">
                        <button onClick={() => changeMonth(-1)} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/5 text-textMuted hover:text-white transition-colors">←</button>
                        <h2 className="text-xl font-bold capitalize tracking-tight">{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</h2>
                        <button onClick={() => changeMonth(1)} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/5 text-textMuted hover:text-white transition-colors">→</button>
                    </div>
                    <div className="grid grid-cols-7 gap-3 text-center text-[10px] font-bold text-textMuted mb-4 uppercase tracking-widest">
                        <div>Dom</div><div>Lun</div><div>Mar</div><div>Mer</div><div>Gio</div><div>Ven</div><div>Sab</div>
                    </div>
                    <div className="grid grid-cols-7 gap-3">
                        {calendarCells}
                    </div>
                </div>
            </div>

            {/* Modal */}
            <div className={`fixed inset-0 bg-black/80 backdrop-blur-sm items-center justify-center z-50 p-4 ${isModalOpen ? 'flex' : 'hidden'}`}>
                <div className="bg-cardDark w-full max-w-lg flex flex-col max-h-[90vh] overflow-hidden rounded-[24px] border border-white/10 shadow-2xl relative">
                    <div className="p-6 border-b border-white/5 flex justify-between items-center bg-cardDark">
                        <div>
                            <h3 className="text-lg font-bold text-white">Dettagli</h3>
                            <p className="text-textMuted text-xs capitalize">{selectedDateKey}</p>
                        </div>
                        <button onClick={() => setIsModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-textMuted">✕</button>
                    </div>
                    <div className="overflow-y-auto p-6 space-y-6 bg-bgApp">

                        {/* History List */}
                        <div className="space-y-3">
                            {(!dataStore[selectedDateKey] || dataStore[selectedDateKey].length === 0) ? (
                                <p className="text-center text-xs text-textMuted py-4">Nessun dato.</p>
                            ) : (
                                dataStore[selectedDateKey].map((entry, idx) => (
                                    <div key={idx} className="bg-bgApp p-4 rounded-xl border border-white/5 flex justify-between items-center">
                                        <div>
                                            <div className="text-sm font-bold text-white">{entry.location}</div>
                                            <div className="text-xs text-textMuted">{entry.protection}</div>
                                        </div>
                                        <button onClick={() => handleDeleteEntry(idx)} className="text-textMuted hover:text-red-500">✕</button>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* New Entry Form */}
                        <div className="bg-cardDark p-5 rounded-2xl border border-white/5">
                            <h4 className="text-xs font-bold text-textMuted uppercase tracking-wider mb-4">Nuova Attività</h4>
                            <form onSubmit={handleSaveEntry} className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="input-label">Luogo</label>
                                        <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Es. Letto" required className="input-field" />
                                    </div>
                                    <div>
                                        <label className="input-label">Protezione</label>
                                        <select value={protection} onChange={(e) => setProtection(e.target.value)} className="input-field">
                                            <option value="Nessuna">Nessuna</option>
                                            <option value="Preservativo">Preservativo</option>
                                            <option value="Pillola">Pillola</option>
                                            <option value="PrEP">PrEP</option>
                                            <option value="Altro">Altro</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-bgApp p-3 rounded-xl border border-white/10 flex items-center justify-between cursor-pointer" onClick={() => setOrgasm(!orgasm)}>
                                        <span className="text-sm font-medium text-white">Orgasmo</span>
                                        <input type="checkbox" checked={orgasm} onChange={() => { }} className="accent-accent w-4 h-4 rounded" />
                                    </div>
                                    <div className="bg-bgApp p-3 rounded-xl border border-white/10 flex items-center justify-between cursor-pointer" onClick={() => setToys(!toys)}>
                                        <span className="text-sm font-medium text-white">Toys</span>
                                        <input type="checkbox" checked={toys} onChange={() => { }} className="accent-accent w-4 h-4 rounded" />
                                    </div>
                                </div>
                                <button type="submit" className="w-full btn-primary text-sm py-4">Salva</button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
