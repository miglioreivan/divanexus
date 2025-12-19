import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db, auth } from '../firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { signOut, onAuthStateChanged } from 'firebase/auth';

const pageStyle = {
    '--color-accent': '#f59e0b', // Amber-500
    '--color-accent-hover': '#d97706', // Amber-600
    backgroundColor: '#09090b',
    backgroundImage: `
        radial-gradient(at 0% 0%, rgba(245, 158, 11, 0.15) 0px, transparent 50%),
        radial-gradient(at 100% 100%, rgba(16, 185, 129, 0.1) 0px, transparent 50%)
    `,
    fontFamily: '"Inter", sans-serif'
};

export default function CarFinance() {
    const navigate = useNavigate();
    const user = auth.currentUser;

    const [tolls, setTolls] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [vehicles, setVehicles] = useState([]);
    const [trips, setTrips] = useState([]); // From DriveLogbook for linking

    // Modal States
    const [isTollModalOpen, setIsTollModalOpen] = useState(false);
    const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
    const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);

    // Forms
    const [tollEntry, setTollEntry] = useState('');
    const [tollExit, setTollExit] = useState('');
    const [tollCost, setTollCost] = useState('');
    const [tollTripId, setTollTripId] = useState('');
    const [tollDate, setTollDate] = useState(new Date().toISOString().split('T')[0]);
    const [tollVehicle, setTollVehicle] = useState('');

    const [expType, setExpType] = useState('fuel');
    const [expCost, setExpCost] = useState('');
    const [expDate, setExpDate] = useState(new Date().toISOString().split('T')[0]);
    const [expNotes, setExpNotes] = useState('');
    const [expVehicle, setExpVehicle] = useState('');

    const [newVehModel, setNewVehModel] = useState('');
    const [newVehPlate, setNewVehPlate] = useState('');
    const [newVehVin, setNewVehVin] = useState('');

    // Loading State
    const [loading, setLoading] = useState(true);

    // Edit States
    const [editingTollId, setEditingTollId] = useState(null);
    const [editingExpenseId, setEditingExpenseId] = useState(null);
    const [editingVehicleId, setEditingVehicleId] = useState(null);

    // Filter States
    const [filterTollLoc, setFilterTollLoc] = useState('');
    const [filterTollPrice, setFilterTollPrice] = useState('');
    const [filterExpType, setFilterExpType] = useState('');

    useEffect(() => {
        let unsub = () => { };
        let unsubTrips = () => { };

        const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
            if (currentUser) {
                // Load Car Finance Data
                const financeRef = doc(db, "users", currentUser.uid, "car_finance", "main");
                unsub = onSnapshot(financeRef, (docSnap) => {
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        setTolls(data.tolls || []);
                        setExpenses(data.expenses || []);
                        setVehicles(data.vehicles || []);
                    } else {
                        setTolls([]);
                        setExpenses([]);
                        setVehicles([]);
                    }
                    setLoading(false);
                });

                // Load Trips for linking
                const tripsRef = doc(db, "users", currentUser.uid, "drive_logbook", "main");
                unsubTrips = onSnapshot(tripsRef, (docSnap) => {
                    if (docSnap.exists()) {
                        setTrips(docSnap.data().trips || []);
                    }
                });
            } else {
                setLoading(false);
                navigate('/');
            }
        });

        return () => {
            unsubAuth();
            unsub();
            unsubTrips();
        };
    }, [navigate]);

    const saveToCloud = async (newTolls, newExpenses, newVehicles) => {
        if (!user) return;
        try {
            await setDoc(doc(db, "users", user.uid, "car_finance", "main"), {
                tolls: newTolls !== undefined ? newTolls : tolls,
                expenses: newExpenses !== undefined ? newExpenses : expenses,
                vehicles: newVehicles !== undefined ? newVehicles : vehicles
            }, { merge: true });
        } catch (e) { console.error("Save error:", e); }
    };

    // --- Helpers ---
    const handleExport = () => {
        const data = { tolls, expenses, vehicles };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `car_finance_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImport = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const imported = JSON.parse(event.target.result);
                if (confirm("Importare i dati? Questo unirà i dati esistenti con quelli nuovi.")) {
                    const newTolls = [...tolls, ...(imported.tolls || [])];
                    const newExp = [...expenses, ...(imported.expenses || [])];
                    const newVeh = [...vehicles, ...(imported.vehicles || [])];

                    // Simple Dedup by ID
                    const uniqueTolls = Array.from(new Map(newTolls.map(item => [item.id, item])).values());
                    const uniqueExp = Array.from(new Map(newExp.map(item => [item.id, item])).values());
                    const uniqueVeh = Array.from(new Map(newVeh.map(item => [item.id, item])).values());

                    setTolls(uniqueTolls);
                    setExpenses(uniqueExp);
                    setVehicles(uniqueVeh);
                    await saveToCloud(uniqueTolls, uniqueExp, uniqueVeh);
                    alert("Importazione completata!");
                }
            } catch (err) {
                alert("Errore importazione file.");
                console.error(err);
            }
        };
        reader.readAsText(file);
    };

    // --- Filtering ---
    const getFilteredTolls = () => {
        return tolls.filter(t => {
            const matchLoc = !filterTollLoc ||
                t.entry.toLowerCase().includes(filterTollLoc.toLowerCase()) ||
                t.exit.toLowerCase().includes(filterTollLoc.toLowerCase());
            const matchPrice = !filterTollPrice || t.cost <= parseFloat(filterTollPrice);
            return matchLoc && matchPrice;
        });
    };

    const getFilteredExpenses = () => {
        return expenses.filter(e => !filterExpType || e.type === filterExpType);
    };


    // --- Actions ---

    const addVehicle = (e) => {
        e.preventDefault();
        let updatedVehicles;
        if (editingVehicleId) {
            updatedVehicles = vehicles.map(v => v.id === editingVehicleId ? { ...v, model: newVehModel, plate: newVehPlate, vin: newVehVin } : v);
        } else {
            const newVehicle = {
                id: Date.now(),
                model: newVehModel,
                plate: newVehPlate,
                vin: newVehVin
            };
            updatedVehicles = [...vehicles, newVehicle];
        }
        setVehicles(updatedVehicles);
        saveToCloud(undefined, undefined, updatedVehicles);
        setIsVehicleModalOpen(false);
        resetVehicleForm();
    };

    const openEditVehicle = (v) => {
        setEditingVehicleId(v.id);
        setNewVehModel(v.model);
        setNewVehPlate(v.plate);
        setNewVehVin(v.vin || '');
        setIsVehicleModalOpen(true);
    };

    const resetVehicleForm = () => {
        setEditingVehicleId(null);
        setNewVehModel(''); setNewVehPlate(''); setNewVehVin('');
    };

    const deleteVehicle = (id) => {
        if (confirm("Eliminare veicolo?")) {
            const updated = vehicles.filter(v => v.id !== id);
            setVehicles(updated);
            saveToCloud(undefined, undefined, updated);
        }
    };

    const addToll = (e) => {
        e.preventDefault();
        const tollData = {
            entry: tollEntry,
            exit: tollExit,
            cost: parseFloat(tollCost),
            date: tollDate,
            tripId: tollTripId || null,
            vehicleId: tollVehicle || null
        };

        let updatedTolls;
        if (editingTollId) {
            updatedTolls = tolls.map(t => t.id === editingTollId ? { ...t, ...tollData } : t);
        } else {
            updatedTolls = [{ id: Date.now(), ...tollData }, ...tolls];
        }

        setTolls(updatedTolls);
        saveToCloud(updatedTolls, undefined, undefined);
        setIsTollModalOpen(false);
        resetTollForm();
    };

    const openEditToll = (t) => {
        setEditingTollId(t.id);
        setTollEntry(t.entry);
        setTollExit(t.exit);
        setTollCost(t.cost);
        setTollDate(t.date);
        setTollVehicle(t.vehicleId || '');
        setTollTripId(t.tripId || '');
        setIsTollModalOpen(true);
    };

    const deleteToll = (id) => {
        if (confirm("Eliminare questo pedaggio?")) {
            const updated = tolls.filter(t => t.id !== id);
            setTolls(updated);
            saveToCloud(updated, undefined, undefined);
        }
    };

    const addExpense = (e) => {
        e.preventDefault();
        const expData = {
            type: expType,
            cost: parseFloat(expCost),
            date: expDate,
            notes: expNotes,
            vehicleId: expVehicle || null
        };

        let updatedExp;
        if (editingExpenseId) {
            updatedExp = expenses.map(e => e.id === editingExpenseId ? { ...e, ...expData } : e);
        } else {
            updatedExp = [{ id: Date.now(), ...expData }, ...expenses];
        }

        setExpenses(updatedExp);
        saveToCloud(undefined, updatedExp, undefined);
        setIsExpenseModalOpen(false);
        resetExpForm();
    };

    const openEditExpense = (e) => {
        setEditingExpenseId(e.id);
        setExpType(e.type);
        setExpCost(e.cost);
        setExpDate(e.date);
        setExpNotes(e.notes || '');
        setExpVehicle(e.vehicleId || '');
        setIsExpenseModalOpen(true);
    };

    const deleteExpense = (id) => {
        if (confirm("Eliminare questa spesa?")) {
            const updated = expenses.filter(e => e.id !== id);
            setExpenses(updated);
            saveToCloud(undefined, updated, undefined);
        }
    };

    const resetTollForm = () => {
        setEditingTollId(null);
        setTollEntry(''); setTollExit(''); setTollCost(''); setTollTripId(''); setTollDate(new Date().toISOString().split('T')[0]);
        setTollVehicle(vehicles.length > 0 ? vehicles[0].id : '');
    };

    const resetExpForm = () => {
        setEditingExpenseId(null);
        setExpType('fuel'); setExpCost(''); setExpNotes(''); setExpDate(new Date().toISOString().split('T')[0]);
        setExpVehicle(vehicles.length > 0 ? vehicles[0].id : '');
    };

    // --- Stats ---
    const getTotalCost = () => {
        const t = tolls.reduce((sum, item) => sum + (item.cost || 0), 0);
        const e = expenses.reduce((sum, item) => sum + (item.cost || 0), 0);
        return (t + e).toFixed(2);
    };

    if (loading) return null;

    return (
        <div className="min-h-screen p-4 md:p-8 flex flex-col items-center" style={pageStyle}>
            <div className="w-full max-w-5xl flex flex-col items-center pt-8 md:pt-0">

                {/* Header */}
                <div className="fixed top-6 right-6 z-50 flex gap-2">
                    <button onClick={handleExport} className="flex items-center gap-2 bg-[#18181b] hover:bg-[#27272a] border border-white/5 text-textMuted hover:text-white px-4 py-2 rounded-full text-xs font-semibold transition-all shadow-lg">
                        ⬇️ Export
                    </button>
                    <label className="flex items-center gap-2 bg-[#18181b] hover:bg-[#27272a] border border-white/5 text-textMuted hover:text-white px-4 py-2 rounded-full text-xs font-semibold transition-all shadow-lg cursor-pointer">
                        ⬆️ Import
                        <input type="file" accept=".json" onChange={handleImport} className="hidden" />
                    </label>
                    <div className="w-px h-6 bg-white/10 mx-1"></div>
                    <Link to="/app" className="flex items-center gap-2 bg-[#18181b] hover:bg-[#27272a] border border-white/5 text-textMuted hover:text-white px-4 py-2 rounded-full text-xs font-semibold transition-all no-underline shadow-lg">
                        🏠 Home
                    </Link>
                    <button onClick={() => signOut(auth).then(() => navigate('/'))} className="flex items-center gap-2 bg-[#18181b] hover:bg-red-500/10 border border-white/5 text-textMuted hover:text-red-400 px-4 py-2 rounded-full text-xs font-semibold transition-all shadow-lg">
                        Esci
                    </button>
                </div>

                <div className="w-full mb-8">
                    <h1 className="text-3xl font-bold text-white tracking-tight">Car<span className="text-accent">Finance</span></h1>
                    <p className="text-textMuted text-xs font-medium uppercase tracking-widest">Spese & Pedaggi</p>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mb-8">
                    <div className="bento-card p-6 flex flex-col items-center justify-center bg-accent/10 border-accent/20">
                        <span className="text-[10px] text-textMuted uppercase font-bold">Totale Spese</span>
                        <span className="text-3xl font-bold text-accent mt-1">€ {getTotalCost()}</span>
                    </div>
                    <div className="bento-card p-6 flex flex-col items-center justify-center">
                        <span className="text-[10px] text-textMuted uppercase font-bold">Pedaggi</span>
                        <span className="text-2xl font-bold text-white mt-1">€ {tolls.reduce((s, t) => s + t.cost, 0).toFixed(2)}</span>
                    </div>
                    <div className="bento-card p-6 flex flex-col items-center justify-center">
                        <span className="text-[10px] text-textMuted uppercase font-bold">Altro</span>
                        <span className="text-2xl font-bold text-white mt-1">€ {expenses.reduce((s, e) => s + e.cost, 0).toFixed(2)}</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 w-full">

                    {/* TOLLS SECTION */}
                    <div className="bento-card p-6 min-h-[400px]">
                        <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-4">
                            <h2 className="text-xl font-bold text-white">🛣️ Pedaggi</h2>
                            <button onClick={() => { resetTollForm(); setIsTollModalOpen(true); }} className="btn-primary px-4 py-2 text-xs">＋ Aggiungi</button>
                        </div>

                        {/* Filters */}
                        <div className="flex gap-2 mb-4">
                            <input type="text" placeholder="Filtra Luogo..." value={filterTollLoc} onChange={e => setFilterTollLoc(e.target.value)} className="input-field text-xs py-2" />
                            <input type="number" placeholder="Max €" value={filterTollPrice} onChange={e => setFilterTollPrice(e.target.value)} className="input-field text-xs py-2 w-24" />
                        </div>

                        <div className="space-y-3 overflow-y-auto max-h-[500px] pr-2 custom-scrollbar">
                            {getFilteredTolls().length === 0 && <p className="text-textMuted text-sm italic text-center py-4">Nessun pedaggio trovato.</p>}
                            {getFilteredTolls().map(t => {
                                const linkedTrip = trips.find(tr => tr.docId === t.tripId);
                                const linkedVehicle = vehicles.find(v => v.id == t.vehicleId);
                                return (
                                    <div key={t.id} className="bg-white/5 p-4 rounded-xl border border-white/5 flex justify-between items-start group hover:border-accent/30 transition-colors">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-white font-bold text-sm">{t.entry} ➝ {t.exit}</span>
                                            </div>
                                            <div className="text-xs text-textMuted flex flex-col gap-1">
                                                <span>📅 {new Date(t.date).toLocaleDateString()}</span>
                                                {linkedTrip && <span className="text-accent">🔗 {linkedTrip.startLoc} - {linkedTrip.endLoc}</span>}
                                                {linkedVehicle ? <span className="text-accent/80">🚗 {linkedVehicle.model}</span> : <span className="text-white/30">🚗 Altro/Nessuno</span>}
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                            <span className="text-accent font-bold">€ {t.cost.toFixed(2)}</span>
                                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => openEditToll(t)} className="text-[10px] text-textMuted hover:text-white">✏️</button>
                                                <button onClick={() => deleteToll(t.id)} className="text-[10px] text-textMuted hover:text-red-400">🗑️</button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* EXPENSES SECTION */}
                    <div className="bento-card p-6 min-h-[400px]">
                        <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-4">
                            <h2 className="text-xl font-bold text-white">🔧 Spese Auto</h2>
                            <button onClick={() => { resetExpForm(); setIsExpenseModalOpen(true); }} className="btn-primary px-4 py-2 text-xs">＋ Aggiungi</button>
                        </div>

                        {/* Filters */}
                        <div className="flex gap-2 mb-4">
                            <select value={filterExpType} onChange={e => setFilterExpType(e.target.value)} className="input-field text-xs py-2">
                                <option value="">Tutti i Tipi</option>
                                <option value="fuel">Carburante</option>
                                <option value="revisione">Revisione</option>
                                <option value="assicurazione">Assicurazione</option>
                                <option value="tagliando">Tagliando</option>
                                <option value="extra">Extra</option>
                            </select>
                        </div>

                        <div className="space-y-3 overflow-y-auto max-h-[500px] pr-2 custom-scrollbar">
                            {getFilteredExpenses().length === 0 && <p className="text-textMuted text-sm italic text-center py-4">Nessuna spesa trovata.</p>}
                            {getFilteredExpenses().map(e => {
                                const linkedVehicle = vehicles.find(v => v.id == e.vehicleId);
                                return (
                                    <div key={e.id} className="bg-white/5 p-4 rounded-xl border border-white/5 flex justify-between items-start group hover:border-accent/30 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-xl border border-white/5 text-accent">
                                                {e.type === 'fuel' ? '⛽' : e.type === 'revisione' ? '📋' : e.type === 'assicurazione' ? '📄' : e.type === 'tagliando' ? '🔧' : '💸'}
                                            </div>
                                            <div>
                                                <p className="text-white font-bold text-sm capitalize">{e.type}</p>
                                                <p className="text-xs text-textMuted">{new Date(e.date).toLocaleDateString()} {e.notes && `• ${e.notes}`}</p>
                                                {linkedVehicle ? <p className="text-[10px] text-accent/80 mt-0.5">🚗 {linkedVehicle.model}</p> : <p className="text-[10px] text-white/30 mt-0.5">🚗 Altro/Nessuno</p>}
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                            <span className="text-white font-bold">€ {e.cost.toFixed(2)}</span>
                                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => openEditExpense(e)} className="text-[10px] text-textMuted hover:text-white">✏️</button>
                                                <button onClick={() => deleteExpense(e.id)} className="text-[10px] text-textMuted hover:text-red-400">🗑️</button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* VEHICLE SECTION */}
                    <div className="bento-card p-6 min-h-[400px] lg:col-span-2">
                        <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-4">
                            <h2 className="text-xl font-bold text-white">🚘 I Tuoi Veicoli</h2>
                            <button onClick={() => { resetVehicleForm(); setIsVehicleModalOpen(true); }} className="btn-primary px-4 py-2 text-xs">＋ Aggiungi Veicolo</button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {vehicles.map(v => (
                                <div key={v.id} className="bg-white/5 p-5 rounded-2xl border border-white/5 group relative hover:border-accent/30 transition-all hover:bg-white/10">
                                    <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 rounded-full px-2 py-1">
                                        <button onClick={() => openEditVehicle(v)} className="text-xs text-textMuted hover:text-white">✏️</button>
                                        <button onClick={() => deleteVehicle(v.id)} className="text-xs text-textMuted hover:text-red-400">✕</button>
                                    </div>
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-xl text-accent border border-accent/20">
                                            🚘
                                        </div>
                                        <div>
                                            <p className="text-white font-bold">{v.model}</p>
                                            <p className="text-[10px] text-textMuted uppercase tracking-wider">{v.plate}</p>
                                        </div>
                                    </div>
                                    <div className="mt-2 pt-2 border-t border-white/5 flex justify-between items-center">
                                        <p className="text-[10px] text-textMuted uppercase">VIN</p>
                                        <p className="text-xs text-white font-mono">{v.vin || 'N/D'}</p>
                                    </div>
                                </div>
                            ))}
                            {/* Add Card */}
                            <button onClick={() => { resetVehicleForm(); setIsVehicleModalOpen(true); }} className="bg-white/5 p-5 rounded-2xl border border-white/5 border-dashed hover:border-accent/50 group flex flex-col items-center justify-center gap-2 hover:bg-white/10 transition-all min-h-[140px]">
                                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/50 group-hover:text-accent group-hover:bg-accent/10 transition-colors">
                                    ＋
                                </div>
                                <span className="text-xs text-textMuted group-hover:text-white">Aggiungi Veicolo</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* TOLL MODAL */}
                {isTollModalOpen && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                        <form onSubmit={addToll} className="bg-cardDark w-full max-w-md rounded-2xl border border-white/10 shadow-2xl p-6">
                            <h3 className="text-lg font-bold text-white mb-4">{editingTollId ? 'Modifica Pedaggio' : 'Nuovo Pedaggio'}</h3>
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="input-label">Entrata</label>
                                        <input required type="text" value={tollEntry} onChange={e => setTollEntry(e.target.value)} className="input-field" placeholder="Es. Roma Est" />
                                    </div>
                                    <div>
                                        <label className="input-label">Uscita</label>
                                        <input required type="text" value={tollExit} onChange={e => setTollExit(e.target.value)} className="input-field" placeholder="Es. Milano Sud" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="input-label">Costo (€)</label>
                                        <input required type="number" step="0.01" value={tollCost} onChange={e => setTollCost(e.target.value)} className="input-field" />
                                    </div>
                                    <div>
                                        <label className="input-label">Data</label>
                                        <input required type="date" value={tollDate} onChange={e => setTollDate(e.target.value)} className="input-field" />
                                    </div>
                                </div>
                                <div>
                                    <label className="input-label">Veicolo</label>
                                    <select value={tollVehicle} onChange={e => setTollVehicle(e.target.value)} className="input-field">
                                        <option value="other">Altro Veicolo / Nessuno</option>
                                        {vehicles.map(v => <option key={v.id} value={v.id}>{v.model} ({v.plate})</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="input-label">Collega Viaggio (Opzionale)</label>
                                    <select value={tollTripId} onChange={e => setTollTripId(e.target.value)} className="input-field">
                                        <option value="">-- Seleziona Viaggio --</option>
                                        {trips.map(t => (
                                            <option key={t.docId} value={t.docId}>
                                                {t.date} | {t.startLoc} ➝ {t.endLoc}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="flex gap-3 mt-6">
                                <button type="button" onClick={() => setIsTollModalOpen(false)} className="flex-1 btn-secondary text-sm">Annulla</button>
                                <button type="submit" className="flex-1 btn-primary text-sm">{editingTollId ? 'Aggiorna' : 'Salva'}</button>
                            </div>
                        </form>
                    </div>
                )}

                {/* EXPENSE MODAL */}
                {isExpenseModalOpen && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                        <form onSubmit={addExpense} className="bg-cardDark w-full max-w-md rounded-2xl border border-white/10 shadow-2xl p-6">
                            <h3 className="text-lg font-bold text-white mb-4">{editingExpenseId ? 'Modifica Spesa' : 'Nuova Spesa'}</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="input-label">Tipo Spesa</label>
                                    <select value={expType} onChange={e => setExpType(e.target.value)} className="input-field">
                                        <option value="fuel">Carburante</option>
                                        <option value="revisione">Revisione</option>
                                        <option value="assicurazione">Assicurazione</option>
                                        <option value="tagliando">Tagliando / Manutenzione</option>
                                        <option value="extra">Spese Extra</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="input-label">Veicolo</label>
                                    <select value={expVehicle} onChange={e => setExpVehicle(e.target.value)} className="input-field">
                                        <option value="other">Altro Veicolo / Nessuno</option>
                                        {vehicles.map(v => <option key={v.id} value={v.id}>{v.model} ({v.plate})</option>)}
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="input-label">Costo (€)</label>
                                        <input required type="number" step="0.01" value={expCost} onChange={e => setExpCost(e.target.value)} className="input-field" />
                                    </div>
                                    <div>
                                        <label className="input-label">Data</label>
                                        <input required type="date" value={expDate} onChange={e => setExpDate(e.target.value)} className="input-field" />
                                    </div>
                                </div>
                                <div>
                                    <label className="input-label">Note (Opzionale)</label>
                                    <textarea value={expNotes} onChange={e => setExpNotes(e.target.value)} className="input-field min-h-[80px]" placeholder="Dettagli..."></textarea>
                                </div>
                            </div>
                            <div className="flex gap-3 mt-6">
                                <button type="button" onClick={() => setIsExpenseModalOpen(false)} className="flex-1 btn-secondary text-sm">Annulla</button>
                                <button type="submit" className="flex-1 btn-primary text-sm">{editingExpenseId ? 'Aggiorna' : 'Salva'}</button>
                            </div>
                        </form>
                    </div>
                )}

                {/* VEHICLE MODAL */}
                {isVehicleModalOpen && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                        <form onSubmit={addVehicle} className="bg-cardDark w-full max-w-md rounded-2xl border border-white/10 shadow-2xl p-6">
                            <h3 className="text-lg font-bold text-white mb-4">{editingVehicleId ? 'Modifica Veicolo' : 'Nuovo Veicolo'}</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="input-label">Modello</label>
                                    <input required type="text" value={newVehModel} onChange={e => setNewVehModel(e.target.value)} className="input-field" placeholder="Es. Fiat Panda" />
                                </div>
                                <div>
                                    <label className="input-label">Targa</label>
                                    <input required type="text" value={newVehPlate} onChange={e => setNewVehPlate(e.target.value)} className="input-field" placeholder="AA000BB" />
                                </div>
                                <div>
                                    <label className="input-label">N. Telaio (Opzionale)</label>
                                    <input type="text" value={newVehVin} onChange={e => setNewVehVin(e.target.value)} className="input-field" />
                                </div>
                            </div>
                            <div className="flex gap-3 mt-6">
                                <button type="button" onClick={() => setIsVehicleModalOpen(false)} className="flex-1 btn-secondary text-sm">Annulla</button>
                                <button type="submit" className="flex-1 btn-primary text-sm">{editingVehicleId ? 'Aggiorna' : 'Salva'}</button>
                            </div>
                        </form>
                    </div>
                )}

            </div>
        </div>
    );
}
