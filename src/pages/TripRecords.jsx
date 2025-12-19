
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, getDocs, doc, deleteDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Imports for Leaflet icons fixes
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

const pageStyle = {
    '--color-accent': '#10b981', // Emerald-500
    '--color-accent-hover': '#059669', // Emerald-600
    backgroundColor: '#09090b',
    backgroundImage: `
        radial-gradient(at 0% 0%, rgba(16, 185, 129, 0.15) 0px, transparent 50%),
        radial-gradient(at 100% 100%, rgba(59, 130, 246, 0.1) 0px, transparent 50%)
    `,
    fontFamily: '"Inter", sans-serif'
};

export default function TripRecords() {
    const navigate = useNavigate();

    // Data State
    const [vehicles, setVehicles] = useState([]);
    const [carRecords, setCarRecords] = useState([]);
    const [walkRecords, setWalkRecords] = useState([]);
    const [loading, setLoading] = useState(true);

    // UI State
    const [activeTab, setActiveTab] = useState('car_records'); // car_records, walk_paths, editor
    const [editorMode, setEditorMode] = useState('car'); // car (route), walk (polyline)

    // Editor State
    const [mapCenter, setMapCenter] = useState([41.9028, 12.4964]); // Rome
    const [points, setPoints] = useState([]); // Array of {lat, lng}
    const [routeData, setRouteData] = useState(null); // Result from API (distance, duration, geometry)

    // Form State - Car
    const [selectedVehicle, setSelectedVehicle] = useState('');
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [calculatedDuration, setCalculatedDuration] = useState(''); // HH:MM
    const [recordName, setRecordName] = useState('');

    // Form State - Walk
    const [walkName, setWalkName] = useState('');

    // Refs
    const mapRef = useRef(null);
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
        // Load Vehicles
        const vehRef = doc(db, "users", uid, "car_finance", "main");
        onSnapshot(vehRef, (snap) => {
            if (snap.exists()) setVehicles(snap.data().vehicles || []);
        });

        // Load Trips (Filter in memory for now)
        const tripsRef = collection(db, "users", uid, "drivelogbook", "trips", "items");
        onSnapshot(tripsRef, (snap) => {
            const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setCarRecords(all.filter(t => t.type === 'car').sort((a, b) => (a.durationMs || 0) - (b.durationMs || 0))); // Best times first
            setWalkRecords(all.filter(t => t.type === 'walk').sort((a, b) => (b.distance || 0) - (a.distance || 0))); // Longest dist first
            setLoading(false);
        }, (err) => {
            console.error(err);
            setLoading(false);
        });
    };

    // --- MAP LOGIC ---
    useEffect(() => {
        if (activeTab === 'editor' && !mapInstance.current) {
            // Init Map
            mapInstance.current = L.map('editorMap').setView(mapCenter, 13);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; OpenStreetMap &copy; CartoDB'
            }).addTo(mapInstance.current);

            mapInstance.current.on('click', (e) => {
                handleMapClick(e.latlng);
            });
        }

        // Cleanup map on unmount or tab switch causing unmount
        return () => {
            if (activeTab !== 'editor' && mapInstance.current) {
                mapInstance.current.remove();
                mapInstance.current = null;
                markersRef.current = [];
                polylineRef.current = null;
            }
        };
    }, [activeTab]);

    useEffect(() => {
        if (!mapInstance.current) return;
        renderMapElements();
    }, [points, routeData]);

    const handleMapClick = (latlng) => {
        setPoints(prev => [...prev, latlng]);
    };

    const renderMapElements = () => {
        // Clear previous
        markersRef.current.forEach(m => m.remove());
        markersRef.current = [];
        if (polylineRef.current) {
            polylineRef.current.remove();
            polylineRef.current = null;
        }

        // Markers
        points.forEach((p, idx) => {
            const m = L.marker([p.lat, p.lng], { draggable: true })
                .bindPopup(idx === 0 ? "Start" : (idx === points.length - 1 ? "End" : `WP ${idx}`))
                .addTo(mapInstance.current);

            m.on('dragend', (e) => {
                const newPos = e.target.getLatLng();
                setPoints(prev => {
                    const next = [...prev];
                    next[idx] = newPos;
                    return next;
                });
            });
            markersRef.current.push(m);
        });

        // Route / Line
        if (editorMode === 'walk' && points.length > 1) {
            // Simple Polyline
            polylineRef.current = L.polyline(points, { color: 'cyan' }).addTo(mapInstance.current);
            // Calc distance
            let dist = 0;
            for (let i = 0; i < points.length - 1; i++) {
                dist += mapInstance.current.distance(points[i], points[i + 1]);
            }
            setDistance((dist / 1000).toFixed(2));

        } else if (editorMode === 'car' && points.length > 1) {
            // Calc Route via API
            if (routeData && routeData.geometry) {
                const decoded = L.Polyline.fromEncoded(routeData.geometry).getLatLngs();
                polylineRef.current = L.polyline(decoded, { color: '#10b981', weight: 5 }).addTo(mapInstance.current);
            }
        }
    };

    const calculateRoute = async () => {
        if (points.length < 2) return;

        try {
            const coords = points.map(p => [p.lng, p.lat]);
            const body = {
                coordinates: coords,
                radiuses: points.map(() => -1) // -1 is infinity/default
            };

            const response = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
                method: 'POST',
                headers: {
                    'Authorization': API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) throw new Error('Route API failed');

            const json = await response.json();
            const feature = json.features[0];
            const props = feature.properties;
            const geo = feature.geometry;

            // Extract encoded polyline (if geojson returns coordinates, use those. ORS returns coordinates in geojson)
            // Actually ORS GeoJSON returns coordinates array. Leaflet needs [lat, lng], ORS gives [lng, lat].
            const latlngs = geo.coordinates.map(c => [c[1], c[0]]);

            if (polylineRef.current) polylineRef.current.remove();
            polylineRef.current = L.polyline(latlngs, { color: '#10b981', weight: 5 }).addTo(mapInstance.current);
            mapInstance.current.fitBounds(polylineRef.current.getBounds(), { padding: [50, 50] });

            setDistance((props.summary.distance / 1000).toFixed(2));
            // Assuming we don't use API duration for records (user inputs time), but we could show estimated
        } catch (error) {
            console.error(error);
            alert("Errore calcolo rotta");
        }
    };

    // --- FORM LOGIC ---
    useEffect(() => {
        if (startTime && endTime) {
            const start = new Date(`1970-01-01T${startTime}`);
            const end = new Date(`1970-01-01T${endTime}`);
            let diff = end - start;
            if (diff < 0) diff += 24 * 60 * 60 * 1000; // Handle over midnight

            const hours = Math.floor(diff / 3600000);
            const minutes = Math.floor((diff % 3600000) / 60000);
            setCalculatedDuration(`${hours}h ${minutes}m`);
        }
    }, [startTime, endTime]);

    const saveRecord = async () => {
        if (!auth.currentUser) return;

        try {
            const isCar = editorMode === 'car';
            const durationMs = (isCar && startTime && endTime) ? (() => {
                const s = new Date(`1970-01-01T${startTime}`);
                const e = new Date(`1970-01-01T${endTime}`);
                let d = e - s;
                if (d < 0) d += 86400000;
                return d;
            })() : 0;

            const docData = {
                type: editorMode,
                name: isCar ? recordName : walkName,
                distance: parseFloat(distance),
                points: points, // basic points
                createdAt: new Date().toISOString(),
                isPublic: false // Default private
            };

            if (isCar) {
                // Find vehicle name
                const v = vehicles.find(veh => veh.id === selectedVehicle);
                Object.assign(docData, {
                    startTime,
                    endTime,
                    durationMs,
                    durationStr: calculatedDuration,
                    vehicleId: selectedVehicle,
                    vehicleName: v ? `${v.make} ${v.model}` : 'Sconosciuto'
                });
            }

            await addDoc(collection(db, "users", auth.currentUser.uid, "drivelogbook", "trips", "items"), docData);

            // Reset
            setPoints([]);
            setDistance('');
            setStartTime('');
            setEndTime('');
            setRecordName('');
            setWalkName('');
            setActiveTab(isCar ? 'car_records' : 'walk_paths');
            alert("Salvato!");
        } catch (e) {
            console.error(e);
            alert("Errore salvataggio");
        }
    };

    const deleteRecord = async (id) => {
        if (!confirm("Eliminare?")) return;
        try {
            await deleteDoc(doc(db, "users", auth.currentUser.uid, "drivelogbook", "trips", "items", id));
        } catch (e) { alert("Errore"); }
    };

    // --- RENDER ---
    return (
        <div style={pageStyle} className="min-h-screen text-white p-4 md:p-8">
            {/* Header */}
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                        <span className="text-4xl">⏱️</span> TripRecords
                    </h1>
                    <p className="text-sm text-gray-400">Traccia tempi e percorsi</p>
                </div>
                <button onClick={() => navigate('/app')} className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-sm font-bold transition-all">
                    🏠 Home
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-4 mb-6 border-b border-white/10 pb-4 overflow-x-auto">
                <button onClick={() => setActiveTab('car_records')} className={`px-4 py-2 rounded-lg font-bold whitespace-nowrap transition-all ${activeTab === 'car_records' ? 'bg-emerald-500 text-black' : 'text-gray-400 hover:text-white'}`}>
                    🏎️ Record Auto ({carRecords.length})
                </button>
                <button onClick={() => setActiveTab('walk_paths')} className={`px-4 py-2 rounded-lg font-bold whitespace-nowrap transition-all ${activeTab === 'walk_paths' ? 'bg-cyan-500 text-black' : 'text-gray-400 hover:text-white'}`}>
                    🚶 Percorsi Piedi ({walkRecords.length})
                </button>
                <button onClick={() => setActiveTab('editor')} className={`px-4 py-2 rounded-lg font-bold whitespace-nowrap transition-all ${activeTab === 'editor' ? 'bg-white text-black' : 'text-gray-400 hover:text-white'}`}>
                    📝 Editor / Nuovo
                </button>
            </div>

            {/* CONTENT */}

            {/* CAR RECORDS */}
            {activeTab === 'car_records' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {carRecords.map((r, i) => (
                        <div key={r.id} className="bg-white/5 border border-white/10 p-4 rounded-xl relative overflow-hidden group hover:border-emerald-500/50 transition-all">
                            {i < 3 && <div className="absolute top-0 right-0 bg-yellow-500 text-black text-[10px] font-bold px-2 py-0.5 rounded-bl-lg">TOP {i + 1}</div>}
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="font-bold text-lg">{r.name || "Tragitto"}</h3>
                                <div className="text-emerald-400 font-mono font-bold text-xl">{r.durationStr}</div>
                            </div>
                            <div className="text-sm text-gray-400 mb-4 flex gap-4">
                                <span>📅 {new Date(r.createdAt).toLocaleDateString()}</span>
                                <span>📏 {r.distance} km</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span className="px-2 py-1 rounded bg-white/10 text-white">{r.vehicleName}</span>
                                <button onClick={() => deleteRecord(r.id)} className="text-red-500 hover:text-red-400">🗑️</button>
                            </div>
                        </div>
                    ))}
                    {carRecords.length === 0 && <div className="col-span-full text-center text-gray-500 py-10">Nessun record auto.</div>}
                </div>
            )}

            {/* WALK PATHS */}
            {activeTab === 'walk_paths' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {walkRecords.map(r => (
                        <div key={r.id} className="bg-white/5 border border-white/10 p-4 rounded-xl hover:border-cyan-500/50 transition-all">
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="font-bold text-lg">{r.name || "Percorso"}</h3>
                                <div className="text-cyan-400 font-mono font-bold text-xl">{r.distance} km</div>
                            </div>
                            <div className="text-sm text-gray-400 mb-4">
                                <span>📅 {new Date(r.createdAt).toLocaleDateString()}</span>
                            </div>
                            <div className="flex justify-end">
                                <button onClick={() => deleteRecord(r.id)} className="text-red-500 hover:text-red-400 text-xs">🗑️ Elimina</button>
                            </div>
                        </div>
                    ))}
                    {walkRecords.length === 0 && <div className="col-span-full text-center text-gray-500 py-10">Nessun percorso a piedi.</div>}
                </div>
            )}

            {/* EDITOR */}
            {activeTab === 'editor' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 h-[600px] gap-6">
                    {/* Left: Map */}
                    <div className="lg:col-span-2 relative rounded-2xl overflow-hidden border border-white/10">
                        <div id="editorMap" className="w-full h-full bg-black/50"></div>
                        <div className="absolute top-4 left-4 z-[500] flex gap-2">
                            <button onClick={() => setEditorMode('car')} className={`px-4 py-2 rounded-lg font-bold shadow-lg ${editorMode === 'car' ? 'bg-emerald-500 text-white' : 'bg-white text-black'}`}>Auto 🏎️</button>
                            <button onClick={() => setEditorMode('walk')} className={`px-4 py-2 rounded-lg font-bold shadow-lg ${editorMode === 'walk' ? 'bg-cyan-500 text-white' : 'bg-white text-black'}`}>Piedi 🚶</button>
                        </div>
                        <div className="absolute bottom-4 left-4 z-[500] bg-black/80 p-2 rounded-lg text-xs text-textMuted max-w-xs">
                            Clicca sulla mappa per aggiungere punti.<br />Auto: Minimo 2 punti per calcolare rotta.<br />Piedi: Disegna il percorso punto per punto.
                        </div>
                    </div>

                    {/* Right: Controls */}
                    <div className="lg:col-span-1 bg-white/5 border border-white/10 rounded-2xl p-6 overflow-y-auto">
                        <h3 className="text-xl font-bold mb-6 text-white border-b border-white/10 pb-4">
                            {editorMode === 'car' ? "Nuovo Record Auto" : "Nuovo Percorso Piedi"}
                        </h3>

                        {/* List Points */}
                        <div className="mb-6 space-y-2">
                            <label className="text-xs uppercase font-bold text-gray-500">Waypoints ({points.length})</label>
                            <div className="flex flex-wrap gap-2">
                                {points.map((p, i) => (
                                    <span key={i} className="bg-white/10 px-2 py-1 rounded text-xs flex items-center gap-1">
                                        WP {i + 1} <button onClick={() => setPoints(prev => prev.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-300">x</button>
                                    </span>
                                ))}
                                <button onClick={() => setPoints([])} className="text-xs text-red-500 underline ml-auto">Reset</button>
                            </div>
                        </div>

                        {editorMode === 'car' && (
                            <div className="space-y-4">
                                <button onClick={calculateRoute} disabled={points.length < 2} className="w-full py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/50 rounded-lg font-bold transition-all disabled:opacity-50">
                                    📍 Calcola Rotta & Km
                                </button>

                                <div>
                                    <label className="text-xs uppercase font-bold text-gray-500 block mb-1">Nome Tragitto</label>
                                    <input type="text" value={recordName} onChange={e => setRecordName(e.target.value)} placeholder="Es. Casa - Lavoro" className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white focus:border-emerald-500 outline-none" />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs uppercase font-bold text-gray-500 block mb-1">Partenza</label>
                                        <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-xs uppercase font-bold text-gray-500 block mb-1">Arrivo</label>
                                        <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white outline-none" />
                                    </div>
                                </div>

                                <div className="bg-emerald-500/10 p-4 rounded-lg border border-emerald-500/20 text-center">
                                    <div className="text-xs text-emerald-400 uppercase">Durata Calcolata</div>
                                    <div className="text-2xl font-bold text-white">{calculatedDuration || "--:--"}</div>
                                </div>

                                <div>
                                    <label className="text-xs uppercase font-bold text-gray-500 block mb-1">Veicolo</label>
                                    <select value={selectedVehicle} onChange={e => setSelectedVehicle(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white outline-none">
                                        <option value="">Seleziona...</option>
                                        {vehicles.map(v => (
                                            <option key={v.id} value={v.id}>{v.make} {v.model}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-xs uppercase font-bold text-gray-500 block mb-1">Distanza Totale (Km)</label>
                                    <input type="number" readOnly value={distance} className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-gray-400 outline-none cursor-not-allowed" />
                                </div>
                            </div>
                        )}

                        {editorMode === 'walk' && (
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs uppercase font-bold text-gray-500 block mb-1">Nome Percorso</label>
                                    <input type="text" value={walkName} onChange={e => setWalkName(e.target.value)} placeholder="Es. Giro del parco" className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white focus:border-cyan-500 outline-none" />
                                </div>
                                <div className="bg-cyan-500/10 p-4 rounded-lg border border-cyan-500/20 text-center">
                                    <div className="text-xs text-cyan-400 uppercase">Distanza</div>
                                    <div className="text-2xl font-bold text-white">{distance || "0.00"} <span className="text-sm text-gray-400">km</span></div>
                                </div>
                            </div>
                        )}

                        <button onClick={saveRecord} className="w-full py-3 mt-8 bg-white text-black font-bold rounded-xl hover:bg-gray-200 transition-all shadow-lg">
                            💾 Salva {editorMode === 'car' ? 'Record' : 'Percorso'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
