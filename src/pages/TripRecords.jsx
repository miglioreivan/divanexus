import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, doc, deleteDoc, onSnapshot, writeBatch } from 'firebase/firestore';
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

    // Editor Data
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
            setCarRecords(data.filter(t => t.type === 'car').sort((a, b) => (a.durationMs || 0) - (b.durationMs || 0)));
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

    // --- FORM HELPERS ---
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

            await addDoc(collection(db, "users", auth.currentUser.uid, "drivelogbook", "trips", "items"), {
                type: editorMode,
                name: isCar ? recordName : walkName,
                distance: parseFloat(distance || 0),
                points,
                createdAt: new Date().toISOString(),
                // Car specific
                startTime: isCar ? startTime : null,
                endTime: isCar ? endTime : null,
                durationMs,
                durationStr: calculatedDuration,
                vehicleId: selectedVehicle,
                vehicleName: v ? `${v.make} ${v.model}` : '?'
            });

            // Reset
            setPoints([]); setDistance(''); setStartTime(''); setEndTime('');
            setRecordName(''); setWalkName('');
            setActiveTab(isCar ? 'car_records' : 'walk_paths');
            alert("Salvato!");
        } catch (e) { alert(e.message); }
    };

    const deleteRec = async (id) => {
        if (confirm("Eliminare?")) await deleteDoc(doc(db, "users", auth.currentUser.uid, "drivelogbook", "trips", "items", id));
    };

    // --- DATA MANAGEMENT ---
    const exportData = () => {
        const jsonString = `data:text/json;chatset=utf-8,${encodeURIComponent(
            JSON.stringify(allRecords)
        )}`;
        const link = document.createElement("a");
        link.href = jsonString;
        link.download = `nexus_triprecords_backup_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
    };

    const importData = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const data = JSON.parse(evt.target.result);
                if (!Array.isArray(data)) throw new Error("Formato non valido (deve essere un array)");

                if (!confirm(`Importare ${data.length} records? (Saranno aggiunti)`)) return;

                const batch = writeBatch(db);
                // Can't batch too many, but for now Assume <500. Ideally chunk it.
                // Or just loop addDoc if ids not preserved.
                // Let's use loop for simplicity as we generate new IDs to avoid conflicts
                for (const item of data) {
                    delete item.id; // remove old id
                    await addDoc(collection(db, "users", auth.currentUser.uid, "drivelogbook", "trips", "items"), item);
                }
                alert("Importazione completata!");
            } catch (e) { alert("Errore import: " + e.message); }
        };
        reader.readAsText(file);
    };


    if (loading) return <div className="min-h-screen bg-[#09090b] flex items-center justify-center text-white">Caricamento...</div>;

    return (
        <div className="min-h-screen bg-[#09090b] p-4 md:p-8 font-sans text-white bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-900/20 via-black to-black">

            {/* Navbar */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center text-2xl shadow-lg shadow-emerald-900/50">
                        ⏱️
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">TripRecords</h1>
                        <p className="text-sm text-gray-400">Master your journeys</p>
                    </div>
                </div>
                <button onClick={() => navigate('/app')} className="px-5 py-2 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-sm font-semibold backdrop-blur-sm">
                    🏠 Torna alla Home
                </button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
                    <div className="text-xs text-emerald-400 font-bold uppercase mb-1">Record Auto</div>
                    <div className="text-2xl font-bold">{carRecords.length}</div>
                </div>
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
                    <div className="text-xs text-cyan-400 font-bold uppercase mb-1">Percorsi Piedi</div>
                    <div className="text-2xl font-bold">{walkRecords.length}</div>
                </div>
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
                    <div className="text-xs text-gray-400 font-bold uppercase mb-1">Km Totali Auto</div>
                    <div className="text-2xl font-bold">{carRecords.reduce((a, b) => a + (b.distance || 0), 0).toFixed(1)}</div>
                </div>
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
                    <div className="text-xs text-gray-400 font-bold uppercase mb-1">Km Totali Piedi</div>
                    <div className="text-2xl font-bold">{walkRecords.reduce((a, b) => a + (b.distance || 0), 0).toFixed(1)}</div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex p-1 bg-white/5 rounded-xl border border-white/10 w-fit mb-6 overflow-x-auto">
                {[
                    { id: 'car_records', label: '🏎️ Auto', color: 'bg-emerald-500' },
                    { id: 'walk_paths', label: '🚶 Piedi', color: 'bg-cyan-500' },
                    { id: 'editor', label: '📝 Editor', color: 'bg-white text-black' },
                    { id: 'data', label: '💾 Dati', color: 'bg-gray-500' }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === tab.id ? `${tab.color} shadow-lg` : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* CONTENT AREA */}
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">

                {/* CAR RECORDS */}
                {activeTab === 'car_records' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {carRecords.map((r, i) => (
                            <div key={r.id} className="relative group bg-white/5 border border-white/10 hover:border-emerald-500/50 p-6 rounded-3xl transition-all hover:bg-white/[0.07]">
                                <div className="absolute top-4 right-4 text-emerald-500 font-mono font-bold text-xl drop-shadow-sm">{r.durationStr}</div>
                                {i < 3 && <div className="absolute -top-3 -left-3 bg-yellow-400 text-black font-extrabold text-[10px] w-8 h-8 flex items-center justify-center rounded-full shadow-lg border-2 border-[#09090b]">#{i + 1}</div>}

                                <h3 className="text-lg font-bold mb-1 pr-16 text-white/90">{r.name || "Senza Nome"}</h3>
                                <div className="text-xs text-gray-400 mb-4 flex items-center gap-2">
                                    <span className="bg-white/10 px-2 py-0.5 rounded text-white/80">{r.vehicleName}</span>
                                    <span>• {new Date(r.createdAt).toLocaleDateString()}</span>
                                </div>

                                <div className="flex justify-between items-end border-t border-white/5 pt-4">
                                    <div className="text-sm">
                                        <div className="text-gray-500 text-[10px] uppercase font-bold">Distanza</div>
                                        <div className="font-mono">{r.distance} km</div>
                                    </div>
                                    <button onClick={() => deleteRec(r.id)} className="p-2 rounded-full hover:bg-red-500/20 text-red-500/50 hover:text-red-500 transition-colors">🗑️</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* WALK PATHS */}
                {activeTab === 'walk_paths' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {walkRecords.map(r => (
                            <div key={r.id} className="bg-white/5 border border-white/10 hover:border-cyan-500/50 p-6 rounded-3xl transition-all hover:bg-white/[0.07]">
                                <div className="flex justify-between items-start mb-4">
                                    <h3 className="text-lg font-bold text-white/90">{r.name}</h3>
                                    <div className="text-cyan-400 font-mono font-bold text-xl">{r.distance} km</div>
                                </div>
                                <div className="flex justify-between items-center border-t border-white/5 pt-4 mt-2">
                                    <div className="text-xs text-gray-400">{new Date(r.createdAt).toLocaleDateString()}</div>
                                    <button onClick={() => deleteRec(r.id)} className="text-xs text-red-500 hover:underline">Elimina</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* EDITOR */}
                {activeTab === 'editor' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[700px]">
                        <div className="lg:col-span-2 bg-[#121212] rounded-3xl border border-white/10 overflow-hidden relative shadow-2xl">
                            <div ref={mapContainerRef} className="w-full h-full z-0"></div>

                            {/* Map Floating Controls */}
                            <div className="absolute top-4 left-4 z-[500] bg-black/80 backdrop-blur border border-white/10 p-1 rounded-xl flex gap-1">
                                <button onClick={() => setEditorMode('car')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${editorMode === 'car' ? 'bg-emerald-500 text-white' : 'text-gray-400 hover:text-white'}`}>Automezzo</button>
                                <button onClick={() => setEditorMode('walk')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${editorMode === 'walk' ? 'bg-cyan-500 text-white' : 'text-gray-400 hover:text-white'}`}>Piedi</button>
                            </div>

                            <div className="absolute bottom-4 right-4 z-[500] flex gap-2">
                                <button onClick={() => { setPoints([]); setDistance(''); polylineRef.current?.remove(); }} className="px-4 py-2 bg-red-500/20 hover:bg-red-500/40 text-red-400 border border-red-500/30 rounded-lg text-xs font-bold backdrop-blur">Reset Mappa</button>
                            </div>
                        </div>

                        <div className="lg:col-span-1 bg-white/5 border border-white/10 rounded-3xl p-6 overflow-y-auto backdrop-blur-sm">
                            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                                {editorMode === 'car' ? <span className="text-emerald-400">🏎️ Nuovo Record</span> : <span className="text-cyan-400">🚶 Nuovo Percorso</span>}
                            </h2>

                            {/* Waypoints List */}
                            <div className="mb-6 bg-white/5 p-3 rounded-xl border border-white/5">
                                <div className="text-[10px] uppercase text-gray-500 font-bold mb-2">Punti Mappa ({points.length})</div>
                                <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto custom-scrollbar">
                                    {points.map((_, i) => (
                                        <span key={i} className="px-2 py-1 bg-white/10 rounded text-[10px] text-gray-300">WP {i + 1}</span>
                                    ))}
                                    {points.length === 0 && <span className="text-xs text-gray-600 italic">Clicca sulla mappa...</span>}
                                </div>
                            </div>

                            {editorMode === 'car' ? (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="col-span-2">
                                            <button onClick={calculateRoute} disabled={points.length < 2} className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold rounded-xl transition-all shadow-lg hover:shadow-emerald-500/20 text-sm">
                                                1. Calcola Distanza 📍
                                            </button>
                                        </div>
                                        <div className="col-span-2 p-3 bg-white/5 rounded-xl text-center border border-white/5">
                                            <div className="text-[10px] uppercase text-gray-500">Distanza</div>
                                            <div className="text-2xl font-mono font-bold">{distance || '--'} <span className="text-sm">km</span></div>
                                        </div>
                                    </div>

                                    <div className="space-y-3 pt-4 border-t border-white/10">
                                        <div>
                                            <label className="label-xs">Nome Tragitto</label>
                                            <input type="text" value={recordName} onChange={e => setRecordName(e.target.value)} className="w-full input-dark" placeholder="Es. Casa - Lavoro" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div><label className="label-xs">Start</label><input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full input-dark" /></div>
                                            <div><label className="label-xs">End</label><input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full input-dark" /></div>
                                        </div>
                                        <div className="text-center text-emerald-400 font-mono text-sm py-1">{calculatedDuration && `Durata: ${calculatedDuration}`}</div>

                                        <div>
                                            <label className="label-xs">Veicolo</label>
                                            <select value={selectedVehicle} onChange={e => setSelectedVehicle(e.target.value)} className="w-full input-dark">
                                                <option value="">Seleziona...</option>
                                                {vehicles.map(v => <option key={v.id} value={v.id}>{v.make} {v.model}</option>)}
                                            </select>
                                        </div>
                                    </div>

                                    <button onClick={saveRecord} className="w-full py-3 mt-4 bg-white text-black font-bold rounded-xl hover:bg-gray-200 transition-all shadow-lg">
                                        2. Salva Record
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="p-4 bg-cyan-900/20 border border-cyan-500/20 rounded-xl text-center">
                                        <div className="text-[10px] uppercase text-cyan-400">Distanza Stimata</div>
                                        <div className="text-3xl font-mono font-bold text-white">{distance || '0.00'} <span className="text-lg text-gray-400">km</span></div>
                                    </div>
                                    <div>
                                        <label className="label-xs">Nome Percorso</label>
                                        <input type="text" value={walkName} onChange={e => setWalkName(e.target.value)} className="w-full input-dark" placeholder="Es. Giro del parco" />
                                    </div>
                                    <button onClick={saveRecord} className="w-full py-3 mt-4 bg-white text-black font-bold rounded-xl hover:bg-gray-200 transition-all shadow-lg">
                                        Salva Percorso
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* DATA MANAGEMENT */}
                {activeTab === 'data' && (
                    <div className="flex flex-col items-center justify-center p-12 bg-white/5 border border-white/10 rounded-3xl max-w-2xl mx-auto mt-8">
                        <div className="text-4xl mb-4">💾</div>
                        <h2 className="text-2xl font-bold mb-2">Import / Export</h2>
                        <p className="text-gray-400 text-center mb-8 text-sm">Salva i tuoi dati in locale o ripristina un backup precedente.</p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                            <button onClick={exportData} className="px-6 py-4 rounded-xl bg-black/40 border border-white/10 hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-all flex flex-col items-center gap-2 group">
                                <span className="text-emerald-500 font-bold">ESPORTA JSON</span>
                                <span className="text-xs text-gray-500 group-hover:text-emerald-400/70">Scarica backup completo</span>
                            </button>

                            <label className="px-6 py-4 rounded-xl bg-black/40 border border-white/10 hover:border-cyan-500/50 hover:bg-cyan-500/10 transition-all flex flex-col items-center gap-2 group cursor-pointer">
                                <span className="text-cyan-500 font-bold">IMPORTA JSON</span>
                                <span className="text-xs text-gray-500 group-hover:text-cyan-400/70">Ripristina da file</span>
                                <input type="file" accept=".json" onChange={importData} className="hidden" />
                            </label>
                        </div>
                    </div>
                )}

            </div>

            <style>{`
                .label-xs { display:block; font-size:10px; font-weight:700; color:#6b7280; text-transform:uppercase; margin-bottom:4px; }
                .input-dark { background-color: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 8px 12px; color: white; outline: none; transition: all; }
                .input-dark:focus { border-color: rgba(16, 185, 129, 0.5); background-color: rgba(0,0,0,0.5); }
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 4px; }
            `}</style>
        </div>
    );
}
