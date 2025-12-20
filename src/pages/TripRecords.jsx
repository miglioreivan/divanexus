import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth'; // Added signOut import
import { collection, addDoc, doc, deleteDoc, updateDoc, onSnapshot, getDocs } from 'firebase/firestore';
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
    const [viewModalData, setViewModalData] = useState(null);

    // Live Trip State
    const [isLiveTrip, setIsLiveTrip] = useState(false);
    const [liveStartTime, setLiveStartTime] = useState(null);

    // Editor State
    const [editingId, setEditingId] = useState(null);
    const [isSavingTrack, setIsSavingTrack] = useState(false);

    const [points, setPoints] = useState([]);
    const [distance, setDistance] = useState('');
    const [calculatedDuration, setCalculatedDuration] = useState('');

    // Editor Inputs
    const [recordName, setRecordName] = useState('');
    const [selectedVehicle, setSelectedVehicle] = useState('');
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [walkName, setWalkName] = useState('');
    const [selectedTrackId, setSelectedTrackId] = useState('');

    // Refs
    const mapContainerRef = useRef(null);
    const viewMapContainerRef = useRef(null);
    const mapInstance = useRef(null);
    const viewMapInstance = useRef(null);
    const markersRef = useRef([]);
    const polylineRef = useRef(null);
    const viewPolylineRef = useRef(null);
    const fileInputRef = useRef(null); // Added for Backup Import functionality

    // --- INIT ---
    useEffect(() => {
        // Check Live Trip Logic on Mount
        const storedStart = localStorage.getItem('nexus_trip_start');
        if (storedStart) {
            const date = new Date(storedStart);
            const today = new Date();
            // Middleware Midnight Cleanup
            if (date.getDate() !== today.getDate() || date.getMonth() !== today.getMonth()) {
                localStorage.removeItem('nexus_trip_start');
                localStorage.removeItem('nexus_trip_coords');
                setIsLiveTrip(false);
            } else {
                setIsLiveTrip(true);
                setLiveStartTime(date);
            }
        }

        const unsubAuth = onAuthStateChanged(auth, (user) => {
            if (user) loadData(user.uid);
            else navigate('/');
        });
        return () => unsubAuth();
    }, [navigate]);

    const normalizePoints = (data) => {
        // Handle legacy "wayPoints" or direct "points"
        let raw = data.points || data.wayPoints || [];
        if (!Array.isArray(raw)) return [];
        // Convert [lat,lng] arrays to {lat,lng} objects if needed
        return raw.map(p => {
            if (Array.isArray(p)) return { lat: p[0], lng: p[1] };
            return p;
        }).filter(p => p && typeof p.lat === 'number');
    };

    const loadData = (uid) => {
        // Vehicles
        onSnapshot(doc(db, "users", uid, "car_finance", "main"), (s) => {
            if (s.exists()) setVehicles(s.data().vehicles || []);
        });

        // Trips
        onSnapshot(collection(db, "users", uid, "drivelogbook", "trips", "items"), (s) => {
            const data = s.docs.map(d => {
                const item = d.data();
                return {
                    id: d.id,
                    ...item,
                    points: normalizePoints(item) // Fix legacy data
                };
            });
            setCarRecords(data.filter(t => t.type === 'car' || !t.type).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
            setWalkRecords(data.filter(t => t.type === 'walk').sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
            setLoading(false);
        });

        // Tracks
        onSnapshot(collection(db, "users", uid, "drivelogbook", "tracks", "items"), (s) => {
            const t = s.docs.map(d => ({ id: d.id, ...d.data(), points: normalizePoints(d.data()) }));
            setTracks(t);
        });
    };

    // --- LIVE TRACKING ---
    const startLiveTrip = () => {
        if (!navigator.geolocation) { alert("GPS non supportato"); return; }
        navigator.geolocation.getCurrentPosition(pos => {
            const { latitude, longitude } = pos.coords;
            const now = new Date();
            localStorage.setItem('nexus_trip_start', now.toISOString());
            localStorage.setItem('nexus_trip_coords', JSON.stringify({ lat: latitude, lng: longitude }));
            setIsLiveTrip(true);
            setLiveStartTime(now);
            alert("Viaggio Iniziato! 🚀");
        }, err => alert("Errore GPS: " + err.message));
    };

    const endLiveTrip = () => {
        if (!navigator.geolocation) { alert("GPS non supportato"); return; }
        navigator.geolocation.getCurrentPosition(pos => {
            const { latitude, longitude } = pos.coords;
            const startStr = localStorage.getItem('nexus_trip_start');
            const startCoordsStr = localStorage.getItem('nexus_trip_coords');

            if (!startStr || !startCoordsStr) {
                alert("Errore dati locale. Riprova.");
                setIsLiveTrip(false);
                return;
            }

            const startDate = new Date(startStr);
            const startPt = JSON.parse(startCoordsStr);
            const endPt = { lat: latitude, lng: longitude };
            const endDate = new Date();

            // Setup Editor
            handleReset();
            setEditorMode('car');
            setStartTime(startDate.toTimeString().slice(0, 5)); // HH:MM
            setEndTime(endDate.toTimeString().slice(0, 5));
            setPoints([startPt, endPt]);

            // Cleanup
            localStorage.removeItem('nexus_trip_start');
            localStorage.removeItem('nexus_trip_coords');
            setIsLiveTrip(false);
            setLiveStartTime(null);

            setActiveTab('editor');
            alert("Viaggio terminato! Ora calcola il percorso e salva.");

        }, err => alert("Errore GPS: " + err.message));
    };

    // --- MAP ENGINE ---
    useEffect(() => {
        if (activeTab === 'editor') {
            if (!mapInstance.current && mapContainerRef.current) {
                mapInstance.current = L.map(mapContainerRef.current).setView([41.9028, 12.4964], 13);
                L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '© OpenStreetMap' }).addTo(mapInstance.current);
                mapInstance.current.on('click', (e) => setPoints(prev => [...prev, e.latlng]));
            }
            setTimeout(() => mapInstance.current?.invalidateSize(), 200);
        }
        return () => {
            if (activeTab === 'editor' && mapInstance.current) {
                mapInstance.current.remove();
                mapInstance.current = null;
            }
        };
    }, [activeTab]);

    useEffect(() => {
        if (!mapInstance.current) return;
        markersRef.current.forEach(m => m.remove());
        markersRef.current = [];
        if (polylineRef.current) polylineRef.current.remove();

        points.forEach((p, i) => {
            const label = i === 0 ? "Start" : (i === points.length - 1 ? "End" : `WP ${i}`);
            const m = L.marker([p.lat, p.lng], { draggable: true }).bindPopup(label).addTo(mapInstance.current);
            m.on('dragend', (e) => {
                const newPos = e.target.getLatLng();
                setPoints(prev => { const n = [...prev]; n[i] = newPos; return n; });
            });
            markersRef.current.push(m);
        });

        if (points.length > 1) {
            // Draw raw line if walk or just pure geometry
            // For car we usually await calc, but showing direct line helps visualize order
            if (editorMode === 'walk' || points.length === 2 && !distance) {
                polylineRef.current = L.polyline(points, { color: editorMode === 'walk' ? '#06b6d4' : '#10b981', weight: 4, dashArray: editorMode === 'car' ? '10,10' : null }).addTo(mapInstance.current);
                if (editorMode === 'walk') {
                    let d = 0;
                    for (let i = 0; i < points.length - 1; i++) d += mapInstance.current.distance(points[i], points[i + 1]);
                    setDistance((d / 1000).toFixed(2));
                }
            }
        }
    }, [points, editorMode]);

    useEffect(() => {
        if (viewModalData && viewMapContainerRef.current) {
            if (!viewMapInstance.current) {
                viewMapInstance.current = L.map(viewMapContainerRef.current).setView([41.9028, 12.4964], 13);
                L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '© OpenStreetMap' }).addTo(viewMapInstance.current);
            }
            if (viewPolylineRef.current) viewPolylineRef.current.remove();
            viewMapInstance.current.eachLayer((layer) => { if (layer instanceof L.Marker) layer.remove(); });

            const p = viewModalData.points || [];
            if (p.length > 0) {
                viewPolylineRef.current = L.polyline(p, { color: viewModalData.type === 'walk' ? '#06b6d4' : '#10b981', weight: 5 }).addTo(viewMapInstance.current);
                viewMapInstance.current.fitBounds(viewPolylineRef.current.getBounds(), { padding: [50, 50] });
                p.forEach((pt) => L.marker([pt.lat, pt.lng]).addTo(viewMapInstance.current));
            }
            setTimeout(() => viewMapInstance.current.invalidateSize(), 200);
        }
        return () => {
            if (!viewModalData && viewMapInstance.current) {
                viewMapInstance.current.remove();
                viewMapInstance.current = null;
            }
        };
    }, [viewModalData]);

    const decodePolyline = (e) => {
        var t = [], n = 0, r = 0, i = 0; while (n < e.length) { var s = 0, o = 0, u; do { u = e.charCodeAt(n++) - 63, o |= (31 & u) << s, s += 5 } while (u >= 32); var a = 1 & o ? ~(o >> 1) : o >> 1; r += a, s = 0, o = 0; do { u = e.charCodeAt(n++) - 63, o |= (31 & u) << s, s += 5 } while (u >= 32); var f = 1 & o ? ~(o >> 1) : o >> 1; i += f, t.push([r / 1e5, i / 1e5]) } return t;
    };

    const calculateRoute = async () => {
        if (points.length < 2) return;
        try {
            const coords = points.map(p => [p.lng, p.lat]);
            // Use standard endpoint instead of geojson to match legacy key permissions
            const res = await fetch('https://api.openrouteservice.org/v2/directions/driving-car', {
                method: 'POST',
                headers: { 'Authorization': API_KEY, 'Content-Type': 'application/json' },
                body: JSON.stringify({ coordinates: coords })
            });
            const json = await res.json();

            if (json.routes && json.routes.length) {
                const route = json.routes[0];
                const poly = decodePolyline(route.geometry); // Decode the string geometry

                if (polylineRef.current) polylineRef.current.remove();
                polylineRef.current = L.polyline(poly, { color: '#10b981', weight: 5 }).addTo(mapInstance.current);
                mapInstance.current.fitBounds(polylineRef.current.getBounds(), { padding: [50, 50] });

                setDistance((route.summary.distance / 1000).toFixed(2));
            } else {
                throw new Error("Nessuna rotta trovata");
            }
        } catch (e) { alert("API Error: " + e.message); }
    };

    const loadTrack = (trackId) => {
        if (!trackId) return;
        const t = tracks.find(x => x.id === trackId);
        if (t) {
            setPoints(t.points || []);
            setDistance(t.distance || '');
            if (t.type) setEditorMode(t.type);
            setRecordName(t.name + " (" + new Date().toLocaleDateString() + ")");
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
            const baseData = {
                type: editorMode,
                name: (isCar ? recordName : walkName) || "Senza Nome",
                distance: parseFloat(distance || 0),
                points,
                updatedAt: new Date().toISOString()
            };

            if (isSavingTrack) {
                await addDoc(collection(db, "users", auth.currentUser.uid, "drivelogbook", "tracks", "items"), { ...baseData, createdAt: new Date().toISOString() });
                alert("Tracciato salvato!");
            } else {
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
                    alert("Aggiornato!");
                } else {
                    await addDoc(collection(db, "users", auth.currentUser.uid, "drivelogbook", "trips", "items"), tripData);
                    alert("Salvato!");
                }
            }
            handleReset();
            setActiveTab(isSavingTrack ? 'saved_tracks' : (isCar ? 'car_records' : 'walk_paths'));
        } catch (e) { alert(e.message); }
    };

    const deleteItem = async (collectionName, id) => {
        if (!confirm("Eliminare definitivamente questo elemento?")) return;
        try {
            await deleteDoc(doc(db, "users", auth.currentUser.uid, "drivelogbook", collectionName, "items", id));
        } catch (e) {
            console.error(e);
            alert("Errore eliminazione: " + e.message + "\nControlla di aver aggiornato le Regole Firebase!");
        }
    };

    const handleDeleteAllData = async () => {
        if (!confirm("ATTENZIONE: Stai per eliminare TUTTI i tuoi viaggi e tracciati.\n\nQuesta azione è IRREVERSIBILE.\n\nSei sicuro?")) return;
        if (!confirm("Conferma finale: ELIMINA TUTTO?")) return;

        setLoading(true);
        try {
            const batch = []; // Note: batch size limit is 500, simple approach for now or loose promises
            // Since we might have many docs, let's just do parallel promises for simplicity in this artifact

            const p1 = getDocs(collection(db, "users", auth.currentUser.uid, "drivelogbook", "trips", "items"));
            const p2 = getDocs(collection(db, "users", auth.currentUser.uid, "drivelogbook", "tracks", "items"));

            const [snapTrips, snapTracks] = await Promise.all([p1, p2]);

            const promises = [
                ...snapTrips.docs.map(d => deleteDoc(d.ref)),
                ...snapTracks.docs.map(d => deleteDoc(d.ref))
            ];

            await Promise.all(promises);
            alert("Tutti i dati sono stati eliminati.");
        } catch (e) {
            alert("Errore durante l'eliminazione totale: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    // --- BACKUP LOGIC ---
    const handleExportJSON = () => {
        const data = {
            trips: [...carRecords, ...walkRecords],
            tracks: tracks,
            exportedAt: new Date().toISOString(),
            version: "v2"
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nexus_backup_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImport = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const json = JSON.parse(event.target.result);
                let count = 0;

                // Import Trips
                if (json.trips && Array.isArray(json.trips)) {
                    for (const t of json.trips) {
                        const { id, ...rest } = t;
                        await addDoc(collection(db, "users", auth.currentUser.uid, "drivelogbook", "trips", "items"), rest);
                        count++;
                    }
                }
                // Import Tracks
                if (json.tracks && Array.isArray(json.tracks)) {
                    for (const t of json.tracks) {
                        const { id, ...rest } = t;
                        await addDoc(collection(db, "users", auth.currentUser.uid, "drivelogbook", "tracks", "items"), rest);
                        count++;
                    }
                }
                alert(`Importazione completata! ${count} elementi ripristinati.`);
            } catch (err) {
                console.error(err);
                alert("Errore file backup: " + err.message);
            }
        };
        reader.readAsText(file);
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

            {/* Nav - Fixed Top Right as requested */}
            <div className="fixed top-6 right-6 z-50 flex gap-2">
                <Link to="/app" className="flex items-center gap-2 bg-[#18181b] hover:bg-[#27272a] border border-white/5 text-textMuted hover:text-white px-4 py-2 rounded-full text-xs font-semibold transition-all no-underline shadow-lg">
                    🏠 Home
                </Link>
                <button onClick={() => signOut(auth).then(() => navigate('/'))} className="flex items-center gap-2 bg-[#18181b] hover:bg-red-500/10 border border-white/5 text-textMuted hover:text-red-400 px-4 py-2 rounded-full text-xs font-semibold transition-all shadow-lg">
                    Esci
                </button>
            </div>

            <div className="max-w-7xl w-full grid grid-cols-1 md:grid-cols-3 gap-6 h-[85vh]">

                {/* SIDEBAR */}
                <div className="bento-card col-span-1 p-6 flex flex-col h-full overflow-hidden">
                    {/* Header Mobile Safe Area */}
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h1 className="text-3xl font-bold text-white mb-1 tracking-tight">Trip<span className="text-accent">Records</span></h1>
                            <p className="text-textMuted text-xs font-medium uppercase tracking-widest">Diario di Viaggio V2</p>
                        </div>
                    </div>

                    {/* Live Trip Section */}
                    <div className="mb-6">
                        {!isLiveTrip ? (
                            <button onClick={startLiveTrip} className="w-full btn-primary bg-emerald-600 hover:bg-emerald-500 py-4 shadow-emerald-900/50 animate-pulse">
                                🚀 START TRIP
                            </button>
                        ) : (
                            <div className="bg-emerald-900/20 border border-emerald-500/50 p-4 rounded-xl flex flex-col gap-3 animate-in fade-in">
                                <div className="flex justify-between items-center">
                                    <span className="text-emerald-400 font-bold text-xs uppercase animate-pulse">● Recording...</span>
                                    <span className="text-white font-mono text-xs">{liveStartTime?.toLocaleTimeString().slice(0, 5)}</span>
                                </div>
                                <button onClick={endLiveTrip} className="w-full btn-danger bg-red-500 text-white border-none hover:bg-red-600 py-3">
                                    🛑 END TRIP
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Vertical Tabs */}
                    <div className="flex flex-col gap-2 overflow-y-auto pr-1 custom-scrollbar flex-1 min-h-0">
                        <button onClick={() => setActiveTab('car_records')} className={`text-left px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'car_records' ? 'bg-accent text-white shadow-lg' : 'bg-white/5 text-textMuted hover:bg-white/10 hover:text-white'}`}>🏎️ Auto ({carRecords.length})</button>
                        <button onClick={() => setActiveTab('walk_paths')} className={`text-left px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'walk_paths' ? 'bg-cyan-500 text-white shadow-lg' : 'bg-white/5 text-textMuted hover:bg-white/10 hover:text-white'}`}>🚶 Piedi ({walkRecords.length})</button>
                        <button onClick={() => setActiveTab('saved_tracks')} className={`text-left px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'saved_tracks' ? 'bg-purple-500 text-white shadow-lg' : 'bg-white/5 text-textMuted hover:bg-white/10 hover:text-white'}`}>🚩 Tracciati ({tracks.length})</button>
                        <button onClick={() => setActiveTab('editor')} className={`text-left px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'editor' ? 'bg-white text-black shadow-lg' : 'bg-white/5 text-textMuted hover:bg-white/10 hover:text-white'}`}>📝 Editor {editingId ? '(Modifica)' : ''}</button>
                        <button onClick={() => setActiveTab('data')} className={`text-left px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'data' ? 'bg-gray-500 text-white shadow-lg' : 'bg-white/5 text-textMuted hover:bg-white/10 hover:text-white'}`}>💾 Backup</button>
                    </div>

                    <div className="mt-4 pt-4 border-t border-white/5 hidden md:block">
                        <div className="flex justify-between text-xs text-textMuted"><span>Auto Km</span><span className="text-white font-mono">{carRecords.reduce((a, b) => a + (b.distance || 0), 0).toFixed(0)}</span></div>
                    </div>
                </div>

                {/* MAIN CONTENT */}
                <div className="bento-card col-span-1 md:col-span-2 p-6 relative flex flex-col h-full overflow-hidden">

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
                            </div>
                            {activeTab === 'saved_tracks' && (
                                <button onClick={() => { handleReset(); setActiveTab('editor'); setIsSavingTrack(true); }} className="mt-4 w-full btn-secondary text-purple-400 border-purple-500/20 hover:bg-purple-500/10">
                                    + Crea Nuovo Tracciato
                                </button>
                            )}
                        </div>
                    )}

                    {/* DATA BACKUP TAB */}
                    {activeTab === 'data' && (
                        <div className="flex flex-col h-full justify-center items-center pb-20">
                            <div className="text-center mb-8">
                                <div className="text-6xl mb-4">💾</div>
                                <h2 className="text-2xl font-bold text-white mb-2">Backup & Ripristino</h2>
                                <p className="text-textMuted">Salva i tuoi viaggi al sicuro o ripristina un backup precedente.</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
                                <div className="bento-card p-8 flex flex-col items-center text-center hover:bg-white/5 transition-colors">
                                    <div className="text-3xl mb-4">📤</div>
                                    <h3 className="text-xl font-bold text-white mb-2">Esporta Dati</h3>
                                    <p className="text-xs text-textMuted mb-6">Scarica un file JSON con tutti i tuoi viaggi e tracciati salvati.</p>
                                    <button onClick={handleExportJSON} className="btn-primary w-full bg-blue-600 hover:bg-blue-500">SCARICA BACKUP</button>
                                </div>

                                <div className="bento-card p-8 flex flex-col items-center text-center hover:bg-white/5 transition-colors relative">
                                    <div className="text-3xl mb-4">📥</div>
                                    <h3 className="text-xl font-bold text-white mb-2">Importa Dati</h3>
                                    <p className="text-xs text-textMuted mb-6">Carica un file backup per ripristinare i dati persi.</p>
                                    <label className="btn-secondary w-full cursor-pointer hover:bg-white/10">
                                        SELEZIONA FILE
                                        <input type="file" ref={fileInputRef} onChange={handleImport} accept=".json" className="hidden" />
                                    </label>
                                </div>
                            </div>

                            {/* DANGER ZONE */}
                            <div className="mt-12 w-full max-w-2xl border-t border-red-500/20 pt-8 flex flex-col items-center">
                                <h3 className="text-red-500 font-bold mb-4 flex items-center gap-2">⚠️ DANGER ZONE</h3>
                                <button onClick={handleDeleteAllData} className="px-6 py-3 rounded-xl border border-red-500/50 text-red-500 hover:bg-red-500 hover:text-white transition-all text-sm font-bold uppercase tracking-wider">
                                    ELIMINA TUTTI I DATI
                                </button>
                                <p className="text-[10px] text-red-500/50 mt-2">Questa azione non può essere annullata.</p>
                            </div>
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
                                    <select onChange={(e) => loadTrack(e.target.value)} value={selectedTrackId} className="bg-black/50 text-xs px-2 py-1 rounded border border-white/20 text-textMuted outline-none max-w-[150px]">
                                        <option value="">📂 Load Track...</option>
                                        {tracks.map(t => <option key={t.id} value={t.id}>{t.name} ({t.distance}km)</option>)}
                                    </select>
                                )}
                            </div>

                            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
                                {/* Map */}
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

                                {/* Form */}
                                <div className="overflow-y-auto pr-2 custom-scrollbar flex flex-col gap-4">
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
                                        </div>
                                    </div>

                                    {editorMode === 'car' && (
                                        <button onClick={calculateRoute} disabled={points.length < 2} className="w-full btn-secondary py-2 text-xs border-accent/20 text-accent hover:bg-accent/10">
                                            ⚡ Calcola Percorso
                                        </button>
                                    )}

                                    <div className="space-y-3 pt-2">
                                        <div>
                                            <label className="input-label">Nome</label>
                                            <input type="text" value={isSavingTrack ? recordName : (editorMode === 'car' ? recordName : walkName)} onChange={e => isSavingTrack ? setRecordName(e.target.value) : (editorMode === 'car' ? setRecordName(e.target.value) : setWalkName(e.target.value))} className="input-field" placeholder="Es. Viaggio" />
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

                                    <div className="mt-auto grid grid-cols-2 gap-2">
                                        {/* Cancel Button */}
                                        <button onClick={() => { handleReset(); setActiveTab('car_records'); }} className="btn-secondary py-3 text-red-400 hover:text-red-500 hover:bg-red-500/10 border-transparent">
                                            ANNULLA
                                        </button>

                                        <button onClick={saveRecord} className="btn-primary py-3">
                                            {isSavingTrack ? "SALVA" : "SALVA"}
                                        </button>
                                    </div>
                                    {!editingId && !isSavingTrack && (
                                        <div className="flex items-center gap-2 justify-center pb-2">
                                            <input type="checkbox" checked={isSavingTrack} onChange={e => setIsSavingTrack(e.target.checked)} className="accent-purple-500" />
                                            <span className="text-xs text-textMuted">Salva come Tracciato</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* VIEW MODAL */}
            {viewModalData && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[1000] flex items-center justify-center p-4" onClick={() => setViewModalData(null)}>
                    <div className="bg-cardDark w-full max-w-4xl h-[80vh] rounded-[32px] border border-white/10 shadow-2xl flex flex-col md:flex-row overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="w-full md:w-2/3 h-[40vh] md:h-full relative bg-black/50">
                            <div ref={viewMapContainerRef} className="w-full h-full"></div>
                        </div>
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
                                📋 Usa questo percorso
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
