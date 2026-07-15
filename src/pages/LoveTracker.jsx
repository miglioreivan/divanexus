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
    const [type, setType] = useState('sesso'); // 'sesso', 'preliminari_ricevuti', 'preliminari_praticati'
    const [location, setLocation] = useState('');
    const [partner, setPartner] = useState('');
    const [protection, setProtection] = useState('Nessuna');
    const [orgasm, setOrgasm] = useState(false);
    const [toys, setToys] = useState(false);
    const [time, setTime] = useState('');
    const [rating, setRating] = useState(5);
    const [masturbationDone, setMasturbationDone] = useState(false);
    const [oralDone, setOralDone] = useState(false);
    const [otherDone, setOtherDone] = useState(false);
    const [editingIndex, setEditingIndex] = useState(null);

    // Tab States
    const [statsTab, setStatsTab] = useState('generali'); // 'generali', 'sesso', 'preliminari_ricevuti', 'preliminari_praticati'
    const [rankingTab, setRankingTab] = useState('congiunta'); // 'congiunta', 'sesso', 'preliminari_ricevuti', 'preliminari_praticati'

    // Body Count Modal State
    const [isBodyCountModalOpen, setIsBodyCountModalOpen] = useState(false);
    const [selectedPartnerName, setSelectedPartnerName] = useState(null);

    const navigate = useNavigate();
    const fileInputRef = useRef(null);

    // Ensure all entries have a unique id (for backward compat with pre-id data)
    const normalizeData = (rawData) => {
        const normalized = {};
        Object.entries(rawData).forEach(([dateKey, entries]) => {
            normalized[dateKey] = entries.map(e => e.id ? e : { ...e, id: crypto.randomUUID() });
        });
        return normalized;
    };

    useEffect(() => {
        if (!user) return;
        const docRef = doc(db, "users", user.uid, "loveTracker", "main");
        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                setDataStore(normalizeData(docSnap.data().data || {}));
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

    const saveToCloud = async (newData) => {
        if (!user) return;
        await setDoc(doc(db, "users", user.uid, "loveTracker", "main"), { data: newData, lastUpdate: new Date() }, { merge: true });
    };

    const handleSaveEntry = async (e) => {
        e.preventDefault();
        const doneToPartner = {
            masturbation: type !== 'sesso' ? masturbationDone : false,
            oral: type !== 'sesso' ? oralDone : false,
            other: type !== 'sesso' ? otherDone : false
        };
        const newData = { ...dataStore };
        if (!newData[selectedDateKey]) newData[selectedDateKey] = [];

        if (editingIndex !== null) {
            const existingEntry = newData[selectedDateKey][editingIndex];
            const obj = {
                id: existingEntry?.id || crypto.randomUUID(),
                type,
                location: location.trim(),
                partner: partner.trim(),
                protection,
                orgasm,
                toys,
                time: time || '',
                rating: rating !== null ? Number(rating) : null,
                doneToPartner: type !== 'sesso' ? doneToPartner : null
            };
            newData[selectedDateKey][editingIndex] = obj;
        } else {
            const obj = {
                id: crypto.randomUUID(),
                type,
                location: location.trim(),
                partner: partner.trim(),
                protection,
                orgasm,
                toys,
                time: time || '',
                rating: rating !== null ? Number(rating) : null,
                doneToPartner: type !== 'sesso' ? doneToPartner : null
            };
            newData[selectedDateKey].push(obj);
        }

        setDataStore(newData); // Optimistic update
        await saveToCloud(newData);

        // Reset form
        resetForm();
    };

    const resetForm = () => {
        setType('sesso');
        setLocation('');
        setPartner('');
        setProtection('Nessuna');
        setOrgasm(false);
        setToys(false);
        setTime('');
        setRating(5);
        setMasturbationDone(false);
        setOralDone(false);
        setOtherDone(false);
        setEditingIndex(null);
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
        if (editingIndex === index) resetForm();
    };

    const handleEditEntry = (index, entry) => {
        setEditingIndex(index);
        setType(entry.type || 'sesso');
        setLocation(entry.location || '');
        setPartner(entry.partner || '');
        setProtection(entry.protection || 'Nessuna');
        setOrgasm(entry.orgasm || false);
        setToys(entry.toys || false);
        setTime(entry.time || '');
        setRating(entry.rating !== undefined ? entry.rating : 5);
        
        const done = entry.doneToPartner || {};
        setMasturbationDone(done.masturbation || false);
        setOralDone(done.oral || false);
        setOtherDone(done.other || false);
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
        let totalSesso = 0;
        let orgasmSesso = 0;
        const partnersSesso = new Set();

        let totalPrelimRicevuti = 0;
        let orgasmPrelimRicevuti = 0;
        const partnersPrelimRicevuti = new Set();

        let totalPrelimPraticati = 0;
        let orgasmPrelimPraticati = 0;
        const partnersPrelimPraticati = new Set();

        const partnersTotal = new Set();

        Object.values(dataStore).forEach(arr => {
            arr.forEach(e => {
                const partnerTrimmed = e.partner && e.partner.trim().toLowerCase();

                if (partnerTrimmed) {
                    partnersTotal.add(partnerTrimmed);
                }

                if (e.type === 'sesso') {
                    totalSesso++;
                    if (e.orgasm) orgasmSesso++;
                    if (partnerTrimmed) partnersSesso.add(partnerTrimmed);
                } else if (e.type === 'preliminari_ricevuti') {
                    totalPrelimRicevuti++;
                    if (e.orgasm) orgasmPrelimRicevuti++;
                    if (partnerTrimmed) partnersPrelimRicevuti.add(partnerTrimmed);
                } else if (e.type === 'preliminari_praticati') {
                    totalPrelimPraticati++;
                    if (e.orgasm) orgasmPrelimPraticati++;
                    if (partnerTrimmed) partnersPrelimPraticati.add(partnerTrimmed);
                }
            });
        });

        return {
            totalSesso,
            rateSesso: totalSesso === 0 ? '0%' : Math.round((orgasmSesso / totalSesso) * 100) + '%',
            bodyCountSesso: partnersSesso.size,

            totalPrelimRicevuti,
            ratePrelimRicevuti: totalPrelimRicevuti === 0 ? '0%' : Math.round((orgasmPrelimRicevuti / totalPrelimRicevuti) * 100) + '%',
            bodyCountPrelimRicevuti: partnersPrelimRicevuti.size,

            totalPrelimPraticati,
            ratePrelimPraticati: totalPrelimPraticati === 0 ? '0%' : Math.round((orgasmPrelimPraticati / totalPrelimPraticati) * 100) + '%',
            bodyCountPrelimPraticati: partnersPrelimPraticati.size,

            total: totalSesso + totalPrelimRicevuti + totalPrelimPraticati,
            bodyCount: partnersTotal.size,
            streak: calculateStreak()
        };
    };

    const stats = useMemo(() => getStats(), [dataStore]);

    const getRankings = () => {
        const list = [];
        Object.entries(dataStore).forEach(([dateKey, arr]) => {
            arr.forEach((e, index) => {
                if (e.rating) {
                    list.push({
                        ...e,
                        date: dateKey,
                        entryIndex: index
                    });
                }
            });
        });

        // Sort by rating descending, then by date descending
        list.sort((a, b) => {
            if (b.rating !== a.rating) {
                return b.rating - a.rating;
            }
            if (a.date === 'senza_data' && b.date === 'senza_data') return 0;
            if (a.date === 'senza_data') return 1;
            if (b.date === 'senza_data') return -1;
            return new Date(b.date) - new Date(a.date);
        });

        const sessoRanking = list.filter(e => e.type === 'sesso');
        const prelimRicevutiRanking = list.filter(e => e.type === 'preliminari_ricevuti');
        const prelimPraticatiRanking = list.filter(e => e.type === 'preliminari_praticati');

        return {
            congiunta: list,
            sesso: sessoRanking,
            preliminari_ricevuti: prelimRicevutiRanking,
            preliminari_praticati: prelimPraticatiRanking
        };
    };

    const rankings = useMemo(() => getRankings(), [dataStore]);

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
        
        const hasSesso = entries.some(e => e.type === 'sesso' || !e.type);
        const hasPrelimRicevuti = entries.some(e => e.type === 'preliminari_ricevuti');
        const hasPrelimPraticati = entries.some(e => e.type === 'preliminari_praticati');
        
        let symbol = '♥';
        let symbolColor = 'text-accent';
        let cellBorder = active ? 'border-accent/30 bg-white/10' : 'border-transparent bg-white/5 hover:bg-white/10';
        
        if (active) {
            if (hasSesso) {
                symbol = '♥';
                symbolColor = 'text-accent';
                cellBorder = 'border-accent/30 bg-white/10';
            } else if (hasPrelimRicevuti) {
                symbol = '💦';
                symbolColor = 'text-blue-400';
                cellBorder = 'border-blue-500/30 bg-white/10';
            } else if (hasPrelimPraticati) {
                symbol = '⚡';
                symbolColor = 'text-orange-400';
                cellBorder = 'border-orange-500/30 bg-white/10';
            }
        }

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
                <div className="bento-card col-span-1 md:col-span-1 p-8 flex flex-col justify-between h-full min-h-[600px]">
                    <div className="flex flex-col gap-6">
                        <div>
                            <h1 className="text-3xl font-bold text-white mb-1 tracking-tight">Love<span className="text-accent">Tracker</span></h1>
                            <p className="text-textMuted text-xs font-medium uppercase tracking-widest">Diario Personale</p>
                        </div>
                        
                        {/* Stat tabs switch */}
                        <div className="grid grid-cols-2 gap-1 bg-black/25 p-1 rounded-xl border border-white/5">
                            {[
                                { id: 'generali', label: 'Generali' },
                                { id: 'sesso', label: 'Sesso' },
                                { id: 'preliminari_ricevuti', label: 'Prelim. Ricevuti' },
                                { id: 'preliminari_praticati', label: 'Prelim. Praticati' }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setStatsTab(tab.id)}
                                    className={`text-[9px] uppercase font-bold py-2 rounded-lg transition-all ${statsTab === tab.id ? 'bg-accent text-white shadow' : 'text-textMuted hover:text-white'}`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        <div className="space-y-4 text-left">
                            {statsTab === 'generali' && (
                                <>
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
                                </>
                            )}

                            {statsTab === 'sesso' && (
                                <>
                                    <div className="bg-black/20 p-5 rounded-2xl border border-white/5">
                                        <div className="flex items-center justify-between"><p className="text-xs text-textMuted uppercase font-bold tracking-wider">Totale Sesso</p><span className="text-xl">💖</span></div>
                                        <p className="text-4xl font-bold text-white mt-2">{stats.totalSesso}</p>
                                    </div>
                                    <div className="bg-black/20 p-5 rounded-2xl border border-white/5">
                                        <div className="flex items-center justify-between"><p className="text-xs text-textMuted uppercase font-bold tracking-wider">Orgasmi Sesso</p><span className="text-xl">✨</span></div>
                                        <div className="flex items-end gap-2 mt-2"><p className="text-3xl font-bold text-accent">{stats.rateSesso}</p></div>
                                    </div>
                                    <div 
                                        onClick={() => setIsBodyCountModalOpen(true)}
                                        className="bg-black/20 p-5 rounded-2xl border border-white/5 cursor-pointer hover:border-accent/40 hover:bg-white/5 transition-all"
                                    >
                                        <div className="flex items-center justify-between"><p className="text-xs text-textMuted uppercase font-bold tracking-wider">Partner Sesso</p><span className="text-xl">👥</span></div>
                                        <div className="flex items-end gap-2 mt-2"><p className="text-3xl font-bold text-rose-400">{stats.bodyCountSesso}</p><p className="text-[10px] text-textMuted mb-1 uppercase font-bold">Partner ➔</p></div>
                                    </div>
                                </>
                            )}

                            {statsTab === 'preliminari_ricevuti' && (
                                <>
                                    <div className="bg-black/20 p-5 rounded-2xl border border-white/5">
                                        <div className="flex items-center justify-between"><p className="text-xs text-textMuted uppercase font-bold tracking-wider">Totale Prelim. Ricevuti</p><span className="text-xl">💦</span></div>
                                        <p className="text-4xl font-bold text-white mt-2">{stats.totalPrelimRicevuti}</p>
                                    </div>
                                    <div className="bg-black/20 p-5 rounded-2xl border border-white/5">
                                        <div className="flex items-center justify-between"><p className="text-xs text-textMuted uppercase font-bold tracking-wider">Orgasmi Ricevuti</p><span className="text-xl">✨</span></div>
                                        <div className="flex items-end gap-2 mt-2"><p className="text-3xl font-bold text-accent">{stats.ratePrelimRicevuti}</p></div>
                                    </div>
                                    <div 
                                        onClick={() => setIsBodyCountModalOpen(true)}
                                        className="bg-black/20 p-5 rounded-2xl border border-white/5 cursor-pointer hover:border-accent/40 hover:bg-white/5 transition-all"
                                    >
                                        <div className="flex items-center justify-between"><p className="text-xs text-textMuted uppercase font-bold tracking-wider">Partner Prelim. Ricevuti</p><span className="text-xl">👥</span></div>
                                        <div className="flex items-end gap-2 mt-2"><p className="text-3xl font-bold text-blue-400">{stats.bodyCountPrelimRicevuti}</p><p className="text-[10px] text-textMuted mb-1 uppercase font-bold">Partner ➔</p></div>
                                    </div>
                                </>
                            )}

                            {statsTab === 'preliminari_praticati' && (
                                <>
                                    <div className="bg-black/20 p-5 rounded-2xl border border-white/5">
                                        <div className="flex items-center justify-between"><p className="text-xs text-textMuted uppercase font-bold tracking-wider">Totale Prelim. Praticati</p><span className="text-xl">🔥</span></div>
                                        <p className="text-4xl font-bold text-white mt-2">{stats.totalPrelimPraticati}</p>
                                    </div>
                                    <div className="bg-black/20 p-5 rounded-2xl border border-white/5">
                                        <div className="flex items-center justify-between"><p className="text-xs text-textMuted uppercase font-bold tracking-wider">Orgasmi Partner</p><span className="text-xl">✨</span></div>
                                        <div className="flex items-end gap-2 mt-2"><p className="text-3xl font-bold text-accent">{stats.ratePrelimPraticati}</p></div>
                                    </div>
                                    <div 
                                        onClick={() => setIsBodyCountModalOpen(true)}
                                        className="bg-black/20 p-5 rounded-2xl border border-white/5 cursor-pointer hover:border-accent/40 hover:bg-white/5 transition-all"
                                    >
                                        <div className="flex items-center justify-between"><p className="text-xs text-textMuted uppercase font-bold tracking-wider">Partner Prelim. Praticati</p><span className="text-xl">👥</span></div>
                                        <div className="flex items-end gap-2 mt-2"><p className="text-3xl font-bold text-orange-400">{stats.bodyCountPrelimPraticati}</p><p className="text-[10px] text-textMuted mb-1 uppercase font-bold">Partner ➔</p></div>
                                    </div>
                                </>
                            )}
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

                {/* Classifica Esperienze */}
                <div className="col-span-1 md:col-span-3 bento-card p-8 flex flex-col gap-6 max-w-full overflow-x-hidden">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/5 pb-4">
                        <div>
                            <h2 className="text-xl font-bold text-white tracking-tight">🏆 Classifica delle Esperienze</h2>
                            <p className="text-textMuted text-xs">Le migliori esperienze basate sulle tue valutazioni</p>
                        </div>
                        
                        {/* Tabs for Classifica */}
                        <div className="flex gap-1 bg-black/25 p-1 rounded-xl border border-white/5 self-end sm:self-auto overflow-x-auto max-w-full">
                            {[
                                { id: 'congiunta', label: 'Congiunta' },
                                { id: 'sesso', label: 'Sesso' },
                                { id: 'preliminari_ricevuti', label: 'Prelim. Ricevuti' },
                                { id: 'preliminari_praticati', label: 'Prelim. Praticati' }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setRankingTab(tab.id)}
                                    className={`flex-1 text-[9px] uppercase font-bold py-2 px-3 rounded-lg transition-all whitespace-nowrap ${rankingTab === tab.id ? 'bg-accent text-white shadow' : 'text-textMuted hover:text-white'}`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Ranking List */}
                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                        {(() => {
                            const currentRanking = rankings[rankingTab] || [];
                            if (currentRanking.length === 0) {
                                return (
                                    <p className="text-center text-xs text-textMuted py-8 text-left">Nessuna esperienza registrata in questa categoria.</p>
                                );
                            }

                            return currentRanking.map((item, index) => {
                                const isRicevuti = item.type === 'preliminari_ricevuti';
                                const isPraticati = item.type === 'preliminari_praticati';
                                
                                const formattedDate = item.date === 'senza_data'
                                    ? 'Senza Data'
                                    : new Date(item.date).toLocaleDateString('it-IT', {
                                        day: 'numeric',
                                        month: 'long',
                                        year: 'numeric'
                                    });

                                // Medals for top 3
                                let positionEmoji = '';
                                if (index === 0) positionEmoji = '🥇';
                                else if (index === 1) positionEmoji = '🥈';
                                else if (index === 2) positionEmoji = '🥉';
                                else positionEmoji = `#${index + 1}`;

                                // Determine rating icon and style
                                let ratingIcon = '❤️';
                                let ratingColor = 'text-rose-400';
                                let badgeLabel = '💖 Sesso';
                                let badgeStyle = 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
                                
                                if (isRicevuti) {
                                    ratingIcon = '💦';
                                    ratingColor = 'text-blue-400';
                                    badgeLabel = '💦 Prelim. Ricevuti';
                                    badgeStyle = 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
                                } else if (isPraticati) {
                                    ratingIcon = '🔥';
                                    ratingColor = 'text-orange-400';
                                    badgeLabel = '🔥 Prelim. Praticati';
                                    badgeStyle = 'bg-orange-500/10 text-orange-400 border border-orange-500/20';
                                }

                                // doneToPartner details
                                const details = [];
                                if (item.doneToPartner) {
                                    if (item.doneToPartner.masturbation) details.push('Masturbazione');
                                    if (item.doneToPartner.oral) details.push('Orale');
                                    if (item.doneToPartner.other) details.push('Altro');
                                }
                                const detailsText = details.length > 0 ? `(${details.join(', ')})` : '';

                                return (
                                    <div key={item.id || `${item.date}-${item.entryIndex}`} className="bg-bgApp/40 p-4 rounded-2xl border border-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 max-w-full overflow-hidden">
                                        <div className="flex items-start gap-3 min-w-0 flex-1 w-full">
                                            <span className="text-lg font-bold text-textMuted w-8 text-center flex-shrink-0 mt-0.5">
                                                {positionEmoji}
                                            </span>
                                            <div className="space-y-1 text-left min-w-0 flex-1">
                                                <div className="flex items-center gap-2 flex-wrap break-words">
                                                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${badgeStyle}`}>
                                                        {badgeLabel}
                                                    </span>
                                                    <span className="text-xs text-white/80 font-medium break-words">
                                                        Con: <span className="text-accent font-bold">{item.partner || 'Anonimo'}</span>
                                                    </span>
                                                    {detailsText && (
                                                        <span className="text-[10px] text-textMuted italic break-words w-full sm:w-auto">{detailsText}</span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-textMuted flex items-center gap-2 flex-wrap break-words">
                                                    <span>📅 {formattedDate}</span>
                                                    {item.time && <span>🕒 {item.time}</span>}
                                                    {item.location && <span>📍 {item.location}</span>}
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center gap-1.5 self-end sm:self-auto bg-white/5 px-3 py-1.5 rounded-xl border border-white/5 flex-shrink-0 max-w-full overflow-hidden">
                                            <span className={`text-xs ${ratingColor} font-bold flex-shrink-0`}>Voto:</span>
                                            <span className="tracking-wide truncate">{ratingIcon.repeat(item.rating || 5)}</span>
                                        </div>
                                    </div>
                                );
                            });
                        })()}
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
                                dataStore[selectedDateKey].map((entry, idx) => {
                                    const isRicevuti = entry.type === 'preliminari_ricevuti';
                                    const isPraticati = entry.type === 'preliminari_praticati';

                                    let badgeLabel = '💖 Sesso';
                                    let badgeStyle = 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
                                    let ratingIcon = '❤️';
                                    let ratingColor = 'text-rose-400';

                                    if (isRicevuti) {
                                        badgeLabel = '💦 Prelim. Ricevuti';
                                        badgeStyle = 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
                                        ratingIcon = '💦';
                                        ratingColor = 'text-blue-400';
                                    } else if (isPraticati) {
                                        badgeLabel = '🔥 Prelim. Praticati';
                                        badgeStyle = 'bg-orange-500/10 text-orange-400 border border-orange-500/20';
                                        ratingIcon = '🔥';
                                        ratingColor = 'text-orange-400';
                                    }

                                    // doneToPartner details
                                    const details = [];
                                    if (entry.doneToPartner) {
                                        if (entry.doneToPartner.masturbation) details.push('Masturbazione');
                                        if (entry.doneToPartner.oral) details.push('Orale');
                                        if (entry.doneToPartner.other) details.push('Altro');
                                    }

                                    return (
                                        <div key={idx} className="bg-bgApp p-4 rounded-xl border border-white/5 flex justify-between items-start">
                                            <div className="space-y-1 text-left">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeStyle}`}>
                                                        {badgeLabel}
                                                    </span>
                                                    {entry.time && (
                                                        <span className="text-[10px] font-medium text-textMuted bg-white/5 px-2 py-0.5 rounded-full">
                                                            🕒 {entry.time}
                                                        </span>
                                                    )}
                                                </div>
                                                
                                                <div className="text-sm font-bold text-white pt-1">
                                                    {entry.location ? `📍 ${entry.location}` : '📍 Luogo non specificato'}
                                                </div>
                                                
                                                {entry.partner && (
                                                    <div className="text-xs text-white/80 font-medium">
                                                        Con: <span className="text-accent">{entry.partner}</span>
                                                    </div>
                                                )}
                                                
                                                {details.length > 0 && (
                                                    <div className="text-xs text-textMuted font-medium">
                                                        Dettagli: <span className="text-textMain">{details.join(', ')}</span>
                                                    </div>
                                                )}
                                                
                                                <div className="flex items-center gap-3 text-xs text-textMuted pt-0.5 flex-wrap">
                                                    <span>🛡️ {entry.protection || 'Nessuna'}</span>
                                                    {entry.orgasm && <span className="text-yellow-500">✨ Orgasmo</span>}
                                                    {entry.toys && <span className="text-purple-400">🧸 Toys</span>}
                                                </div>

                                                <div className={`text-xs ${ratingColor} font-bold flex items-center gap-1 pt-1`}>
                                                    <span>Voto:</span>
                                                    <span className="tracking-wide">
                                                        {entry.rating ? ratingIcon.repeat(entry.rating) : 'N.D.'}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <button onClick={() => handleEditEntry(idx, entry)} className="text-textMuted hover:text-accent p-1 text-sm transition-colors">✎</button>
                                                <button onClick={() => handleDeleteEntry(idx)} className="text-textMuted hover:text-red-500 p-1 text-sm transition-colors">✕</button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* New Entry Form */}
                        <div className="bg-cardDark p-5 rounded-2xl border border-white/5">
                            <h4 className="text-xs font-bold text-textMuted uppercase tracking-wider mb-4">{editingIndex !== null ? 'Modifica Attività' : 'Nuova Attività'}</h4>
                            <form onSubmit={handleSaveEntry} className="space-y-4">
                                {/* Activity Type Selector */}
                                <div>
                                    <label className="input-label">Tipo Attività</label>
                                    <div className="flex gap-2 flex-wrap">
                                        <button
                                            type="button"
                                            onClick={() => setType('sesso')}
                                            className={`flex-1 min-w-[90px] py-2.5 text-xs font-bold rounded-xl transition-all border ${type === 'sesso' ? 'bg-accent text-white border-accent shadow-lg' : 'bg-bgApp text-textMuted border-white/10 hover:text-white'}`}
                                        >
                                            💖 Sesso
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setType('preliminari_ricevuti')}
                                            className={`flex-1 min-w-[90px] py-2.5 text-xs font-bold rounded-xl transition-all border ${type === 'preliminari_ricevuti' ? 'bg-accent text-white border-accent shadow-lg' : 'bg-bgApp text-textMuted border-white/10 hover:text-white'}`}
                                        >
                                            💦 Prelim. Ric.
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setType('preliminari_praticati')}
                                            className={`flex-1 min-w-[90px] py-2.5 text-xs font-bold rounded-xl transition-all border ${type === 'preliminari_praticati' ? 'bg-accent text-white border-accent shadow-lg' : 'bg-bgApp text-textMuted border-white/10 hover:text-white'}`}
                                        >
                                            🔥 Prelim. Prat.
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="input-label">Amore con</label>
                                        <input 
                                            type="text" 
                                            value={partner} 
                                            onChange={(e) => setPartner(e.target.value)} 
                                            placeholder="Nome partner..." 
                                            required={type !== 'sesso'} 
                                            className="input-field" 
                                        />
                                    </div>
                                    <div>
                                        <label className="input-label">Luogo</label>
                                        <input 
                                            type="text" 
                                            value={location} 
                                            onChange={(e) => setLocation(e.target.value)} 
                                            placeholder={type !== 'sesso' ? "Es. Letto (facoltativo)" : "Es. Letto"} 
                                            required={type === 'sesso'} 
                                            className="input-field" 
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
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
                                    <div>
                                        <label className="input-label">Ora (Quando)</label>
                                        <input 
                                            type="time" 
                                            value={time} 
                                            onChange={(e) => setTime(e.target.value)} 
                                            className="input-field" 
                                        />
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

                                {/* Details check for preliminari */}
                                {type !== 'sesso' && (
                                    <div className="space-y-3 bg-bgApp/40 p-4 rounded-xl border border-white/5">
                                        <label className="input-label mb-2">Cosa è stato {type === 'preliminari_ricevuti' ? 'ricevuto' : 'praticato'}?</label>
                                        <div className="grid grid-cols-3 gap-2">
                                            <button 
                                                type="button"
                                                onClick={() => setMasturbationDone(!masturbationDone)}
                                                className={`p-2 rounded-xl border text-center text-xs cursor-pointer transition-all ${masturbationDone ? 'border-accent bg-accent/10 text-white font-semibold shadow-lg' : 'border-white/10 text-textMuted hover:border-white/20'}`}
                                            >
                                                Masturb.
                                            </button>
                                            <button 
                                                type="button"
                                                onClick={() => setOralDone(!oralDone)}
                                                className={`p-2 rounded-xl border text-center text-xs cursor-pointer transition-all ${oralDone ? 'border-accent bg-accent/10 text-white font-semibold shadow-lg' : 'border-white/10 text-textMuted hover:border-white/20'}`}
                                            >
                                                Orale
                                            </button>
                                            <button 
                                                type="button"
                                                onClick={() => setOtherDone(!otherDone)}
                                                className={`p-2 rounded-xl border text-center text-xs cursor-pointer transition-all ${otherDone ? 'border-accent bg-accent/10 text-white font-semibold shadow-lg' : 'border-white/10 text-textMuted hover:border-white/20'}`}
                                            >
                                                Altro
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Rating Selector */}
                                <div className="space-y-3 bg-bgApp/40 p-4 rounded-xl border border-white/5">
                                    <div className="flex flex-col items-center justify-center">
                                        <label className="input-label self-start mb-2">Votazione Esperienza</label>
                                        <div className="flex gap-2 items-center flex-wrap">
                                            {[1, 2, 3, 4, 5].map((val) => {
                                                let icon = '❤️';
                                                let hoverBg = 'bg-rose-500/15';
                                                if (type === 'preliminari_ricevuti') {
                                                    icon = '💦';
                                                    hoverBg = 'bg-blue-500/15';
                                                } else if (type === 'preliminari_praticati') {
                                                    icon = '🔥';
                                                    hoverBg = 'bg-orange-500/15';
                                                }
                                                return (
                                                    <button
                                                        key={val}
                                                        type="button"
                                                        onClick={() => setRating(val)}
                                                        className={`w-10 h-10 flex items-center justify-center rounded-xl border transition-all text-lg ${rating !== null && rating >= val ? `border-accent ${hoverBg}` : 'border-white/10 hover:border-white/20'}`}
                                                    >
                                                        {icon}
                                                    </button>
                                                );
                                            })}
                                            <button
                                                type="button"
                                                onClick={() => setRating(null)}
                                                className={`px-3.5 h-10 flex items-center justify-center rounded-xl border transition-all text-xs font-bold ${rating === null ? 'border-accent bg-accent/15 text-white shadow-lg' : 'border-white/10 text-textMuted hover:border-white/20 hover:text-white'}`}
                                            >
                                                N.D.
                                            </button>
                                        </div>
                                        <span className="text-[10px] text-textMuted mt-2 font-bold uppercase tracking-wider">
                                            Punteggio: {rating !== null ? `${rating} / 5` : 'Non Definito (N.D.)'}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    {editingIndex !== null && (
                                        <button type="button" onClick={resetForm} className="w-1/3 btn-secondary text-sm py-4">Annulla</button>
                                    )}
                                    <button type="submit" className="flex-1 btn-primary text-sm py-4">{editingIndex !== null ? 'Aggiorna' : 'Salva'}</button>
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
                                                    const isRicevuti = item.type === 'preliminari_ricevuti';
                                                    const isPraticati = item.type === 'preliminari_praticati';

                                                    let badgeLabel = '💖 Sesso';
                                                    let badgeStyle = 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
                                                    let ratingIcon = '❤️';

                                                    if (isRicevuti) {
                                                        badgeLabel = '💦 Prelim. Ricevuti';
                                                        badgeStyle = 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
                                                        ratingIcon = '💦';
                                                    } else if (isPraticati) {
                                                        badgeLabel = '🔥 Prelim. Praticati';
                                                        badgeStyle = 'bg-orange-500/10 text-orange-400 border border-orange-500/20';
                                                        ratingIcon = '🔥';
                                                    }

                                                    const formattedDate = item.date === 'senza_data'
                                                        ? 'Senza Data'
                                                        : new Date(item.date).toLocaleDateString('it-IT', {
                                                            day: 'numeric',
                                                            month: 'long',
                                                            year: 'numeric'
                                                        });

                                                    const details = [];
                                                    if (item.doneToPartner) {
                                                        if (item.doneToPartner.masturbation) details.push('Masturbazione');
                                                        if (item.doneToPartner.oral) details.push('Orale');
                                                        if (item.doneToPartner.other) details.push('Altro');
                                                    }

                                                    return (
                                                        <div key={item.id || index} className="bg-cardDark/50 p-4 rounded-xl border border-white/5 space-y-2">
                                                            <div className="flex justify-between items-start gap-2 flex-wrap">
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${badgeStyle}`}>
                                                                        {badgeLabel}
                                                                    </span>
                                                                    <span className="text-xs text-textMuted font-medium">
                                                                        📅 {formattedDate}
                                                                    </span>
                                                                    {item.time && (
                                                                        <span className="text-[10px] font-medium text-textMuted bg-white/5 px-2 py-0.5 rounded-full">
                                                                            🕒 {item.time}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <span className="text-xs tracking-wide font-bold">
                                                                    {item.rating ? ratingIcon.repeat(item.rating) : 'Voto: N.D.'}
                                                                </span>
                                                            </div>

                                                            <div className="text-sm font-bold text-white">
                                                                📍 {item.location || 'Luogo non specificato'}
                                                            </div>

                                                            {details.length > 0 && (
                                                                <div className="text-xs text-textMuted font-medium">
                                                                    Dettagli: <span className="text-white">{details.join(', ')}</span>
                                                                </div>
                                                            )}

                                                            <div className="flex items-center gap-3 text-xs text-textMuted border-t border-white/5 pt-2 flex-wrap">
                                                                <span>🛡️ Protezione: {item.protection || 'Nessuna'}</span>
                                                                {item.orgasm && <span className="text-yellow-500">✨ Orgasmo</span>}
                                                                {item.toys && <span className="text-purple-400">🧸 Toys</span>}
                                                            </div>
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
