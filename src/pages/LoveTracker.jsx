import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useAuthGuard } from '../hooks/useAuthGuard';
import './LoveTracker.css';

const monthNames = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

export default function LoveTracker() {
    const { user, loading: authLoading } = useAuthGuard();
    const [dataLoading, setDataLoading] = useState(true);
    const [dataStore, setDataStore] = useState({});
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDateKey, setSelectedDateKey] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Form State
    const [partner, setPartner] = useState('');
    const [isProtected, setIsProtected] = useState(false);
    const [notes, setNotes] = useState('');
    const [editingId, setEditingId] = useState(null);

    // Body Count Modal State
    const [isBodyCountModalOpen, setIsBodyCountModalOpen] = useState(false);
    const [selectedPartnerName, setSelectedPartnerName] = useState(null);

    const navigate = useNavigate();
    const fileInputRef = useRef(null);

    // Migration and normalization
    const normalizeAndMigrateData = (rawData) => {
        let hasChanges = false;
        const normalized = {};
        Object.entries(rawData).forEach(([dateKey, entries]) => {
            normalized[dateKey] = entries.map(e => {
                // Se c'è type, rating o location, è il vecchio formato
                if (e.type !== undefined || e.location !== undefined || e.rating !== undefined) {
                    hasChanges = true;
                    
                    let newNotes = e.notes || '';
                    if (e.location && e.location.trim() !== '') {
                        newNotes = newNotes ? `${newNotes}\nLuogo: ${e.location}` : `Luogo: ${e.location}`;
                    }

                    let protectedVal = false;
                    if (e.protection && e.protection !== 'Nessuna') {
                        protectedVal = true;
                    }
                    if (e.isProtected !== undefined) {
                        protectedVal = e.isProtected;
                    }

                    return {
                        id: e.id || crypto.randomUUID(),
                        partner: e.partner || '',
                        isProtected: protectedVal,
                        notes: newNotes
                    };
                }
                return { ...e, id: e.id || crypto.randomUUID() };
            });
        });
        return { normalized, hasChanges };
    };

    const saveToCloud = async (newData) => {
        if (!user) return;
        try {
            await setDoc(doc(db, "users", user.uid, "loveTracker", "main"), { data: newData, lastUpdate: new Date() }, { merge: true });
        } catch (e) {
            console.error("Errore salvataggio (possibile AdBlocker):", e);
        }
    };

    useEffect(() => {
        if (!user) return;
        const docRef = doc(db, "users", user.uid, "loveTracker", "main");
        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const { normalized, hasChanges } = normalizeAndMigrateData(docSnap.data().data || {});
                setDataStore(normalized);
                if (hasChanges) {
                    saveToCloud(normalized);
                }
            } else {
                setDataStore({});
            }
            setDataLoading(false);
        }, (error) => {
            console.error("LoveTracker Load Error:", error);
            setDataLoading(false);
        });
        return () => unsubscribe();
    }, [user]);

    const loading = authLoading || dataLoading;

    const handleSaveEntry = async (e) => {
        e.preventDefault();
        const newData = { ...dataStore };
        if (!newData[selectedDateKey]) newData[selectedDateKey] = [];

        if (editingId !== null) {
            const entryIndex = newData[selectedDateKey].findIndex(e => e.id === editingId);
            if (entryIndex !== -1) {
                newData[selectedDateKey][entryIndex] = {
                    id: editingId,
                    partner: partner.trim(),
                    isProtected,
                    notes: notes.trim()
                };
            }
        } else {
            newData[selectedDateKey].push({
                id: crypto.randomUUID(),
                partner: partner.trim(),
                isProtected,
                notes: notes.trim()
            });
        }

        setDataStore(newData); // Optimistic update
        await saveToCloud(newData);
        resetForm();
    };

    const resetForm = () => {
        setPartner('');
        setIsProtected(false);
        setNotes('');
        setEditingId(null);
    };

    const handleDeleteEntry = async (id) => {
        const newData = { ...dataStore };
        if (!newData[selectedDateKey]) return;

        const newArray = newData[selectedDateKey].filter(e => e.id !== id);

        if (newArray.length === 0) {
            delete newData[selectedDateKey];
        } else {
            newData[selectedDateKey] = newArray;
        }

        setDataStore(newData);
        await saveToCloud(newData);
        if (editingId === id) resetForm();
    };

    const handleEditEntry = (entry) => {
        setEditingId(entry.id);
        setPartner(entry.partner || '');
        setIsProtected(entry.isProtected || false);
        setNotes(entry.notes || '');
    };

    const calculateStreak = () => {
        const dates = Object.keys(dataStore).filter(k => k !== 'senza_data').sort();
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
        let total = 0;
        const partnersTotal = new Set();

        Object.values(dataStore).forEach(arr => {
            arr.forEach(e => {
                total++;
                const partnerTrimmed = e.partner && e.partner.trim().toLowerCase();
                if (partnerTrimmed) {
                    partnersTotal.add(partnerTrimmed);
                }
            });
        });

        return {
            total,
            bodyCount: partnersTotal.size,
            streak: calculateStreak()
        };
    };

    const stats = useMemo(() => getStats(), [dataStore]);

    const getAllPartnersData = () => {
        const partnersMap = {};
        Object.entries(dataStore).forEach(([dateKey, arr]) => {
            arr.forEach((e, idx) => {
                if (e.partner && e.partner.trim() !== '') {
                    const partnerKey = e.partner.trim();
                    const partnerKeyLower = partnerKey.toLowerCase();
                    
                    if (!partnersMap[partnerKeyLower]) {
                        partnersMap[partnerKeyLower] = {
                            name: partnerKey,
                            entries: []
                        };
                    }
                    
                    partnersMap[partnerKeyLower].entries.push({
                        ...e,
                        date: dateKey,
                        entryIndex: idx
                    });
                }
            });
        });

        return Object.values(partnersMap).map(p => {
            p.entries.sort((a, b) => {
                if (a.date === 'senza_data' && b.date === 'senza_data') return 0;
                if (a.date === 'senza_data') return 1;
                if (b.date === 'senza_data') return -1;
                return new Date(b.date) - new Date(a.date);
            });
            return p;
        }).sort((a, b) => a.name.localeCompare(b.name));
    };

    const partnersData = useMemo(() => getAllPartnersData(), [dataStore]);

    const changeMonth = (offset) => {
        const newDate = new Date(currentDate);
        newDate.setMonth(newDate.getMonth() + offset);
        setCurrentDate(newDate);
    };

    const openModal = (dateKey) => {
        setSelectedDateKey(dateKey);
        setIsModalOpen(true);
        // Reset form on open
        resetForm();
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
                console.error("Import error:", err);
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
        
        const symbol = '♥';
        const symbolColor = 'text-accent';
        const cellBorder = active ? 'border-accent/30 bg-white/10' : 'border-transparent bg-white/5 hover:bg-white/10';

        calendarCells.push(
            <div
                key={day}
                onClick={() => openModal(dateKey)}
                className={`day-cell relative flex flex-col justify-between p-2 cursor-pointer ${cellBorder}`}
            >
                <span className={`text-[10px] font-bold ${active ? 'text-white' : 'text-textMuted'}`}>{day}</span>
                {active && entries.length === 1 && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className={`text-2xl ${symbolColor}`}>{symbol}</span>
                    </div>
                )}
                {active && entries.length > 1 && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className={`text-2xl ${symbolColor} absolute -translate-x-1.5 -translate-y-1`}>{symbol}</span>
                        <span className={`text-2xl ${symbolColor}/70 absolute translate-x-1.5 translate-y-1 z-10`}>{symbol}</span>
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
        <div className={`min-h-screen p-4 md:p-8 flex flex-col items-center justify-start md:justify-center overflow-y-auto transition-opacity duration-300 ${loading ? 'opacity-0' : 'opacity-100'}`} style={pageStyle}>

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
                <div className="bento-card col-span-1 md:col-span-1 p-8 flex flex-col h-full">
                    <div className="flex flex-col gap-6">
                        <div>
                            <h1 className="text-3xl font-bold text-white mb-1 tracking-tight">Love<span className="text-accent">Tracker</span></h1>
                            <p className="text-textMuted text-xs font-medium uppercase tracking-widest">Diario Personale</p>
                        </div>
                        
                        <div className="space-y-4 text-left">
                            <div className="bg-black/20 p-5 rounded-2xl border border-white/5">
                                <div className="flex items-center justify-between"><p className="text-xs text-textMuted uppercase font-bold tracking-wider">Totale Attività</p><span className="text-xl">❤️</span></div>
                                <p className="text-4xl font-bold text-white mt-2">{stats.total}</p>
                            </div>
                            <div className="bg-black/20 p-5 rounded-2xl border border-white/5">
                                <div className="flex items-center justify-between"><p className="text-xs text-textMuted uppercase font-bold tracking-wider">Streak Record</p><span className="text-xl">⚡</span></div>
                                <div className="flex items-end gap-2 mt-2"><p className="text-3xl font-bold text-yellow-500">{stats.streak}</p><p className="text-[10px] text-textMuted mb-1 uppercase font-bold">Giorni</p></div>
                            </div>
                            <div 
                                onClick={() => setIsBodyCountModalOpen(true)}
                                className="bg-black/20 p-5 rounded-2xl border border-white/5 cursor-pointer hover:border-accent/40 hover:bg-white/5 transition-all"
                            >
                                <div className="flex items-center justify-between"><p className="text-xs text-textMuted uppercase font-bold tracking-wider">Body Count Totale</p><span className="text-xl">👥</span></div>
                                <div className="flex items-end gap-2 mt-2"><p className="text-3xl font-bold text-blue-400">{stats.bodyCount}</p><p className="text-[10px] text-textMuted mb-1 uppercase font-bold">Partner ➔</p></div>
                            </div>
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
                    {/* Access to experiences without date */}
                    <div className="mt-6 pt-4 border-t border-white/5 flex justify-center items-center">
                        <button 
                            type="button"
                            onClick={() => openModal('senza_data')}
                            className="btn-secondary py-2.5 px-4 text-xs font-semibold rounded-xl bg-white/5 border border-white/10 text-textMuted hover:text-white flex items-center gap-2 transition-all w-full justify-center"
                        >
                            ❓ Esperienze Senza Data {(dataStore['senza_data'] || []).length > 0 && `(${(dataStore['senza_data'] || []).length})`} ➔
                        </button>
                    </div>
                </div>



                {/* BACKUP SECTION - AT THE BOTTOM */}
                <div className="col-span-1 md:col-span-3 mt-8 mb-8 flex justify-center w-full">
                    <div className="bento-card p-6 w-full max-w-md bg-cardDark border border-white/5 rounded-[24px] text-center">
                        <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-4">Gestione Dati Locali</h3>
                        <p className="text-xs text-textMuted mb-6">Esporta un backup dei tuoi dati o importane uno esistente. Attenzione: l'importazione sovrascriverà i dati correnti sul cloud.</p>
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={exportData} className="btn-secondary py-3 text-xs flex items-center justify-center gap-2">📤 Esporta JSON</button>
                            <button onClick={() => fileInputRef.current.click()} className="btn-secondary py-3 text-xs flex items-center justify-center gap-2">📥 Importa JSON</button>
                            <input type="file" ref={fileInputRef} accept=".json" className="hidden" onChange={importData} />
                        </div>
                    </div>
                </div>

            </div>

            {/* Modal */}
            <div className={`fixed inset-0 bg-black/80 backdrop-blur-sm items-center justify-center z-50 p-4 ${isModalOpen ? 'flex' : 'hidden'}`}>
                <div className="bg-cardDark w-full max-w-lg flex flex-col max-h-[90vh] overflow-hidden rounded-[24px] border border-white/10 shadow-2xl relative">
                    <div className="p-6 border-b border-white/5 flex justify-between items-center bg-cardDark">
                        <div>
                            <h3 className="text-lg font-bold text-white">Dettagli</h3>
                            <p className="text-textMuted text-xs capitalize">
                                {selectedDateKey === 'senza_data'
                                    ? 'Senza Data'
                                    : new Date(selectedDateKey).toLocaleDateString('it-IT', {
                                        day: 'numeric',
                                        month: 'long',
                                        year: 'numeric'
                                    })}
                            </p>
                        </div>
                        <button onClick={() => setIsModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-textMuted">✕</button>
                    </div>
                    <div className="overflow-y-auto p-6 space-y-6 bg-bgApp">

                        {/* History List */}
                        <div className="space-y-3">
                            {(!dataStore[selectedDateKey] || dataStore[selectedDateKey].length === 0) ? (
                                <p className="text-center text-xs text-textMuted py-4">Nessun dato.</p>
                            ) : (
                                dataStore[selectedDateKey].map((entry) => (
                                    <div key={entry.id} className="bg-bgApp p-4 rounded-xl border border-white/5 flex justify-between items-start">
                                        <div className="space-y-2 text-left w-full">
                                            {entry.partner && (
                                                <div className="text-sm font-bold text-white">
                                                    Con: <span className="text-accent">{entry.partner}</span>
                                                </div>
                                            )}
                                            
                                            <div className="flex items-center gap-3 text-xs text-textMuted pt-0.5">
                                                <span>🛡️ Protezioni: {entry.isProtected ? <span className="text-green-400 font-bold">Sì</span> : <span className="text-red-400 font-bold">No</span>}</span>
                                            </div>

                                            {entry.notes && (
                                                <div className="text-xs text-textMuted whitespace-pre-wrap mt-2 p-2 bg-white/5 rounded-lg border border-white/5">
                                                    {entry.notes}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 mt-1 ml-4 shrink-0">
                                            <button onClick={() => handleEditEntry(entry)} className="text-textMuted hover:text-accent p-1 text-sm transition-colors">✎</button>
                                            <button onClick={() => handleDeleteEntry(entry.id)} className="text-textMuted hover:text-red-500 p-1 text-sm transition-colors">✕</button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* New Entry Form */}
                        <div className="bg-cardDark p-5 rounded-2xl border border-white/5">
                            <h4 className="text-xs font-bold text-textMuted uppercase tracking-wider mb-4">{editingId !== null ? 'Modifica Esperienza' : 'Nuova Esperienza'}</h4>
                            <form onSubmit={handleSaveEntry} className="space-y-4">
                                <div>
                                    <label htmlFor="partnerInput" className="input-label">Partner</label>
                                    <input 
                                        id="partnerInput"
                                        name="partner"
                                        type="text" 
                                        value={partner} 
                                        onChange={(e) => setPartner(e.target.value)} 
                                        placeholder="Nome partner..." 
                                        required 
                                        className="input-field w-full" 
                                    />
                                </div>
                                
                                <div className="bg-bgApp p-3 rounded-xl border border-white/10 flex items-center justify-between cursor-pointer transition-colors hover:border-white/20" onClick={() => setIsProtected(!isProtected)}>
                                    <span className="text-sm font-medium text-white flex items-center gap-2">🛡️ Usate Protezioni?</span>
                                    <div className={`text-xs font-bold px-3 py-1 rounded-full ${isProtected ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                                        {isProtected ? 'Sì' : 'No'}
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="notesInput" className="input-label">Note</label>
                                    <textarea
                                        id="notesInput"
                                        name="notes"
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        placeholder="Aggiungi eventuali dettagli (es. luogo, impressioni...)"
                                        className="input-field w-full min-h-[80px] resize-y"
                                    />
                                </div>

                                <div className="flex gap-2 pt-2">
                                    {editingId !== null && (
                                        <button type="button" onClick={resetForm} className="w-1/3 btn-secondary text-sm py-4">Annulla</button>
                                    )}
                                    <button type="submit" className="flex-1 btn-primary text-sm py-4">{editingId !== null ? 'Aggiorna' : 'Salva'}</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>

            {/* Body Count Modal */}
            <div className={`fixed inset-0 bg-black/80 backdrop-blur-sm items-center justify-center z-50 p-4 ${isBodyCountModalOpen ? 'flex' : 'hidden'}`}>
                <div className="bg-cardDark w-full max-w-4xl flex flex-col h-[80vh] overflow-hidden rounded-[24px] border border-white/10 shadow-2xl relative">
                    <div className="p-6 border-b border-white/5 flex justify-between items-center bg-cardDark">
                        <div className="text-left">
                            <h3 className="text-lg font-bold text-white">👥 Lista Partner & Dettaglio Rapporti</h3>
                            <p className="text-textMuted text-xs">Seleziona un partner per vedere lo storico completo delle esperienze</p>
                        </div>
                        <button onClick={() => { setIsBodyCountModalOpen(false); setSelectedPartnerName(null); }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-textMuted">✕</button>
                    </div>
                    
                    <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-bgApp">
                        {/* Partners List Sidebar */}
                        <div className="w-full md:w-1/3 border-r border-white/5 overflow-y-auto p-4 space-y-2 max-h-[30vh] md:max-h-none border-b md:border-b-0">
                            <label className="block text-[10px] uppercase text-textMuted font-bold mb-2 ml-1 tracking-wider text-left">Tutti i Partner ({partnersData.length})</label>
                            {partnersData.length === 0 ? (
                                <p className="text-xs text-textMuted p-2 text-left">Nessun partner registrato.</p>
                            ) : (
                                partnersData.map((partnerObj) => {
                                    const isSelected = selectedPartnerName === partnerObj.name;
                                    return (
                                        <button
                                            key={partnerObj.name}
                                            type="button"
                                            onClick={() => setSelectedPartnerName(partnerObj.name)}
                                            className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-center justify-between ${isSelected ? 'bg-accent/15 border-accent text-white font-bold' : 'bg-cardDark/50 border-white/5 text-textMuted hover:text-white hover:bg-white/5'}`}
                                        >
                                            <span className="truncate">{partnerObj.name}</span>
                                            <span className="text-xs bg-white/10 text-white px-2 py-0.5 rounded-full font-bold">
                                                {partnerObj.entries.length}
                                            </span>
                                        </button>
                                    );
                                })
                            )}
                        </div>

                        {/* Partner Experiences Details Pane */}
                        <div className="flex-1 overflow-y-auto p-6 flex flex-col">
                            {selectedPartnerName ? (
                                (() => {
                                    const partnerObj = partnersData.find(p => p.name === selectedPartnerName);
                                    if (!partnerObj) return null;

                                    return (
                                        <div className="space-y-4 flex-1 text-left">
                                            <div className="border-b border-white/5 pb-3">
                                                <h4 className="text-xl font-bold text-white flex items-center gap-2">
                                                    👤 {partnerObj.name}
                                                </h4>
                                                <p className="text-xs text-textMuted mt-1">
                                                    Totale esperienze registrate: <span className="text-white font-bold">{partnerObj.entries.length}</span>
                                                </p>
                                            </div>

                                            <div className="space-y-3">
                                                {partnerObj.entries.map((item, index) => {
                                                    const formattedDate = item.date === 'senza_data'
                                                        ? 'Senza Data'
                                                        : new Date(item.date).toLocaleDateString('it-IT', {
                                                            day: 'numeric',
                                                            month: 'long',
                                                            year: 'numeric'
                                                        });

                                                    return (
                                                        <div key={item.id || index} className="bg-cardDark/50 p-4 rounded-xl border border-white/5 space-y-2">
                                                            <div className="flex justify-between items-start gap-2 flex-wrap">
                                                                <span className="text-xs text-textMuted font-medium">
                                                                    📅 {formattedDate}
                                                                </span>
                                                                <span className="text-xs tracking-wide font-bold">
                                                                    🛡️ {item.isProtected ? <span className="text-green-400">Protetto</span> : <span className="text-red-400">Non Protetto</span>}
                                                                </span>
                                                            </div>
                                                            {item.notes && (
                                                                <div className="text-xs text-textMuted whitespace-pre-wrap mt-2 p-2 bg-white/5 rounded-lg border border-white/5 text-left">
                                                                    {item.notes}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })()
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center text-textMuted py-8">
                                    <span className="text-4xl mb-2">👈</span>
                                    <p className="text-sm">Seleziona un partner dall'elenco a sinistra per visualizzare la cronologia dei rapporti.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
