import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, doc, deleteDoc, updateDoc, onSnapshot } from 'firebase/firestore';
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
    const [carRecords, setCarRecords] = useState([]);
    const [walkRecords, setWalkRecords] = useState([]);
    const [tracks, setTracks] = useState([]);

    // UI State
    const [activeTab, setActiveTab] = useState('car_records');
    const [editorMode, setEditorMode] = useState('car');
    const [viewModalData, setViewModalData] = useState(null); // Data for the "View Details" modal

    // Editor State
    const [editingId, setEditingId] = useState(null); // If editing an existing TRIP
    const [isSavingTrack, setIsSavingTrack] = useState(false); // Toggle to save as "Track" instead of "Trip"

    const [points, setPoints] = useState([]);
    const [distance, setDistance] = useState('');
    const [calculatedDuration, setCalculatedDuration] = useState('');

    // Editor Inputs
    const [recordName, setRecordName] = useState('');
    const [selectedVehicle, setSelectedVehicle] = useState('');
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [walkName, setWalkName] = useState('');
    const [selectedTrackId, setSelectedTrackId] = useState(''); // For loading a track

    // Refs
    const mapContainerRef = useRef(null);
    const viewMapContainerRef = useRef(null);
    const mapInstance = useRef(null);
    const viewMapInstance = useRef(null);
    const markersRef = useRef([]);
    const polylineRef = useRef(null);
    const viewPolylineRef = useRef(null);
    const fileInputRef = useRef(null);

    // --- INIT ---
    useEffect(() => {
        const unsubAuth = onAuthStateChanged(auth, (user) => {
            if (user) loadData(user.uid);
            else navigate('/');
        });
        return () => unsubAuth();
    }, [navigate]);

    const loadData = (uid) => {
        // Vehicles
        onSnapshot(doc(db, "users", uid, "car_finance", "main"), (s) => {
            if (s.exists()) setVehicles(s.data().vehicles || []);
        });

        // Trips
        onSnapshot(collection(db, "users", uid, "drivelogbook", "trips", "items"), (s) => {
            const data = s.docs.map(d => ({ id: d.id, ...d.data() }));
            setCarRecords(data.filter(t => t.type === 'car' || !t.type).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
            setWalkRecords(data.filter(t => t.type === 'walk').sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
            setLoading(false);
        });

        // Tracks (New Collection)
        onSnapshot(collection(db, "users", uid, "drivelogbook", "tracks", "items"), (s) => {
            const t = s.docs.map(d => ({ id: d.id, ...d.data() }));
            setTracks(t);
        });
    };

    // --- MAP ENGINE ---
    // Initialize or Resize main editor map
    useEffect(() => {
        if (activeTab === 'editor') {
            if (!mapInstance.current && mapContainerRef.current) {
                mapInstance.current = L.map(mapContainerRef.current).setView([41.9028, 12.4964], 13);
                L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '© OpenStreetMap' }).addTo(mapInstance.current);
                mapInstance.current.on('click', (e) => setPoints(prev => [...prev, e.latlng]));
            }
            setTimeout(() => mapInstance.current?.invalidateSize(), 200);
        }

        // Cleanup when leaving editor tab
        return () => {
            if (activeTab === 'editor' && mapInstance.current) {
                mapInstance.current.remove();
                mapInstance.current = null;
            }
        };
    }, [activeTab]);

    // Draw Editor Map items
    useEffect(() => {
        if (!mapInstance.current) return;

        // Cleanup
        markersRef.current.forEach(m => m.remove());
        markersRef.current = [];
        if (polylineRef.current) polylineRef.current.remove();

        // Markers
        points.forEach((p, i) => {
            const label = i === 0 ? "Start" : (i === points.length - 1 ? "End" : `WP ${i}`);
            const m = L.marker([p.lat, p.lng], { draggable: true }).bindPopup(label).addTo(mapInstance.current);
            m.on('dragend', (e) => {
                const newPos = e.target.getLatLng();
                setPoints(prev => { const n = [...prev]; n[i] = newPos; return n; });
            });
            markersRef.current.push(m);
        });

        // Line
        if (points.length > 1) {
            // If Walk or just connecting dots visually before route calc
            if (editorMode === 'walk') {
                polylineRef.current = L.polyline(points, { color: '#06b6d4', weight: 4 }).addTo(mapInstance.current);
                let d = 0;
                for (let i = 0; i < points.length - 1; i++) d += mapInstance.current.distance(points[i], points[i + 1]);
                setDistance((d / 1000).toFixed(2));
            } else {
                // For car, we usually wait for calc, but we can draw a straight line preview
                // Or if we loaded a track with geometry, we might want to show that. 
                // For simplicity, we just show markers until "Calculate" is hit, UNLESS we loaded a track.
            }
        }
    }, [points, editorMode]);

    // View Modal Map Logic
    useEffect(() => {
        if (viewModalData && viewMapContainerRef.current) {
            if (!viewMapInstance.current) {
                // Initialize with default view to avoid "Set map center and zoom first" error
                viewMapInstance.current = L.map(viewMapContainerRef.current).setView([41.9028, 12.4964], 13);
                L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '© OpenStreetMap' }).addTo(viewMapInstance.current);
            }

            // Reset layers
            if (viewPolylineRef.current) viewPolylineRef.current.remove();
            viewMapInstance.current.eachLayer((layer) => {
                if (layer instanceof L.Marker) layer.remove();
            });

            // Draw
            const p = viewModalData.points || [];
            if (p.length > 0) {
                viewPolylineRef.current = L.polyline(p, { color: viewModalData.type === 'walk' ? '#06b6d4' : '#10b981', weight: 5 }).addTo(viewMapInstance.current);
                viewMapInstance.current.fitBounds(viewPolylineRef.current.getBounds(), { padding: [50, 50] });

                // Add Markers
                p.forEach((pt, i) => {
                    L.marker([pt.lat, pt.lng]).addTo(viewMapInstance.current);
                });
            } else {
                // If no points, just keep default view or try to center somewhere? 
                // Default view is safely set on init.
            }

            setTimeout(() => viewMapInstance.current.invalidateSize(), 200);
        }

        // Cleanup when modal closes
        return () => {
            if (!viewModalData && viewMapInstance.current) {
                viewMapInstance.current.remove();
                viewMapInstance.current = null;
            }
        };
    }, [viewModalData]);


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
        } catch (e) { alert("API Error: " + e.message); }
    };

    // --- FORM ACTIONS ---
    // Load Track into Editor
    const loadTrack = (trackId) => {
        if (!trackId) return;
        const t = tracks.find(x => x.id === trackId);
        if (t) {
            setPoints(t.points || []);
            setDistance(t.distance || '');
            if (t.type) setEditorMode(t.type);
            // We do NOT set name/time because this is a new Trip based on a template
            setRecordName(t.name + " (" + new Date().toLocaleDateString() + ")");
            // Auto calc if needed? No, let user confirm.
        }
        setSelectedTrackId(trackId);
    };

    const handleEditTrip = (record) => {
        setEditingId(record.id);
        setIsSavingTrack(false);
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
        setStartTime(''); setEndTime('');
        setRecordName(''); setWalkName('');
        setCalculatedDuration('');
        setSelectedTrackId('');
        setIsSavingTrack(false);
        if (polylineRef.current) polylineRef.current.remove();
    }

    const saveRecord = async () => {
        try {
            const isCar = editorMode === 'car';

            // Common Data
            const baseData = {
                type: editorMode,
                name: (isCar ? recordName : walkName) || "Senza Nome",
                distance: parseFloat(distance || 0),
                points,
                updatedAt: new Date().toISOString()
            };

            // TRACK vs TRIP
            if (isSavingTrack) {
                // SAVING AS REUSABLE TRACK
                await addDoc(collection(db, "users", auth.currentUser.uid, "drivelogbook", "tracks", "items"), {
                    ...baseData,
                    createdAt: new Date().toISOString()
                });
                alert("Tracciato salvato nei Preferiti!");
            } else {
                // SAVING AS TRIP LOG
                const durationMs = (isCar && startTime && endTime) ? (() => {
                    const s = new Date(`1970-01-01T${startTime}`);
                    const e = new Date(`1970-01-01T${endTime}`);
                    let d = e - s; if (d < 0) d += 86400000; return d;
                })() : 0;

                const v = isCar ? vehicles.find(x => x.id === selectedVehicle) : null;
                const tripData = {
                    ...baseData,
                    startTime: isCar ? startTime : null,
                    endTime: isCar ? endTime : null,
                    durationMs,
                    durationStr: calculatedDuration,
                    vehicleId: selectedVehicle,
                    vehicleName: v ? `${v.make} ${v.model}` : '?',
                    trackId: selectedTrackId || null
                };

                if (!editingId) tripData.createdAt = new Date().toISOString();

                if (editingId) {
                    await updateDoc(doc(db, "users", auth.currentUser.uid, "drivelogbook", "trips", "items", editingId), tripData);
                    alert("Viaggio Aggiornato!");
                } else {
                    await addDoc(collection(db, "users", auth.currentUser.uid, "drivelogbook", "trips", "items"), tripData);
                    alert("Viaggio Salvato!");
                }
            }

            handleReset();
            setActiveTab(isSavingTrack ? 'saved_tracks' : (isCar ? 'car_records' : 'walk_paths'));
        } catch (e) { alert(e.message); }
    };

    const deleteItem = async (collectionName, id) => {
        if (confirm("Eliminare definitivamente?")) await deleteDoc(doc(db, "users", auth.currentUser.uid, "drivelogbook", collectionName, "items", id));
    };

    // --- RENDER HELPERS ---
    useEffect(() => {
        if (startTime && endTime) {
            const s = new Date(`1970-01-01T${startTime}`);
            const e = new Date(`1970-01-01T${endTime}`);
            let d = e - s; if (d < 0) d += 86400000;
            const h = Math.floor(d / 3600000);
            const m = Math.floor((d % 3600000) / 60000);
            setCalculatedDuration(`${h}h ${m}m`);
        }
    }, [startTime, endTime]);

    if (loading) return null;

    const pageStyle = { '--color-accent': '#10b981', '--color-accent-hover': '#059669' };

    return (
        <div className="min-h-screen p-4 md:p-8 flex items-center justify-center bg-bgApp transition-opacity duration-300" style={pageStyle}>

            {/* Nav */}
            <div className="fixed top-6 right-6 z-50 flex gap-2">
                <Link to="/app" className="btn-secondary rounded-full px-4 py-2 text-xs font-semibold no-underline shadow-lg bg-cardDark hover:bg-white/10">🏠 Home</Link>
            </div>

            <div className="max-w-7xl w-full grid grid-cols-1 md:grid-cols-3 gap-6 pt-16 md:pt-0 h-[85vh]">

                {/* SIDEBAR */}
                <div className="bento-card col-span-1 p-6 flex flex-col justify-between h-full overflow-hidden">
                    <div className="flex flex-col gap-6 h-full">
                        <div>
                            <h1 className="text-3xl font-bold text-white mb-1 tracking-tight">Trip<span className="text-accent">Records</span></h1>
                            <p className="text-textMuted text-xs font-medium uppercase tracking-widest">Diario di Viaggio V2</p>
                        </div>

                        {/* Vertical Tabs */}
                        <div className="flex flex-col gap-2 overflow-y-auto pr-1 custom-scrollbar flex-shrink-0">
                            <button onClick={() => setActiveTab('car_records')} className={`text-left px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'car_records' ? 'bg-accent text-white shadow-lg' : 'bg-white/5 text-textMuted hover:bg-white/10 hover:text-white'}`}>🏎️ Auto ({carRecords.length})</button>
                            <button onClick={() => setActiveTab('walk_paths')} className={`text-left px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'walk_paths' ? 'bg-cyan-500 text-white shadow-lg' : 'bg-white/5 text-textMuted hover:bg-white/10 hover:text-white'}`}>🚶 Piedi ({walkRecords.length})</button>
                            <button onClick={() => setActiveTab('saved_tracks')} className={`text-left px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'saved_tracks' ? 'bg-purple-500 text-white shadow-lg' : 'bg-white/5 text-textMuted hover:bg-white/10 hover:text-white'}`}>🚩 Tracciati ({tracks.length})</button>
                            <button onClick={() => setActiveTab('editor')} className={`text-left px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'editor' ? 'bg-white text-black shadow-lg' : 'bg-white/5 text-textMuted hover:bg-white/10 hover:text-white'}`}>📝 Editor {editingId ? '(Modifica)' : ''}</button>
                            <button onClick={() => setActiveTab('data')} className={`text-left px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'data' ? 'bg-gray-500 text-white shadow-lg' : 'bg-white/5 text-textMuted hover:bg-white/10 hover:text-white'}`}>💾 Backup</button>
                        </div>

                        {/* Mini Stats Footer */}
                        <div className="mt-auto hidden md:block space-y-3 pt-4 border-t border-white/5">
                            <div className="flex justify-between text-xs text-textMuted"><span>Auto Km</span><span className="text-white font-mono">{carRecords.reduce((a, b) => a + (b.distance || 0), 0).toFixed(0)}</span></div>
                            <div className="flex justify-between text-xs text-textMuted"><span>Piedi Km</span><span className="text-white font-mono">{walkRecords.reduce((a, b) => a + (b.distance || 0), 0).toFixed(0)}</span></div>
                        </div>
                    </div>
                </div>

                {/* MAIN CONTENT */}
                <div className="bento-card col-span-1 md:col-span-2 p-6 relative flex flex-col h-full overflow-hidden">

                    {/* LISTS: CAR / WALK / TRACKS */}
                    {['car_records', 'walk_paths', 'saved_tracks'].includes(activeTab) && (
                        <div className="flex flex-col h-full">
                            <h2 className="text-xl font-bold text-white mb-6">
                                {activeTab === 'car_records' ? 'Storico Viaggi Auto' :
                                    activeTab === 'walk_paths' ? 'Storico Camminate' : 'Tracciati Salvati'}
                            </h2>
                            <div className="overflow-y-auto space-y-3 flex-1 pr-2 custom-scrollbar">
                                {(activeTab === 'car_records' ? carRecords : activeTab === 'walk_paths' ? walkRecords : tracks).map(r => (
                                    <div key={r.id} onClick={() => activeTab !== 'saved_tracks' && setViewModalData(r)} className="bg-bgApp p-4 rounded-xl border border-white/5 group hover:border-accent/50 transition-all cursor-pointer">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h3 className="font-bold text-white">{r.name || "Nessun Nome"}</h3>
                                                <div className="text-xs text-textMuted mt-1">
                                                    {activeTab === 'saved_tracks' ? 'Tracciato Riusabile' : `${new Date(r.createdAt || r.date).toLocaleDateString()} • ${r.durationStr || ''}`}
                                                </div>
                                            </div>
                                            <div className="text-accent font-mono font-bold text-lg">{r.distance} km</div>
                                        </div>

                                        <div className="mt-3 pt-3 border-t border-white/5 flex justify-between items-center" onClick={e => e.stopPropagation()}>
                                            <div className="flex gap-2">
                                                {activeTab === 'saved_tracks' && (
                                                    <button onClick={() => { loadTrack(r.id); setActiveTab('editor'); }} className="text-xs font-bold text-purple-400 hover:text-white bg-purple-500/10 px-2 py-1 rounded">USA</button>
                                                )}
                                            </div>
                                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {activeTab !== 'saved_tracks' && <button onClick={() => handleEditTrip(r)} className="text-xs font-bold text-accent hover:underline">MODIFICA</button>}
                                                <button onClick={() => deleteItem(activeTab === 'saved_tracks' ? 'tracks' : 'trips', r.id)} className="text-xs font-bold text-red-500 hover:underline">ELIMINA</button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {((activeTab === 'car_records' && carRecords.length === 0) || (activeTab === 'saved_tracks' && tracks.length === 0)) && (
                                    <div className="text-center text-textMuted py-10 opacity-50">Nessun elemento.</div>
                                )}
                            </div>
                            {activeTab === 'saved_tracks' && (
                                <button onClick={() => { handleReset(); setActiveTab('editor'); setIsSavingTrack(true); }} className="mt-4 w-full btn-secondary text-purple-400 border-purple-500/20 hover:bg-purple-500/10">
                                    + Crea Nuovo Tracciato
                                </button>
                            )}
                        </div>
                    )}

                    {/* EDITOR */}
                    {activeTab === 'editor' && (
                        <div className="flex flex-col h-full">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    {isSavingTrack ? '🚩 Nuovo Tracciato' : (editingId ? '✏️ Modifica Viaggio' : '🏎️ Nuovo Viaggio')}
                                </h2>
                                {!editingId && !isSavingTrack && (
                                    <select onChange={(e) => loadTrack(e.target.value)} value={selectedTrackId} className="bg-black/50 text-xs px-2 py-1 rounded border border-white/20 text-textMuted outline-none">
                                        <option value="">📂 Carica Tracciato...</option>
                                        {tracks.map(t => <option key={t.id} value={t.id}>{t.name} ({t.distance}km)</option>)}
                                    </select>
                                )}
                            </div>

                            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
                                {/* Map with Mobile Fix (min-h) */}
                                <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-black/50 min-h-[300px] lg:min-h-0">
                                    <div ref={mapContainerRef} className="w-full h-full z-0"></div>

                                    <div className="absolute top-4 left-4 z-[400] bg-black/80 backdrop-blur p-1 rounded-lg flex gap-1">
                                        <button onClick={() => setEditorMode('car')} className={`px-3 py-1 rounded text-[10px] font-bold ${editorMode === 'car' ? 'bg-emerald-500 text-black' : 'text-gray-400'}`}>AUTO</button>
                                        <button onClick={() => setEditorMode('walk')} className={`px-3 py-1 rounded text-[10px] font-bold ${editorMode === 'walk' ? 'bg-cyan-500 text-black' : 'text-gray-400'}`}>PIEDI</button>
                                    </div>
                                    <div className="absolute bottom-4 right-4 z-[400]">
                                        <button onClick={handleReset} className="px-3 py-1 bg-red-500/20 text-red-500 text-[10px] font-bold rounded backdrop-blur">RESET</button>
                                    </div>
                                </div>

                                {/* Editor Form */}
                                <div className="overflow-y-auto pr-2 custom-scrollbar flex flex-col gap-4">

                                    {/* Info Box */}
                                    <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                                        <div className="flex justify-between items-end mb-2">
                                            <span className="text-[10px] uppercase text-textMuted font-bold">Distanza</span>
                                            <span className="text-2xl font-mono font-bold text-white">{distance || '0.00'} <span className="text-sm text-gray-500">km</span></span>
                                        </div>
                                        <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                                            {points.map((_, i) => (
                                                <div key={i} className="px-1.5 py-0.5 bg-white/10 rounded text-[9px] text-gray-400 flex items-center gap-1">
                                                    {i + 1} <span onClick={() => setPoints(p => p.filter((_, x) => x !== i))} className="cursor-pointer hover:text-red-400">×</span>
                                                </div>
                                            ))}
                                            {points.length === 0 && <span className="text-[10px] text-gray-600">Mappa vuota</span>}
                                        </div>
                                    </div>

                                    {editorMode === 'car' && (
                                        <button onClick={calculateRoute} disabled={points.length < 2} className="w-full btn-secondary py-2 text-xs border-accent/20 text-accent hover:bg-accent/10">
                                            ⚡ Calcola Percorso
                                        </button>
                                    )}

                                    <div className="space-y-3 pt-2">
                                        <div>
                                            <label className="input-label">Nome {isSavingTrack ? 'Tracciato' : 'Viaggio'}</label>
                                            <input type="text" value={isSavingTrack ? recordName : (editorMode === 'car' ? recordName : walkName)} onChange={e => isSavingTrack ? setRecordName(e.target.value) : (editorMode === 'car' ? setRecordName(e.target.value) : setWalkName(e.target.value))} className="input-field" placeholder={isSavingTrack ? "Es. Giro Scuola" : "Es. Viaggio di oggi"} />
                                        </div>

                                        {!isSavingTrack && editorMode === 'car' && (
                                            <>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div><label className="input-label">Inizio</label><input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="input-field" /></div>
                                                    <div><label className="input-label">Fine</label><input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="input-field" /></div>
                                                </div>
                                                <div>
                                                    <label className="input-label">Veicolo</label>
                                                    <select value={selectedVehicle} onChange={e => setSelectedVehicle(e.target.value)} className="input-field">
                                                        <option value="">Seleziona...</option>
                                                        {vehicles.map(v => <option key={v.id} value={v.id}>{v.make} {v.model}</option>)}
                                                    </select>
                                                </div>
                                                <div className="text-center text-accent text-xs font-bold pt-1">{calculatedDuration && `Durata: ${calculatedDuration}`}</div>
                                            </>
                                        )}
                                    </div>

                                    <div className="mt-auto">
                                        {!editingId && !isSavingTrack && (
                                            <div className="flex items-center gap-2 mb-2 justify-center">
                                                <input type="checkbox" checked={isSavingTrack} onChange={e => setIsSavingTrack(e.target.checked)} className="accent-purple-500" />
                                                <span className="text-xs text-textMuted">Salva come Tracciato Preferito</span>
                                            </div>
                                        )}
                                        <button onClick={saveRecord} className="w-full btn-primary py-3">
                                            {isSavingTrack ? "Salva Tracciato" : (editingId ? "Aggiorna Viaggio" : "Salva Viaggio")}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* VIEW TRIP MODAL */}
            {viewModalData && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[1000] flex items-center justify-center p-4" onClick={() => setViewModalData(null)}>
                    <div className="bg-cardDark w-full max-w-4xl h-[80vh] rounded-[32px] border border-white/10 shadow-2xl flex flex-col md:flex-row overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>

                        {/* Map Portion */}
                        <div className="w-full md:w-2/3 h-[40vh] md:h-full relative bg-black/50">
                            <div ref={viewMapContainerRef} className="w-full h-full"></div>
                        </div>

                        {/* Details Portion */}
                        <div className="w-full md:w-1/3 p-6 flex flex-col bg-bgApp/50 backdrop-blur-md">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h3 className="text-2xl font-bold text-white">{viewModalData.name}</h3>
                                    <p className="text-sm text-textMuted">{new Date(viewModalData.createdAt).toLocaleDateString()}</p>
                                </div>
                                <button onClick={() => setViewModalData(null)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20">✕</button>
                            </div>

                            <div className="space-y-6 flex-1">
                                <div className="bento-card p-4">
                                    <div className="text-xs text-textMuted uppercase font-bold">Distanza</div>
                                    <div className="text-3xl font-mono font-bold text-accent">{viewModalData.distance} km</div>
                                </div>

                                {viewModalData.type === 'car' && (
                                    <>
                                        <div className="bento-card p-4">
                                            <div className="text-xs text-textMuted uppercase font-bold">Durata</div>
                                            <div className="text-xl font-bold text-white">{viewModalData.durationStr || '--'}</div>
                                            <div className="text-xs text-gray-500 mt-1">{viewModalData.startTime} - {viewModalData.endTime}</div>
                                        </div>
                                        <div className="bento-card p-4">
                                            <div className="text-xs text-textMuted uppercase font-bold">Veicolo</div>
                                            <div className="text-lg font-bold text-white">{viewModalData.vehicleName || 'Sconosciuto'}</div>
                                        </div>
                                    </>
                                )}
                            </div>

                            <button onClick={() => { loadTrack(viewModalData.id) || setPoints(viewModalData.points); setViewModalData(null); setActiveTab('editor'); }} className="mt-6 w-full btn-secondary text-xs">
                                📋 Usa questo percorso per nuovo viaggio
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
