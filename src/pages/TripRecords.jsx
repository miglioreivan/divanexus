import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, doc, deleteDoc, updateDoc, onSnapshot, writeBatch } from 'firebase/firestore';
import { auth, db } from '../firebase';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Leaflet Icon Fix
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

const API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImJjODEyODBjYjIwNzQ5OTZiNmEzNTQ5ZGY5YTBhY2QxIiwiaCI6Im11cm11cjY0In0=';

export default function TripRecords() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);

    // Data
    const [vehicles, setVehicles] = useState([]);
    const [allRecords, setAllRecords] = useState([]);
    const [carRecords, setCarRecords] = useState([]);
    const [walkRecords, setWalkRecords] = useState([]);

    // UI
    const [activeTab, setActiveTab] = useState('car_records'); // car_records, walk_paths, editor, data
    const [editorMode, setEditorMode] = useState('car'); // car, walk

    // Editor Data & State
    const [editingId, setEditingId] = useState(null); // ID of the record being edited
    const [points, setPoints] = useState([]);
    const [distance, setDistance] = useState('');
    const [calculatedDuration, setCalculatedDuration] = useState('');

    // Form Inputs
    const [recordName, setRecordName] = useState('');
    const [selectedVehicle, setSelectedVehicle] = useState('');
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [walkName, setWalkName] = useState('');

    // Refs
    const mapContainerRef = useRef(null);
    const mapInstance = useRef(null);
    const markersRef = useRef([]);
    const polylineRef = useRef(null);

    // --- INIT ---
    useEffect(() => {
        const unsubAuth = onAuthStateChanged(auth, (user) => {
            if (user) {
                loadData(user.uid);
            } else {
                navigate('/');
            }
        });
        return () => unsubAuth();
    }, [navigate]);

    const loadData = (uid) => {
        // Vehicles
        onSnapshot(doc(db, "users", uid, "car_finance", "main"), (s) => {
            if (s.exists()) setVehicles(s.data().vehicles || []);
        });

        // Records
        onSnapshot(collection(db, "users", uid, "drivelogbook", "trips", "items"), (s) => {
            const data = s.docs.map(d => ({ id: d.id, ...d.data() }));
            setAllRecords(data);
            setCarRecords(data.filter(t => t.type === 'car' || !t.type).sort((a, b) => (a.durationMs || 0) - (b.durationMs || 0)));
            setWalkRecords(data.filter(t => t.type === 'walk').sort((a, b) => (b.distance || 0) - (a.distance || 0)));
            setLoading(false);
        });
    };

    // --- MAP ---
    useEffect(() => {
        if (activeTab === 'editor' && !mapInstance.current && mapContainerRef.current) {
            mapInstance.current = L.map(mapContainerRef.current).setView([41.9028, 12.4964], 13);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '© OpenStreetMap, © CartoDB'
            }).addTo(mapInstance.current);

            mapInstance.current.on('click', (e) => {
                setPoints(prev => [...prev, e.latlng]);
            });
        }

        // Resize map when tab opens
        if (activeTab === 'editor' && mapInstance.current) {
            setTimeout(() => mapInstance.current.invalidateSize(), 100);
        }

    }, [activeTab]);

    useEffect(() => {
        if (!mapInstance.current) return;

        // Clear
        markersRef.current.forEach(m => m.remove());
        markersRef.current = [];
        if (polylineRef.current) polylineRef.current.remove();

        // Draw Markers
        points.forEach((p, i) => {
            let label = i === 0 ? "Start" : (i === points.length - 1 ? "End" : `WP ${i}`);
            const m = L.marker([p.lat, p.lng], { draggable: true })
                .bindPopup(label)
                .addTo(mapInstance.current);

            m.on('dragend', (e) => {
                const newPos = e.target.getLatLng();
                setPoints(prev => {
                    const next = [...prev];
                    next[i] = newPos;
                    return next;
                });
            });
            markersRef.current.push(m);
        });

        // Draw Line (Simple for Walk)
        if (editorMode === 'walk' && points.length > 1) {
            polylineRef.current = L.polyline(points, { color: '#06b6d4', weight: 4 }).addTo(mapInstance.current);
            // Calc linear distance
            let d = 0;
            for (let i = 0; i < points.length - 1; i++) d += mapInstance.current.distance(points[i], points[i + 1]);
            setDistance((d / 1000).toFixed(2));
        }

    }, [points, editorMode]);

    const calculateRoute = async () => {
        if (points.length < 2) return;
        try {
            const coords = points.map(p => [p.lng, p.lat]);
            const body = { coordinates: coords };

            const res = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
                method: 'POST',
                headers: { 'Authorization': API_KEY, 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const json = await res.json();

            if (json.features?.[0]) {
                const feat = json.features[0];
                const latlngs = feat.geometry.coordinates.map(c => [c[1], c[0]]);

                if (polylineRef.current) polylineRef.current.remove();
                polylineRef.current = L.polyline(latlngs, { color: '#10b981', weight: 5 }).addTo(mapInstance.current);
                mapInstance.current.fitBounds(polylineRef.current.getBounds(), { padding: [50, 50] });

                setDistance((feat.properties.summary.distance / 1000).toFixed(2));
            }
        } catch (e) { alert("Errore API Rotta: " + e.message); }
    };

    // --- LOGIC ---
    useEffect(() => {
        if (startTime && endTime) {
            const s = new Date(`1970-01-01T${startTime}`);
            const e = new Date(`1970-01-01T${endTime}`);
            let d = e - s;
            if (d < 0) d += 86400000;
            const h = Math.floor(d / 3600000);
            const m = Math.floor((d % 3600000) / 60000);
            setCalculatedDuration(`${h}h ${m}m`);
        }
    }, [startTime, endTime]);

    const handleEdit = (record) => {
        setEditingId(record.id);
        const mode = record.type === 'walk' ? 'walk' : 'car';
        setEditorMode(mode);
        // Load data
        setPoints(record.points || []);
        setDistance(record.distance || '');
        if (mode === 'car') {
            setRecordName(record.name || '');
            setStartTime(record.startTime || '');
            setEndTime(record.endTime || '');
            setSelectedVehicle(record.vehicleId || '');
            setCalculatedDuration(record.durationStr || '');
        } else {
            setWalkName(record.name || '');
        }
        setActiveTab('editor');
    };

    const handleReset = () => {
        setEditingId(null);
        setPoints([]);
        setDistance('');
        setStartTime('');
        setEndTime('');
        setRecordName('');
        setWalkName('');
        setCalculatedDuration('');
        if (polylineRef.current) polylineRef.current.remove();
    }

    const saveRecord = async () => {
        try {
            const isCar = editorMode === 'car';
            const durationMs = (isCar && startTime && endTime) ? (() => {
                const s = new Date(`1970-01-01T${startTime}`);
                const e = new Date(`1970-01-01T${endTime}`);
                let d = e - s;
                if (d < 0) d += 86400000;
                return d;
            })() : 0;

            const v = isCar ? vehicles.find(x => x.id === selectedVehicle) : null;

            const docData = {
                type: editorMode,
                name: isCar ? recordName : walkName,
                distance: parseFloat(distance || 0),
                points,
                createdAt: editingId ? undefined : new Date().toISOString(), // Don't overwrite date on edit
                updatedAt: new Date().toISOString(),
                // Car specific
                startTime: isCar ? startTime : null,
                endTime: isCar ? endTime : null,
                durationMs,
                durationStr: calculatedDuration,
                vehicleId: selectedVehicle,
                vehicleName: v ? `${v.make} ${v.model}` : '?'
            };

            // Remove undefined
            if (editingId) delete docData.createdAt;

            if (editingId) {
                await updateDoc(doc(db, "users", auth.currentUser.uid, "drivelogbook", "trips", "items", editingId), docData);
                alert("Aggiornato!");
            } else {
                await addDoc(collection(db, "users", auth.currentUser.uid, "drivelogbook", "trips", "items"), docData);
                alert("Salvato!");
            }

            handleReset();
            setActiveTab(isCar ? 'car_records' : 'walk_paths');
        } catch (e) { alert(e.message); }
    };

    const deleteRec = async (id) => {
        if (confirm("Eliminare definitivamente?")) await deleteDoc(doc(db, "users", auth.currentUser.uid, "drivelogbook", "trips", "items", id));
    };

    const removePoint = (index) => {
        setPoints(prev => prev.filter((_, i) => i !== index));
    };

    const importData = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const data = JSON.parse(evt.target.result);
                if (!Array.isArray(data)) throw new Error("File non valido");
                if (!confirm(`Importare ${data.length} elementi?`)) return;
                const batch = writeBatch(db);
                // Using loop for >500 safety if needed, simplest is sequential await for robust feedback
                for (const item of data) {
                    const { id, ...rest } = item; // drop ID
                    await addDoc(collection(db, "users", auth.currentUser.uid, "drivelogbook", "trips", "items"), rest);
                }
                alert("Importazione completata!");
            } catch (e) { alert("Errore: " + e.message); }
        };
        reader.readAsText(file);
    };

    const exportData = () => {
        const jsonString = `data:text/json;chatset=utf-8,${encodeURIComponent(JSON.stringify(allRecords))}`;
        const link = document.createElement("a");
        link.href = jsonString;
        link.download = `backup_trips_${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
    };

    if (loading) return <div className="min-h-screen bg-[#09090b] flex items-center justify-center text-white font-bold">CARICAMENTO...</div>;

    return (
        <div className="min-h-screen bg-bgApp p-4 md:p-8 font-sans text-white">

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center text-2xl shadow-lg">
                        ⏱️
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">TripRecords</h1>
                        <p className="text-sm text-textMuted">Gestione tempi e percorsi</p>
                    </div>
                </div>
                <button onClick={() => navigate('/app')} className="btn-secondary rounded-full py-2 px-6 text-sm">
                    🏠 Home
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bento-card p-4 flex flex-col items-center justify-center text-center">
                    <div className="text-[10px] text-emerald-400 font-bold uppercase mb-1">Record Auto</div>
                    <div className="text-2xl font-bold">{carRecords.length}</div>
                </div>
                <div className="bento-card p-4 flex flex-col items-center justify-center text-center">
                    <div className="text-[10px] text-cyan-400 font-bold uppercase mb-1">Percorsi Piedi</div>
                    <div className="text-2xl font-bold">{walkRecords.length}</div>
                </div>
                <div className="bento-card p-4 flex flex-col items-center justify-center text-center">
                    <div className="text-[10px] text-textMuted font-bold uppercase mb-1">Km Auto</div>
                    <div className="text-2xl font-bold">{carRecords.reduce((a, b) => a + (b.distance || 0), 0).toFixed(1)}</div>
                </div>
                <div className="bento-card p-4 flex flex-col items-center justify-center text-center">
                    <div className="text-[10px] text-textMuted font-bold uppercase mb-1">Km Piedi</div>
                    <div className="text-2xl font-bold">{walkRecords.reduce((a, b) => a + (b.distance || 0), 0).toFixed(1)}</div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex p-1 bg-white/5 rounded-xl border border-white/10 w-fit mb-6 overflow-x-auto mx-auto md:mx-0">
                <button onClick={() => setActiveTab('car_records')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'car_records' ? 'bg-emerald-500 text-black shadow-lg' : 'text-textMuted hover:text-white'}`}>🏎️ Auto</button>
                <button onClick={() => setActiveTab('walk_paths')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'walk_paths' ? 'bg-cyan-500 text-black shadow-lg' : 'text-textMuted hover:text-white'}`}>🚶 Piedi</button>
                <button onClick={() => setActiveTab('editor')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'editor' ? 'bg-white text-black shadow-lg' : 'text-textMuted hover:text-white'}`}>📝 Editor {editingId ? '(Modifica)' : ''}</button>
                <button onClick={() => setActiveTab('data')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'data' ? 'bg-gray-500 text-white shadow-lg' : 'text-textMuted hover:text-white'}`}>💾 Dati</button>
            </div>

            {/* Content */}
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">

                {/* CAR RECORDS */}
                {activeTab === 'car_records' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {carRecords.map((r, i) => (
                            <div key={r.id} className="bento-card p-6 relative group hover:border-emerald-500/50">
                                <div className="absolute top-4 right-4 text-emerald-500 font-mono font-bold text-xl">{r.durationStr}</div>
                                {i < 3 && <div className="absolute -top-3 -left-3 bg-yellow-400 text-black font-extrabold text-[10px] w-8 h-8 flex items-center justify-center rounded-full shadow-lg border-2 border-[#09090b]">#{i + 1}</div>}

                                <h3 className="text-lg font-bold mb-1 pr-16 text-white">{r.name || "Viaggio"}</h3>
                                <div className="text-xs text-textMuted mb-4 flex items-center gap-2">
                                    <span className="bg-white/10 px-2 py-0.5 rounded text-white/80">{r.vehicleName}</span>
                                    <span>• {new Date(r.createdAt || r.date).toLocaleDateString()}</span>
                                </div>

                                <div className="flex justify-between items-end border-t border-white/5 pt-4">
                                    <div className="text-sm">
                                        <div className="text-textMuted text-[10px] uppercase font-bold">Distanza</div>
                                        <div className="font-mono">{r.distance} km</div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleEdit(r)} className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors text-xs font-bold">✏️ EDIT</button>
                                        <button onClick={() => deleteRec(r.id)} className="p-2 rounded-full hover:bg-red-500/20 text-red-500/50 hover:text-red-500 transition-colors">🗑️</button>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {carRecords.length === 0 && <div className="col-span-full text-center text-textMuted py-10">Nessun record presente. Vai all'Editor.</div>}
                    </div>
                )}

                {/* WALK PATHS */}
                {activeTab === 'walk_paths' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {walkRecords.map(r => (
                            <div key={r.id} className="bento-card p-6 relative group hover:border-cyan-500/50">
                                <div className="flex justify-between items-start mb-4">
                                    <h3 className="text-lg font-bold text-white">{r.name || "Percorso"}</h3>
                                    <div className="text-cyan-400 font-mono font-bold text-xl">{r.distance} km</div>
                                </div>
                                <div className="flex justify-between items-center border-t border-white/5 pt-4 mt-2">
                                    <div className="text-xs text-textMuted">{new Date(r.createdAt).toLocaleDateString()}</div>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleEdit(r)} className="p-2 rounded-lg bg-cyan-500/10 text-cyan-500 hover:bg-cyan-500/20 transition-colors text-xs font-bold">✏️ EDIT</button>
                                        <button onClick={() => deleteRec(r.id)} className="text-xs text-red-500 hover:underline">Elimina</button>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {walkRecords.length === 0 && <div className="col-span-full text-center text-textMuted py-10">Nessun percorso presente. Vai all'Editor.</div>}
                    </div>
                )}

                {/* EDITOR */}
                {activeTab === 'editor' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[700px]">
                        <div className="lg:col-span-2 bg-cardDark rounded-3xl border border-white/10 overflow-hidden relative shadow-2xl h-full">
                            <div ref={mapContainerRef} className="w-full h-full z-0"></div>

                            <div className="absolute top-4 left-4 z-[500] bg-black/80 backdrop-blur border border-white/10 p-1 rounded-xl flex gap-1">
                                <button onClick={() => setEditorMode('car')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${editorMode === 'car' ? 'bg-emerald-500 text-white' : 'text-textMuted hover:text-white'}`}>Automezzo</button>
                                <button onClick={() => setEditorMode('walk')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${editorMode === 'walk' ? 'bg-cyan-500 text-white' : 'text-textMuted hover:text-white'}`}>Piedi</button>
                            </div>

                            <div className="absolute bottom-4 right-4 z-[500] flex gap-2">
                                <button onClick={handleReset} className="btn-danger py-2 px-4 text-xs backdrop-blur-md">Reset / Pulisci</button>
                            </div>
                        </div>

                        <div className="lg:col-span-1 bento-card p-6 overflow-y-auto">
                            <h2 className="text-xl font-bold mb-6 flex items-center justify-between">
                                {editorMode === 'car' ? <span className="text-emerald-400">🏎️ {editingId ? 'Modifica Record' : 'Nuovo Record'}</span> : <span className="text-cyan-400">🚶 {editingId ? 'Modifica Percorso' : 'Nuovo Percorso'}</span>}
                                {editingId && <button onClick={handleReset} className="text-xs text-red-400 hover:underline">Annulla Modifica</button>}
                            </h2>

                            <div className="mb-6 bg-white/5 p-3 rounded-xl border border-white/5">
                                <div className="text-[10px] uppercase text-textMuted font-bold mb-2">Punti Mappa ({points.length})</div>
                                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto custom-scrollbar">
                                    {points.map((_, i) => (
                                        <div key={i} className="px-2 py-1 bg-white/10 rounded-md text-[10px] text-gray-300 flex items-center gap-1 group">
                                            WP {i + 1}
                                            <button onClick={() => removePoint(i)} className="text-red-400 hover:text-white w-4 h-4 flex items-center justify-center rounded-full hover:bg-red-500/50 transition-colors">×</button>
                                        </div>
                                    ))}
                                    {points.length === 0 && <span className="text-xs text-textMuted italic">Clicca sulla mappa...</span>}
                                </div>
                            </div>

                            {editorMode === 'car' ? (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="col-span-2">
                                            <button onClick={calculateRoute} disabled={points.length < 2} className="w-full btn-primary bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-black text-sm">
                                                1. Calcola Distanza 📍
                                            </button>
                                        </div>
                                        <div className="col-span-2 p-3 bg-white/5 rounded-xl text-center border border-white/5">
                                            <div className="text-[10px] uppercase text-textMuted">Distanza</div>
                                            <div className="text-2xl font-mono font-bold">{distance || '--'} <span className="text-sm">km</span></div>
                                        </div>
                                    </div>

                                    <div className="space-y-3 pt-4 border-t border-white/10">
                                        <div>
                                            <label className="input-label">Nome Tragitto</label>
                                            <input type="text" value={recordName} onChange={e => setRecordName(e.target.value)} className="input-field" placeholder="Es. Casa - Lavoro" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div><label className="input-label">Start</label><input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="input-field" /></div>
                                            <div><label className="input-label">End</label><input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="input-field" /></div>
                                        </div>
                                        <div className="text-center text-emerald-400 font-mono text-sm py-1">{calculatedDuration && `Durata: ${calculatedDuration}`}</div>

                                        <div>
                                            <label className="input-label">Veicolo</label>
                                            <select value={selectedVehicle} onChange={e => setSelectedVehicle(e.target.value)} className="input-field">
                                                <option value="">Seleziona...</option>
                                                {vehicles.map(v => <option key={v.id} value={v.id}>{v.make} {v.model}</option>)}
                                            </select>
                                        </div>
                                    </div>

                                    <button onClick={saveRecord} className="w-full mt-4 btn-primary bg-white text-black hover:bg-gray-200">
                                        {editingId ? "Aggiorna Record" : "2. Salva Record"}
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="p-4 bg-cyan-900/20 border border-cyan-500/20 rounded-xl text-center">
                                        <div className="text-[10px] uppercase text-cyan-400">Distanza Stimata</div>
                                        <div className="text-3xl font-mono font-bold text-white">{distance || '0.00'} <span className="text-lg text-textMuted">km</span></div>
                                    </div>
                                    <div>
                                        <label className="input-label">Nome Percorso</label>
                                        <input type="text" value={walkName} onChange={e => setWalkName(e.target.value)} className="input-field" placeholder="Es. Giro del parco" />
                                    </div>
                                    <button onClick={saveRecord} className="w-full mt-4 btn-primary bg-white text-black hover:bg-gray-200">
                                        {editingId ? "Aggiorna Percorso" : "Salva Percorso"}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* DATA */}
                {activeTab === 'data' && (
                    <div className="bento-card p-12 max-w-2xl mx-auto mt-8 flex flex-col items-center text-center">
                        <div className="text-4xl mb-4">💾</div>
                        <h2 className="text-2xl font-bold mb-2">Import / Export</h2>
                        <p className="text-textMuted mb-8 text-sm">Gestione backup e ripristino dati.</p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                            <button onClick={exportData} className="btn-secondary h-24 flex flex-col items-center justify-center gap-2 border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 hover:border-emerald-500/50">
                                <span className="text-emerald-500 font-bold">ESPORTA JSON</span>
                                <span className="text-xs text-emerald-500/50">Scarica file .json</span>
                            </button>

                            <label className="btn-secondary h-24 flex flex-col items-center justify-center gap-2 border-cyan-500/20 bg-cyan-500/5 hover:bg-cyan-500/10 hover:border-cyan-500/50 cursor-pointer">
                                <span className="text-cyan-500 font-bold">IMPORTA JSON</span>
                                <span className="text-xs text-cyan-500/50">Carica file .json</span>
                                <input type="file" accept=".json" onChange={importData} className="hidden" />
                            </label>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
