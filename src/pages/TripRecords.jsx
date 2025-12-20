import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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
    const [editingId, setEditingId] = useState(null);
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
    const fileInputRef = useRef(null);

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

        // Resize map
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

        // Draw Line
        if (editorMode === 'walk' && points.length > 1) {
            polylineRef.current = L.polyline(points, { color: '#06b6d4', weight: 4 }).addTo(mapInstance.current);
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
                updatedAt: new Date().toISOString(),
                // Car specific
                startTime: isCar ? startTime : null,
                endTime: isCar ? endTime : null,
                durationMs,
                durationStr: calculatedDuration,
                vehicleId: selectedVehicle,
                vehicleName: v ? `${v.make} ${v.model}` : '?'
            };

            if (!editingId) docData.createdAt = new Date().toISOString();

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

    const importData = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const data = JSON.parse(evt.target.result);
                if (!Array.isArray(data)) throw new Error("File non valido");
                if (!confirm(`Importare ${data.length} elementi?`)) return;
                for (const item of data) {
                    const { id, ...rest } = item;
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

    if (loading) return null;

    // Style override matching LoveTracker but with Green Accent
    const pageStyle = {
        '--color-accent': '#10b981', // Emerald-500
        '--color-accent-hover': '#059669', // Emerald-600
    };

    return (
        <div className="min-h-screen p-4 md:p-8 flex items-center justify-center transition-opacity duration-300" style={pageStyle}>

            {/* Nav Buttons (Fixed Top Right) */}
            <div className="fixed top-6 right-6 z-50 flex gap-2">
                <Link to="/app" className="btn-secondary rounded-full px-4 py-2 text-xs font-semibold no-underline shadow-lg bg-cardDark hover:bg-white/10">
                    🏠 Home
                </Link>
                <button
                    onClick={() => onAuthStateChanged(auth, () => { }).then(() => navigate('/'))} // Auth check trick or just navigate
                    className="btn-secondary rounded-full px-4 py-2 text-xs font-semibold shadow-lg bg-cardDark hover:bg-red-500/10 hover:text-red-400"
                >
                    Esci
                </button>
            </div>

            <div className="max-w-6xl w-full grid grid-cols-1 md:grid-cols-3 gap-6 pt-16 md:pt-0 h-[85vh]">

                {/* Sidebar / Stats */}
                <div className="bento-card col-span-1 md:col-span-1 p-8 flex flex-col justify-between h-full overflow-y-auto">
                    <div className="flex flex-col gap-6">
                        <div>
                            <h1 className="text-3xl font-bold text-white mb-1 tracking-tight">Trip<span className="text-accent">Records</span></h1>
                            <p className="text-textMuted text-xs font-medium uppercase tracking-widest">Diario di Viaggio</p>
                        </div>

                        {/* Tabs as a vertical list in sidebar for better "Dashboard" feel */}
                        <div className="flex flex-col gap-2">
                            <button onClick={() => setActiveTab('car_records')} className={`text-left px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'car_records' ? 'bg-accent text-white shadow-lg' : 'bg-white/5 text-textMuted hover:bg-white/10 hover:text-white'}`}>🏎️ Record Auto ({carRecords.length})</button>
                            <button onClick={() => setActiveTab('walk_paths')} className={`text-left px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'walk_paths' ? 'bg-cyan-500 text-white shadow-lg' : 'bg-white/5 text-textMuted hover:bg-white/10 hover:text-white'}`}>🚶 Percorsi Piedi ({walkRecords.length})</button>
                            <button onClick={() => setActiveTab('editor')} className={`text-left px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'editor' ? 'bg-white text-black shadow-lg' : 'bg-white/5 text-textMuted hover:bg-white/10 hover:text-white'}`}>📝 Editor {editingId ? '(Modifica)' : ''}</button>
                            <button onClick={() => setActiveTab('data')} className={`text-left px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'data' ? 'bg-gray-500 text-white shadow-lg' : 'bg-white/5 text-textMuted hover:bg-white/10 hover:text-white'}`}>💾 Dati</button>
                        </div>

                        <div className="space-y-4">
                            <div className="bg-black/20 p-5 rounded-2xl border border-white/5">
                                <div className="flex items-center justify-between"><p className="text-xs text-textMuted uppercase font-bold tracking-wider">Km Auto</p><span className="text-xl">🛣️</span></div>
                                <p className="text-2xl font-bold text-white mt-1">{carRecords.reduce((a, b) => a + (b.distance || 0), 0).toFixed(1)} <span className="text-sm font-normal text-gray-500">km</span></p>
                            </div>
                            <div className="bg-black/20 p-5 rounded-2xl border border-white/5">
                                <div className="flex items-center justify-between"><p className="text-xs text-textMuted uppercase font-bold tracking-wider">Km Piedi</p><span className="text-xl">👣</span></div>
                                <p className="text-2xl font-bold text-white mt-1">{walkRecords.reduce((a, b) => a + (b.distance || 0), 0).toFixed(1)} <span className="text-sm font-normal text-gray-500">km</span></p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="bento-card col-span-1 md:col-span-2 p-8 relative flex flex-col h-full overflow-hidden">

                    {/* CAR RECORDS LIST */}
                    {activeTab === 'car_records' && (
                        <div className="flex flex-col h-full">
                            <h2 className="text-xl font-bold text-white mb-6">Storico Auto</h2>
                            <div className="overflow-y-auto space-y-3 flex-1 pr-2 custom-scrollbar">
                                {carRecords.map((r, i) => (
                                    <div key={r.id} className="bg-bgApp p-4 rounded-xl border border-white/5 group hover:border-accent/50 transition-all">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    {i < 3 && <span className="bg-yellow-400 text-black text-[10px] font-bold px-1.5 rounded">#{i + 1}</span>}
                                                    <h3 className="font-bold text-white">{r.name || "Viaggio"}</h3>
                                                </div>
                                                <div className="text-xs text-textMuted mt-1">{new Date(r.createdAt || r.date).toLocaleDateString()} • {r.vehicleName}</div>
                                            </div>
                                            <div className="text-accent font-mono font-bold text-lg">{r.durationStr}</div>
                                        </div>
                                        <div className="mt-3 pt-3 border-t border-white/5 flex justify-between items-center">
                                            <span className="text-xs text-gray-400 font-mono">{r.distance} km</span>
                                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => handleEdit(r)} className="text-xs font-bold text-accent hover:underline">MODIFICA</button>
                                                <button onClick={() => deleteRec(r.id)} className="text-xs font-bold text-red-500 hover:underline">ELIMINA</button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* WALK PATHS LIST */}
                    {activeTab === 'walk_paths' && (
                        <div className="flex flex-col h-full">
                            <h2 className="text-xl font-bold text-white mb-6">Storico Piedi</h2>
                            <div className="overflow-y-auto space-y-3 flex-1 pr-2 custom-scrollbar">
                                {walkRecords.map(r => (
                                    <div key={r.id} className="bg-bgApp p-4 rounded-xl border border-white/5 group hover:border-cyan-500/50 transition-all">
                                        <div className="flex justify-between items-start">
                                            <h3 className="font-bold text-white">{r.name || "Percorso"}</h3>
                                            <div className="text-cyan-400 font-mono font-bold text-lg">{r.distance} km</div>
                                        </div>
                                        <div className="mt-3 pt-3 border-t border-white/5 flex justify-between items-center">
                                            <div className="text-xs text-textMuted">{new Date(r.createdAt).toLocaleDateString()}</div>
                                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => handleEdit(r)} className="text-xs font-bold text-cyan-500 hover:underline">MODIFICA</button>
                                                <button onClick={() => deleteRec(r.id)} className="text-xs font-bold text-red-500 hover:underline">ELIMINA</button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* EDITOR */}
                    {activeTab === 'editor' && (
                        <div className="flex flex-col h-full">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-bold text-white">{editingId ? 'Modifica' : 'Nuovo'}</h2>
                                <div className="flex gap-2 bg-white/5 p-1 rounded-lg">
                                    <button onClick={() => setEditorMode('car')} className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${editorMode === 'car' ? 'bg-accent text-white' : 'text-textMuted hover:text-white'}`}>Auto</button>
                                    <button onClick={() => setEditorMode('walk')} className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${editorMode === 'walk' ? 'bg-cyan-500 text-white' : 'text-textMuted hover:text-white'}`}>Piedi</button>
                                </div>
                            </div>

                            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
                                {/* Map */}
                                <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-black/50">
                                    <div ref={mapContainerRef} className="w-full h-full"></div>
                                    <div className="absolute bottom-4 right-4 z-[500] flex gap-2">
                                        <button onClick={handleReset} className="px-3 py-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-xs font-bold backdrop-blur hover:bg-red-500/40">Reset</button>
                                    </div>
                                </div>

                                {/* Form */}
                                <div className="overflow-y-auto pr-2 custom-scrollbar">
                                    <div className="bg-white/5 p-3 rounded-xl border border-white/5 mb-4">
                                        <div className="text-[10px] uppercase text-textMuted font-bold mb-2">Checkpoints</div>
                                        <div className="flex flex-wrap gap-2">
                                            {points.map((_, i) => (
                                                <div key={i} className="px-2 py-1 bg-white/10 rounded-md text-[10px] text-gray-300 flex items-center gap-1">
                                                    {i + 1} <button onClick={() => removePoint(i)} className="text-red-400 hover:text-white ml-1">×</button>
                                                </div>
                                            ))}
                                            {points.length === 0 && <span className="text-xs text-textMuted italic">Clicca sulla mappa...</span>}
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        {editorMode === 'car' ? (
                                            <>
                                                <button onClick={calculateRoute} disabled={points.length < 2} className="w-full btn-secondary py-2 text-xs border-accent/30 text-accent hover:bg-accent/10">Calcola Rotta</button>

                                                <div className="bg-black/20 p-3 rounded-xl text-center border border-white/5 flex justify-between items-center">
                                                    <span className="text-[10px] uppercase text-textMuted font-bold">Totale</span>
                                                    <span className="text-xl font-mono font-bold">{distance || '0'} <span className="text-sm text-gray-500">km</span></span>
                                                </div>

                                                <div><label className="input-label">Nome</label><input type="text" value={recordName} onChange={e => setRecordName(e.target.value)} className="input-field" placeholder="Es. Lavoro" /></div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div><label className="input-label">Start</label><input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="input-field" /></div>
                                                    <div><label className="input-label">End</label><input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="input-field" /></div>
                                                </div>
                                                <div>
                                                    <label className="input-label">Auto</label>
                                                    <select value={selectedVehicle} onChange={e => setSelectedVehicle(e.target.value)} className="input-field">
                                                        <option value="">Seleziona...</option>
                                                        {vehicles.map(v => <option key={v.id} value={v.id}>{v.make} {v.model}</option>)}
                                                    </select>
                                                </div>
                                                <div className="text-center text-accent text-xs font-bold">{calculatedDuration && `Durata: ${calculatedDuration}`}</div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="bg-black/20 p-3 rounded-xl text-center border border-white/5 flex justify-between items-center">
                                                    <span className="text-[10px] uppercase text-cyan-400 font-bold">Distanza</span>
                                                    <span className="text-xl font-mono font-bold">{distance || '0'} <span className="text-sm text-gray-500">km</span></span>
                                                </div>
                                                <div><label className="input-label">Nome</label><input type="text" value={walkName} onChange={e => setWalkName(e.target.value)} className="input-field" placeholder="Es. Passeggiata" /></div>
                                            </>
                                        )}

                                        <button onClick={saveRecord} className="w-full btn-primary py-3 mt-4">
                                            {editingId ? 'Aggiorna' : 'Salva'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* DATA */}
                    {activeTab === 'data' && (
                        <div className="flex flex-col items-center justify-center h-full gap-6">
                            <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                                <button onClick={exportData} className="btn-secondary py-8 flex flex-col items-center gap-2">
                                    <span className="text-2xl">📤</span>
                                    <span className="font-bold text-sm">Export JSON</span>
                                </button>
                                <button onClick={() => fileInputRef.current.click()} className="btn-secondary py-8 flex flex-col items-center gap-2">
                                    <span className="text-2xl">📥</span>
                                    <span className="font-bold text-sm">Import JSON</span>
                                    <input type="file" ref={fileInputRef} accept=".json" className="hidden" onChange={importData} />
                                </button>
                            </div>
                            <p className="text-xs text-textMuted max-w-xs text-center">Scarica un backup dei tuoi viaggi o ripristinane uno precedente.</p>
                        </div>
                    )}

                </div>

            </div>
        </div>
    );
}
