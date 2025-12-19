import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, getDocs, getDoc, query, deleteDoc, doc, updateDoc, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import './DriveLogbook.css';

// Fix for Leaflet default icon issues in React
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
const tripColors = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899'];

export default function DriveLogbook() {
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState(null);
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    // Data State
    const [allTrips, setAllTrips] = useState([]);
    const [savedPlaces, setSavedPlaces] = useState([]);
    const [activeTab, setActiveTab] = useState('analysis');

    // UI State
    const [isTripModalOpen, setIsTripModalOpen] = useState(false);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [selectedTrip, setSelectedTrip] = useState(null);
    const [editingTripId, setEditingTripId] = useState(null);
    const [isGuestView, setIsGuestView] = useState(false);
    const [guestTripData, setGuestTripData] = useState(null);

    // Filter State
    const [filterType, setFilterType] = useState('');
    const [filterStart, setFilterStart] = useState('');
    const [filterEnd, setFilterEnd] = useState('');
    const [filterVia, setFilterVia] = useState('');
    const [filterSort, setFilterSort] = useState('dateDesc');
    const [isBidirectional, setIsBidirectional] = useState(false);

    // Form State
    const [tripType, setTripType] = useState('car');
    const [startLoc, setStartLoc] = useState('');
    const [startLocName, setStartLocName] = useState('');
    const [endLoc, setEndLoc] = useState('');
    const [endLocName, setEndLocName] = useState('');
    const [tripDate, setTripDate] = useState(new Date().toISOString().split('T')[0]);
    const [timeStart, setTimeStart] = useState('');
    const [timeEnd, setTimeEnd] = useState('');
    const [distance, setDistance] = useState('');
    const [avgSpeed, setAvgSpeed] = useState('');
    const [notes, setNotes] = useState('');

    const [stops, setStops] = useState([]);
    const [startSavedSelect, setStartSavedSelect] = useState('');
    const [endSavedSelect, setEndSavedSelect] = useState('');

    // Places Form
    const [newPlaceName, setNewPlaceName] = useState('');
    const [newPlaceAddress, setNewPlaceAddress] = useState('');
    const [editingPlaceId, setEditingPlaceId] = useState(null);

    // Refs for Maps
    const mapRef = useRef(null);
    const recentMapRef = useRef(null);
    const guestMapRef = useRef(null);
    const mapInstance = useRef(null);
    const recentMapInstance = useRef(null);
    const guestMapInstance = useRef(null);
    const detailMapRef = useRef(null);
    const detailMapInstance = useRef(null);

    // Route State Refs (Mutable to avoid re-renders impacting map)
    const routeWaypoints = useRef([]);
    const routeMarkers = useRef([]);
    const routePolyline = useRef(null);
    const currentRoute = useRef(null);

    // --- INITIALIZATION ---
    useEffect(() => {
        const sharedTripId = searchParams.get('shared');
        const authorId = searchParams.get('uid');

        if (sharedTripId && authorId) {
            setIsGuestView(true);
            setLoading(false); // Guest doesn't need auth immediately
            loadSharedTrip(sharedTripId, authorId);
        } else {
            const unsubscribe = onAuthStateChanged(auth, async (u) => {
                if (!u) {
                    navigate('/');
                } else {
                    setUser(u);
                    await loadFirebaseData(u.uid);
                    setLoading(false);
                    // Initialize Maps after loading
                    // Maps initialized by useEffect dependencies
                }
            });
            return () => unsubscribe();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [navigate, searchParams]);

    // Re-init recent map when active tab changes or data updates
    useEffect(() => {
        if (!loading && !isGuestView && document.getElementById('recentMap')) {
            initRecentMap();
        }
    }, [allTrips, activeTab, loading, isGuestView]);

    // Init Detail Map when modal opens
    useEffect(() => {
        if (selectedTrip && isDetailModalOpen) {
            setTimeout(() => initDetailMap(selectedTrip), 300);
        }
    }, [selectedTrip, isDetailModalOpen]);

    const loadSharedTrip = async (tripId, uid) => {
        try {
            const docRef = doc(db, "users", uid, "drivelogbook", "trips", "items", tripId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists() && docSnap.data().isPublic) {
                setGuestTripData(docSnap.data());
                // Init Guest Map
                setTimeout(() => initGuestMap(docSnap.data()), 500);
            } else {
                alert("Viaggio non trovato o non pubblico.");
                navigate('/');
            }
        } catch (e) {
            alert("Errore caricamento.");
        }
    };

    const loadFirebaseData = async (uid) => {
        try {
            const qTrips = query(collection(db, "users", uid, "drivelogbook", "trips", "items"));
            const snapTrips = await getDocs(qTrips);
            setAllTrips(snapTrips.docs.map(d => ({ docId: d.id, ...d.data() })));

            const qPlaces = query(collection(db, "users", uid, "drivelogbook", "places", "items"));
            const snapPlaces = await getDocs(qPlaces);
            setSavedPlaces(snapPlaces.docs.map(d => ({ docId: d.id, ...d.data() })));
        } catch (error) {
            console.error("Error loading data:", error);
        }
    };

    // --- MAP FUNCTIONS ---
    const initRecentMap = () => {
        if (recentMapInstance.current) {
            recentMapInstance.current.remove();
            recentMapInstance.current = null;
        }
        if (!recentMapRef.current) return;

        try {
            const m = L.map(recentMapRef.current, { zoomControl: false, attributionControl: false }).setView([41.9, 12.5], 6);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(m);
            recentMapInstance.current = m;

            // Draw content
            updateRecentMapContent(m);
        } catch (e) { console.error("Recent Map Error", e); }
    };

    const updateRecentMapContent = (map) => {
        const legendDiv = document.getElementById('recentLegend');
        if (legendDiv) legendDiv.innerHTML = '';

        const recentTrips = [...allTrips].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
        if (recentTrips.length === 0) {
            if (legendDiv) legendDiv.innerHTML = '<div class="text-textMuted text-[10px]">Nessun dato.</div>';
            return;
        }

        const bounds = L.latLngBounds([]);
        let hasBounds = false;

        recentTrips.forEach((t, i) => {
            const color = tripColors[i % tripColors.length];
            const routeName = `${t.startLocationName || t.startLoc} → ${t.endLocationName || t.endLoc}`;

            // Setup Legend using DOM maniplation inside React is ugly but sticking to original logic
            if (legendDiv) {
                const el = document.createElement('div');
                el.className = "flex items-center text-[10px] bg-white/5 px-2 py-1 rounded border border-white/5 cursor-pointer hover:bg-white/10";
                el.onclick = () => showTripDetail(t);
                el.innerHTML = `<span class="w-2 h-2 rounded-full mr-2" style="background:${color}"></span>${routeName.substring(0, 20)}...`;
                legendDiv.appendChild(el);
            }

            if (t.mapSnapshot) {
                try {
                    const snap = JSON.parse(t.mapSnapshot);
                    if (snap.polyline && snap.polyline.length) {
                        const poly = L.polyline(snap.polyline, { color: color, weight: 4, opacity: 0.9 }).addTo(map);
                        poly.on('click', () => showTripDetail(t));
                        bounds.extend(poly.getBounds());
                        hasBounds = true;
                    }
                } catch (e) { }
            }
        });
        if (hasBounds) map.fitBounds(bounds, { padding: [20, 20] });
    };

    const initMap = () => {
        if (mapInstance.current) return; // Don't re-init if exists
        try {
            const m = L.map(mapRef.current).setView([41.9, 12.5], 6);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(m);
            mapInstance.current = m;
        } catch (e) { console.error("Main Map Error", e); }
    };

    const initGuestMap = (t) => {
        if (guestMapInstance.current) return;
        try {
            const m = L.map(guestMapRef.current).setView([41.9, 12.5], 6);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(m);
            guestMapInstance.current = m;

            try {
                const mapData = JSON.parse(t.mapSnapshot);
                if (mapData.polyline) {
                    L.polyline(mapData.polyline, { color: '#10b981', weight: 5 }).addTo(m);
                    m.fitBounds(L.latLngBounds([mapData.start, mapData.end]), { padding: [50, 50] });
                    L.marker(mapData.start).addTo(m).bindPopup("Partenza");
                    L.marker(mapData.end).addTo(m).bindPopup("Arrivo");
                }
            } catch (e) { }
        } catch (e) { }
    };

    const initDetailMap = (t) => {
        if (detailMapInstance.current) {
            detailMapInstance.current.remove();
            detailMapInstance.current = null;
        }
        if (!detailMapRef.current) return;

        try {
            const m = L.map(detailMapRef.current, { zoomControl: false }).setView([41.9, 12.5], 6);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(m);
            detailMapInstance.current = m;

            if (t.mapSnapshot) {
                try {
                    const snap = JSON.parse(t.mapSnapshot);
                    if (snap.polyline && snap.polyline.length) {
                        const poly = L.polyline(snap.polyline, { color: '#10b981', weight: 4 }).addTo(m);
                        m.fitBounds(poly.getBounds(), { padding: [50, 50] });
                        // Add start/end markers if possible
                        if (snap.start) L.marker(snap.start).addTo(m);
                        if (snap.end) L.marker(snap.end).addTo(m);
                    }
                } catch (e) { }
            }
        } catch (e) { console.error("Detail Map Error", e); }
    };

    // --- LOGIC ---
    const geocode = async (location) => {
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`);
            const data = await res.json();
            if (data.length) return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
            alert('Indirizzo non trovato');
            return null;
        } catch { return null; }
    };

    const decodePolyline = (e) => {
        var t = [], n = 0, r = 0, i = 0; while (n < e.length) { var s = 0, o = 0, u; do { u = e.charCodeAt(n++) - 63, o |= (31 & u) << s, s += 5 } while (u >= 32); var a = 1 & o ? ~(o >> 1) : o >> 1; r += a, s = 0, o = 0; do { u = e.charCodeAt(n++) - 63, o |= (31 & u) << s, s += 5 } while (u >= 32); var f = 1 & o ? ~(o >> 1) : o >> 1; i += f, t.push([r / 1e5, i / 1e5]) } return t;
    };

    const createWaypointMarker = (latlng, index) => {
        const divIcon = L.divIcon({
            className: 'custom-waypoint-icon',
            html: `<div style="background-color: #facc15; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7]
        });

        const marker = L.marker(latlng, { icon: divIcon, draggable: true }).addTo(mapInstance.current);

        marker.on('dragend', async function (e) {
            const newPos = e.target.getLatLng();
            routeWaypoints.current[index] = [newPos.lat, newPos.lng];
            await plotRoute();
        });
        return marker;
    };

    const addMapPoint = () => {
        const m = mapInstance.current;
        if (!m) return;
        alert('Clicca sulla mappa');
        m.once('click', async e => {
            const newIndex = routeWaypoints.current.length;
            routeWaypoints.current.push([e.latlng.lat, e.latlng.lng]);
            routeMarkers.current.push(createWaypointMarker(e.latlng, newIndex));
            await plotRoute();
            // Force update needed to show waypoint count if any UI depends on it
        });
    };

    const removeLastPoint = () => {
        if (routeWaypoints.current.length) {
            routeWaypoints.current.pop();
            const m = routeMarkers.current.pop();
            if (m && mapInstance.current) mapInstance.current.removeLayer(m);
            plotRoute();
        }
    };

    const clearMapPoints = () => {
        routeWaypoints.current = [];
        routeMarkers.current = [];
        plotRoute();
    };

    const plotRoute = async () => {
        const m = mapInstance.current;
        if (!m) return;
        if (!startLoc || !endLoc) return alert('Inserisci Partenza e Arrivo');

        const orsProfile = tripType === 'walk' ? 'foot-walking' : 'driving-car';

        const startCoords = await geocode(startLoc);
        if (!startCoords) return;

        const intermediateCoords = [];
        for (const s of stops) {
            const c = await geocode(s);
            if (c) intermediateCoords.push(c);
            else return;
        }

        const endCoords = await geocode(endLoc);
        if (!endCoords) return;

        // Clear map layers (except tiles)
        m.eachLayer(l => { if (!(l instanceof L.TileLayer)) m.removeLayer(l); });
        routePolyline.current = null;
        routeMarkers.current = [];

        L.marker(startCoords).addTo(m).bindPopup('Start');
        intermediateCoords.forEach(c => L.circleMarker(c, { radius: 6, color: '#f97316', fill: true, fillOpacity: 1 }).addTo(m));
        L.marker(endCoords).addTo(m).bindPopup('End');

        let coords = [[startCoords[1], startCoords[0]]];
        intermediateCoords.forEach(c => coords.push([c[1], c[0]]));
        routeWaypoints.current.forEach(wp => coords.push([wp[1], wp[0]]));
        coords.push([endCoords[1], endCoords[0]]);

        try {
            const res = await fetch(`https://api.openrouteservice.org/v2/directions/${orsProfile}`, {
                method: 'POST',
                headers: { 'Authorization': API_KEY, 'Content-Type': 'application/json' },
                body: JSON.stringify({ coordinates: coords })
            });
            const data = await res.json();
            if (data.routes && data.routes.length) {
                const dist = data.routes[0].summary.distance / 1000;
                setDistance(dist.toFixed(1));

                const poly = decodePolyline(data.routes[0].geometry);
                routePolyline.current = L.polyline(poly, { color: '#10b981', weight: 5, opacity: 0.8 }).addTo(m);
            } else { throw new Error(); }
        } catch {
            const points = [startCoords, ...intermediateCoords, endCoords];
            routePolyline.current = L.polyline(points, { color: '#10b981', weight: 3, dashArray: '5,5' }).addTo(m);
        }

        // Redraw draggable waypoints
        routeWaypoints.current.forEach((p, index) => {
            const marker = createWaypointMarker(p, index);
            routeMarkers.current.push(marker);
        });

        m.fitBounds(L.latLngBounds([startCoords, ...intermediateCoords, ...routeWaypoints.current, endCoords]), { padding: [50, 50] });
        currentRoute.current = {
            start: startCoords,
            end: endCoords,
            startLoc: startLoc,
            endLoc: endLoc,
            waypoints: routeWaypoints.current,
            polyline: routePolyline.current ? routePolyline.current.getLatLngs() : [],
            stops: stops
        };
    };

    // --- CRUD ---
    const handleSaveTrip = async () => {
        const tripData = {
            type: tripType,
            startLoc, endLoc, startLocationName: startLocName, endLocationName: endLocName,
            date: tripDate, timeStart, timeEnd,
            distance: parseFloat(distance),
            avgSpeed: tripType === 'walk' ? 0 : parseFloat(avgSpeed),
            notes,
            route: currentRoute.current,
            waypoints: JSON.stringify(routeWaypoints.current || []),
            stops: JSON.stringify(stops || []),
            mapSnapshot: JSON.stringify({ polyline: currentRoute.current?.polyline, start: currentRoute.current?.start, end: currentRoute.current?.end }),
            isFavorite: false,
            id: Date.now(),
            userId: user.uid
        };

        // Sanitize route object for Firestore (remove massive arrays if needed, but keeping it for now)
        tripData.route = JSON.stringify(tripData.route || {});

        try {
            if (editingTripId) {
                await updateDoc(doc(db, "users", user.uid, "drivelogbook", "trips", "items", editingTripId), tripData);
            } else {
                await addDoc(collection(db, "users", user.uid, "drivelogbook", "trips", "items"), tripData);
            }
            closeTripModal();
            loadFirebaseData(user.uid);
            alert('Viaggio salvato!');
        } catch (e) {
            console.error(e);
            alert("Errore salvataggio: " + e.message);
        }
    };

    const handleDeleteTrip = async (id) => {
        if (!confirm('Eliminare?')) return;
        await deleteDoc(doc(db, "users", user.uid, "drivelogbook", "trips", "items", id));
        closeDetailModal();
        loadFirebaseData(user.uid);
    };

    const handleSaveNewPlace = async () => {
        if (!newPlaceName || !newPlaceAddress) return alert('Dati mancanti');
        const coords = await geocode(newPlaceAddress);
        if (coords) {
            const placeData = {
                id: Date.now(),
                name: newPlaceName,
                address: newPlaceAddress,
                lat: coords[0],
                lng: coords[1],
                userId: user.uid
            };
            try {
                if (editingPlaceId) {
                    await updateDoc(doc(db, "users", user.uid, "drivelogbook", "places", "items", editingPlaceId), placeData);
                } else {
                    await addDoc(collection(db, "users", user.uid, "drivelogbook", "places", "items"), placeData);
                }
                setNewPlaceName('');
                setNewPlaceAddress('');
                setEditingPlaceId(null);
                loadFirebaseData(user.uid);
            } catch (e) { alert("Errore"); }
        }
    };

    const handleDeletePlace = async (id) => {
        if (confirm("Eliminare?")) {
            await deleteDoc(doc(db, "users", user.uid, "drivelogbook", "places", "items", id));
            loadFirebaseData(user.uid);
        }
    };

    const handleImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (data.trips && Array.isArray(data.trips)) {
                    for (const t of data.trips) {
                        const { docId, userId, ...rest } = t;
                        await addDoc(collection(db, "users", user.uid, "drivelogbook", "trips", "items"), { ...rest, userId: user.uid });
                    }
                }
                if (data.places && Array.isArray(data.places)) {
                    for (const p of data.places) {
                        const { docId, userId, ...rest } = p;
                        await addDoc(collection(db, "users", user.uid, "drivelogbook", "places", "items"), { ...rest, userId: user.uid });
                    }
                }
                loadFirebaseData(user.uid);
                alert("Importazione completata!");
            } catch (err) {
                console.error(err);
                alert("Errore durante l'importazione.");
            }
        };
        reader.readAsText(file);
    };

    const toggleFavorite = async (t, e) => {
        e.stopPropagation();
        await updateDoc(doc(db, "users", user.uid, "drivelogbook", "trips", "items", t.docId), { isFavorite: !t.isFavorite });
        loadFirebaseData(user.uid);
    };

    // --- UI HELPERS ---
    const openTripModal = () => {
        setIsTripModalOpen(true);
        setTimeout(() => {
            initMap();
            if (mapInstance.current) mapInstance.current.invalidateSize();
        }, 100);
    };

    const closeTripModal = () => {
        setIsTripModalOpen(false);
        resetForm();
    };

    const showTripDetail = (t) => {
        setSelectedTrip(t);
        setIsDetailModalOpen(true);
    };

    const closeDetailModal = () => setIsDetailModalOpen(false);

    const handleExportJSON = () => {
        const cleanTrips = allTrips.map(({ docId, userId, ...rest }) => rest);
        const cleanPlaces = savedPlaces.map(({ docId, userId, ...rest }) => rest);
        const blob = new Blob([JSON.stringify({ trips: cleanTrips, places: cleanPlaces }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'drive-logbook-backup.json';
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleExportCSV = () => {
        const header = 'Date,Start,End,Km,Speed,Fav\n';
        const rows = allTrips.map(t => `"${t.date}","${t.startLoc}","${t.endLoc}",${t.distance},${t.avgSpeed},${t.isFavorite}`).join('\n');
        const blob = new Blob([header + rows], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'log.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    const toggleTripPrivacy = async (t) => {
        const isPublic = t.isPublic;
        const msg = isPublic
            ? "Rendere il viaggio PRIVATO? Il link di condivisione smetterà di funzionare."
            : "Rendere il viaggio PUBBLICO? Chiunque abbia il link potrà vederlo.";

        if (!confirm(msg)) return;

        try {
            await updateDoc(doc(db, "users", user.uid, "drivelogbook", "trips", "items", t.docId), { isPublic: !isPublic });

            // Optimistic update for UI responsiveness
            const updatedTrip = { ...t, isPublic: !isPublic };
            setSelectedTrip(updatedTrip); // Update local modal state
            loadFirebaseData(user.uid); // Refresh global state

            if (!isPublic) {
                const url = `${window.location.origin}/drive?shared=${t.docId}&uid=${user.uid}`;
                navigator.clipboard.writeText(url);
                alert("Viaggio pubblico! Link copiato negli appunti.");
            } else {
                alert("Viaggio reso privato.");
            }
        } catch (e) {
            console.error(e);
            alert("Errore aggiornamento privacy.");
        }
    };

    const copyTripLink = (t) => {
        const url = `${window.location.origin}/drive?shared=${t.docId}&uid=${user.uid}`;
        navigator.clipboard.writeText(url);
        alert("Link copiato negli appunti! 🔗");
    };

    const editTrip = (t) => {
        closeDetailModal();
        openTripModal();
        setEditingTripId(t.docId);

        // Populate Form
        setTripType(t.type || 'car');
        setStartLoc(t.startLoc);
        setStartLocName(t.startLocationName || '');
        setEndLoc(t.endLoc);
        setEndLocName(t.endLocationName || '');
        setTripDate(t.date);
        setTimeStart(t.timeStart);
        setTimeEnd(t.timeEnd);
        setDistance(t.distance);
        setAvgSpeed(t.avgSpeed);
        setNotes(t.notes);

        try {
            setStops(JSON.parse(t.stops || '[]'));
            routeWaypoints.current = JSON.parse(t.waypoints || '[]');

            // Restore Route Object
            let r = t.route;
            if (typeof r === 'string') try { r = JSON.parse(r); } catch (e) { }
            if (typeof r === 'string') try { r = JSON.parse(r); } catch (e) { } // Handle double stringify
            currentRoute.current = r;

            // Restore Map Visuals
            setTimeout(() => {
                const m = mapInstance.current;
                if (!m) return;

                // Clear existing
                m.eachLayer(l => { if (!(l instanceof L.TileLayer)) m.removeLayer(l); });
                routeMarkers.current = [];

                if (r) {
                    // Polyline
                    if (r.polyline) {
                        routePolyline.current = L.polyline(r.polyline, { color: '#10b981', weight: 5, opacity: 0.8 }).addTo(m);
                        m.fitBounds(L.latLngBounds(r.polyline), { padding: [50, 50] });
                    }
                    // Markers
                    if (r.start) L.marker(r.start).addTo(m).bindPopup('Start');
                    if (r.end) L.marker(r.end).addTo(m).bindPopup('End');

                    // Waypoints
                    routeWaypoints.current.forEach((p, index) => {
                        routeMarkers.current.push(createWaypointMarker(p, index));
                    });
                }
            }, 500);

        } catch (e) { console.error("Error restoring trip", e); }
    };

    const resetForm = () => {
        setEditingTripId(null);
        setStartLoc(''); setStartLocName(''); setEndLoc(''); setEndLocName('');
        setTripDate(new Date().toISOString().split('T')[0]);
        setDistance(''); setAvgSpeed(''); setNotes('');
        setStops([]);
        routeWaypoints.current = [];
        routeMarkers.current = [];
        routePolyline.current = null;
        currentRoute.current = null;
        if (mapInstance.current) {
            mapInstance.current.eachLayer(l => { if (!(l instanceof L.TileLayer)) mapInstance.current.removeLayer(l); });
        }
    };

    const handleLocationSelect = (type, val) => {
        if (val === 'manual') {
            type === 'start' ? setStartSavedSelect('manual') : setEndSavedSelect('manual');
        } else if (val) {
            const p = savedPlaces.find(pl => pl.docId === val);
            if (p) {
                if (type === 'start') { setStartLoc(p.address); setStartLocName(p.name); setStartSavedSelect(val); }
                else { setEndLoc(p.address); setEndLocName(p.name); setEndSavedSelect(val); }
            }
        } else {
            type === 'start' ? setStartSavedSelect('') : setEndSavedSelect('');
        }
    };

    // Stats Calculation
    const getStats = () => {
        const dist = allTrips.reduce((s, t) => s + (t.distance || 0), 0);
        const vs = allTrips.filter(t => t.avgSpeed);
        const avg = vs.length ? vs.reduce((s, t) => s + t.avgSpeed, 0) / vs.length : 0;
        let time = 0;
        allTrips.forEach(t => {
            if (t.timeStart && t.timeEnd) {
                const [h1, m1] = t.timeStart.split(':').map(Number);
                const [h2, m2] = t.timeEnd.split(':').map(Number);
                let m = (h2 * 60 + m2) - (h1 * 60 + m1);
                time += (m < 0 ? m + 1440 : m);
            }
        });
        return { trips: allTrips.length, dist: dist.toFixed(0), time: Math.floor(time / 60) + 'h ' + (time % 60) + 'm' };
    };
    const stats = getStats();

    // Filter Logic
    const getFilteredTrips = () => {
        let res = allTrips.filter(t => {
            let route = (!filterStart || t.startLoc === filterStart) && (!filterEnd || t.endLoc === filterEnd);
            if (isBidirectional) route = route || ((!filterStart || t.endLoc === filterStart) && (!filterEnd || t.startLoc === filterEnd));
            let typeMatch = !filterType || (t.type || 'car') === filterType;
            let searchMatch = !filterVia || [t.startLoc, t.endLoc, t.notes, t.startLocationName, t.endLocationName].some(s => (s || '').toLowerCase().includes(filterVia.toLowerCase()));
            return route && typeMatch && searchMatch;
        });
        return res.sort((a, b) => filterSort === 'dateDesc' ? new Date(b.date) - new Date(a.date) : new Date(a.date) - new Date(b.date));
    };

    if (loading) return null;

    if (isGuestView && guestTripData) {
        // Style override for DriveLogbook - Emerald
        const pageStyle = {
            '--color-accent': '#10b981', // Emerald-500
            '--color-accent-hover': '#059669', // Emerald-600
        };

        return (
            <div className="min-h-screen p-4 md:p-8 flex flex-col items-center justify-center" style={pageStyle}>
                <div className="w-full max-w-5xl flex flex-col items-center pt-8 p-4">
                    <div className="text-center mb-8">
                        <h1 className="text-3xl font-bold text-white mb-2">Viaggio Condiviso</h1>
                        <p className="text-textMuted">DriveLogbook Pro</p>
                    </div>
                    <div className="bento-card p-6 bg-cardDark border border-white/10 w-full">
                        <div ref={guestMapRef} className="w-full h-[400px] rounded-2xl bg-bgApp border border-white/5 mb-6"></div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                                    <p className="text-xs text-textMuted uppercase">Data</p>
                                    <p className="text-xl font-bold text-white flex items-center gap-2">{guestTripData.type === 'walk' ? '🚶' : '🚗'} {new Date(guestTripData.date).toLocaleDateString()}</p>
                                </div>
                                <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                                    <p className="text-xs text-textMuted uppercase">Tratta</p>
                                    <p className="text-sm font-bold text-white">{guestTripData.startLocationName || guestTripData.startLoc}</p>
                                    <p className="text-xs text-accent">↓</p>
                                    <p className="text-sm font-bold text-white">{guestTripData.endLocationName || guestTripData.endLoc}</p>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-white/5 p-4 rounded-xl border border-white/5 text-center">
                                        <p className="text-xs text-textMuted uppercase">Distanza</p>
                                        <p className="text-lg font-bold text-accent">{guestTripData.distance} km</p>
                                    </div>
                                    <div className="bg-white/5 p-4 rounded-xl border border-white/5 text-center">
                                        <p className="text-xs text-textMuted uppercase">Media</p>
                                        <p className="text-lg font-bold text-white">{guestTripData.avgSpeed} km/h</p>
                                    </div>
                                </div>
                                <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                                    <p className="text-xs text-textMuted uppercase">Note</p>
                                    <p className="text-sm text-white italic">{guestTripData.notes || "Nessuna nota."}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="text-center mt-8">
                        <Link to="/" className="text-accent hover:underline text-sm font-bold">Vai alla Home</Link>
                    </div>
                </div>
            </div>
        );
    }

    // Style override for DriveLogbook - Emerald
    const pageStyle = {
        '--color-accent': '#10b981', // Emerald-500
        '--color-accent-hover': '#059669', // Emerald-600
    };

    return (
        <div className="min-h-screen p-4 md:p-8 flex flex-col items-center" style={pageStyle}>
            <div className="w-full max-w-[1600px] flex flex-col items-center">

                <div className="fixed top-6 right-6 z-50 flex gap-2">
                    <Link to="/app" className="flex items-center gap-2 bg-[#18181b] hover:bg-[#27272a] border border-white/5 text-textMuted hover:text-white px-4 py-2 rounded-full text-xs font-semibold transition-all no-underline shadow-lg">
                        🏠 Home
                    </Link>
                    <button onClick={() => signOut(auth).then(() => navigate('/'))} className="flex items-center gap-2 bg-[#18181b] hover:bg-red-500/10 border border-white/5 text-textMuted hover:text-red-400 px-4 py-2 rounded-full text-xs font-semibold transition-all shadow-lg">
                        Esci
                    </button>
                </div>

                <div className="w-full pt-16 md:pt-0">
                    <div className="mb-6">
                        <h1 className="text-3xl font-bold text-white tracking-tight">Drive<span className="text-accent">Logbook</span></h1>
                        <p className="text-textMuted text-xs font-medium uppercase tracking-widest">Advanced Tracking</p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
                        <div className="col-span-1 lg:col-span-1 grid grid-cols-2 lg:grid-cols-1 gap-4">
                            <div className="bento-card p-4 flex flex-col justify-center items-center text-center bg-accent/10 border-accent/20">
                                <span className="text-[10px] text-textMuted uppercase font-bold">Chilometri Totali</span>
                                <span className="text-3xl font-bold text-accent mt-1">{stats.dist}</span>
                            </div>
                            <div className="bento-card p-4 flex flex-col justify-center items-center text-center">
                                <span className="text-[10px] text-textMuted uppercase font-bold">Viaggi Registrati</span>
                                <span className="text-2xl font-bold text-white mt-1">{stats.trips}</span>
                            </div>
                            <div className="bento-card p-4 flex flex-col justify-center items-center text-center col-span-2 lg:col-span-1">
                                <span className="text-[10px] text-textMuted uppercase font-bold">Tempo alla guida</span>
                                <span className="text-2xl font-bold text-white mt-1">{stats.time}</span>
                            </div>
                        </div>

                        <div className="col-span-1 lg:col-span-3 bento-card p-6 h-[350px] flex flex-col relative group">
                            <div className="flex justify-between items-center mb-4 z-10 relative pointer-events-none">
                                <h2 className="text-sm font-bold text-white uppercase tracking-wider bg-black/60 backdrop-blur px-3 py-1 rounded-lg border border-white/10">⏳ Attività Recenti</h2>
                            </div>
                            <div id="recentMap" ref={recentMapRef} className="absolute inset-0 w-full h-full rounded-2xl opacity-60 group-hover:opacity-100 transition-opacity z-0"></div>
                            <div id="recentLegend" className="absolute bottom-4 left-4 right-4 z-10 flex gap-2 flex-wrap pointer-events-none"></div>
                        </div>
                    </div>

                    <div className="bento-card p-6 min-h-[600px] flex flex-col">
                        <div className="flex flex-wrap justify-between items-center mb-6 border-b border-white/5 pb-4 gap-4">
                            <div className="flex gap-2 overflow-x-auto no-scrollbar">
                                <button className={`px-4 py-2 text-sm font-bold transition-colors tab-btn whitespace-nowrap ${activeTab === 'analysis' ? 'text-white border-b-2 border-accent' : 'text-textMuted border-b-2 border-transparent hover:text-white'}`} onClick={() => setActiveTab('analysis')}>Storico Viaggi</button>
                                <button className={`px-4 py-2 text-sm font-bold transition-colors tab-btn whitespace-nowrap ${activeTab === 'favorites' ? 'text-white border-b-2 border-accent' : 'text-textMuted border-b-2 border-transparent hover:text-white'}`} onClick={() => setActiveTab('favorites')}>Preferiti</button>
                                <button className={`px-4 py-2 text-sm font-bold transition-colors tab-btn whitespace-nowrap ${activeTab === 'places' ? 'text-white border-b-2 border-accent' : 'text-textMuted border-b-2 border-transparent hover:text-white'}`} onClick={() => setActiveTab('places')}>Luoghi Salvati</button>
                                <button className={`px-4 py-2 text-sm font-bold transition-colors tab-btn whitespace-nowrap ${activeTab === 'data' ? 'text-white border-b-2 border-accent' : 'text-textMuted border-b-2 border-transparent hover:text-white'}`} onClick={() => setActiveTab('data')}>Gestione Dati</button>
                            </div>
                            <button onClick={openTripModal} className="btn-primary">
                                <span className="text-lg">＋</span> NUOVO VIAGGIO
                            </button>
                        </div>

                        {/* Analysis Tab */}
                        {activeTab === 'analysis' && (
                            <div className="flex-1 flex flex-col">
                                <div className="bg-black/20 p-4 rounded-xl mb-6 border border-white/5 flex flex-wrap gap-4 items-end">
                                    <div className="w-32">
                                        <label className="input-label">Tipo</label>
                                        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="input-field focus:border-accent">
                                            <option value="">Tutti</option>
                                            <option value="car">🚗 Auto</option>
                                            <option value="walk">🚶 A Piedi</option>
                                        </select>
                                    </div>
                                    {/* Simplified Filters for brevity */}
                                    <div className="flex-1 min-w-[200px]">
                                        <label className="input-label">Cerca</label>
                                        <input type="text" value={filterVia} onChange={e => setFilterVia(e.target.value)} placeholder="Via, note..." className="input-field" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 overflow-y-auto pr-2 max-h-[600px]">
                                    {getFilteredTrips().map(t => (
                                        <div key={t.docId} className="bg-white/5 p-3 rounded-xl border border-white/5 hover:border-accent/50 transition-all cursor-pointer group" onClick={() => showTripDetail(t)}>
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex items-center gap-2 text-xs font-bold text-white">
                                                    <span className="text-base">{t.type === 'walk' ? '🚶' : '🚗'}</span>
                                                    <button onClick={(e) => toggleFavorite(t, e)} className={`text-sm ${t.isFavorite ? 'text-yellow-400' : 'text-textMuted hover:text-yellow-400'}`}>{t.isFavorite ? '★' : '☆'}</button>
                                                    {t.startLocationName || t.startLoc} <span className="text-accent">→</span> {t.endLocationName || t.endLoc}
                                                </div>
                                                <div className="text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded">{t.distance} km</div>
                                            </div>
                                            <div className="grid grid-cols-3 gap-2 border-t border-white/5 pt-2">
                                                <div className="text-center"><div className="text-[10px] text-textMuted uppercase">Data</div><div className="text-xs font-medium text-white">{new Date(t.date).toLocaleDateString()}</div></div>
                                                <div className="text-center"><div className="text-[10px] text-textMuted uppercase">Km</div><div className="text-xs font-medium text-white">{t.distance || '-'}</div></div>
                                                <div className="text-center"><div className="text-[10px] text-textMuted uppercase">Info</div><div className="text-xs font-medium text-white">{t.avgSpeed} km/h</div></div>
                                            </div>
                                        </div>
                                    ))}
                                    {!getFilteredTrips().length && <div className="col-span-full text-center py-12 text-textMuted">Nessun risultato.</div>}
                                </div>
                            </div>
                        )}

                        {/* Favorites Tab */}
                        {activeTab === 'favorites' && (
                            <div className="flex-1 flex flex-col">
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 overflow-y-auto pr-2 max-h-[600px]">
                                    {allTrips.filter(t => t.isFavorite).map(t => (
                                        <div key={t.docId} className="bg-white/5 p-3 rounded-xl border border-white/5 hover:border-accent/50 transition-all cursor-pointer group" onClick={() => showTripDetail(t)}>
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex items-center gap-2 text-xs font-bold text-white">
                                                    <span className="text-base">{t.type === 'walk' ? '🚶' : '🚗'}</span>
                                                    <button onClick={(e) => toggleFavorite(t, e)} className="text-sm text-yellow-400">★</button>
                                                    {t.startLocationName || t.startLoc} <span className="text-accent">→</span> {t.endLocationName || t.endLoc}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {!allTrips.filter(t => t.isFavorite).length && <div className="col-span-full text-center py-4 text-textMuted text-xs">Nessun preferito.</div>}
                                </div>
                            </div>
                        )}

                        {/* Places Tab */}
                        {activeTab === 'places' && (
                            <div className="flex-1 flex flex-col">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="col-span-1 bg-black/20 p-5 rounded-xl border border-white/5 h-fit">
                                        <h4 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">{editingPlaceId ? "✏️ Modifica Luogo" : "➕ Nuovo Luogo"}</h4>
                                        <div className="space-y-3">
                                            <div className="space-y-3">
                                                <input type="text" value={newPlaceName} onChange={e => setNewPlaceName(e.target.value)} placeholder="Nome (es: Casa)" className="input-field" />
                                                <input type="text" value={newPlaceAddress} onChange={e => setNewPlaceAddress(e.target.value)} placeholder="Indirizzo completo" className="input-field" />
                                                <div className="flex gap-2 pt-2">
                                                    <button onClick={handleSaveNewPlace} className="flex-1 btn-primary text-sm">{editingPlaceId ? "Aggiorna" : "Salva Luogo"}</button>
                                                    {editingPlaceId && <button onClick={() => { setEditingPlaceId(null); setNewPlaceName(''); setNewPlaceAddress(''); }} className="flex-1 btn-secondary text-sm">Annulla</button>}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="col-span-1 md:col-span-2 overflow-y-auto max-h-[500px] space-y-2 pr-2">
                                        {savedPlaces.map(p => (
                                            <div key={p.docId} className="bg-white/5 p-3 rounded-lg border border-white/5 flex justify-between items-center group hover:border-accent/30 transition-all">
                                                <div><div className="font-bold text-xs text-white">{p.name}</div><div className="text-[10px] text-textMuted truncate max-w-[150px]">{p.address}</div></div>
                                                <div className="flex gap-2 opacity-50 group-hover:opacity-100">
                                                    <button className="text-textMuted hover:text-white" onClick={() => { setEditingPlaceId(p.docId); setNewPlaceName(p.name); setNewPlaceAddress(p.address); }}>✏️</button>
                                                    <button className="text-textMuted hover:text-red-400" onClick={() => handleDeletePlace(p.docId)}>✕</button>
                                                </div>
                                            </div>
                                        ))}
                                        {!savedPlaces.length && <div className="text-center py-4 text-textMuted text-xs">Nessun luogo salvato.</div>}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Data Tab */}
                        {activeTab === 'data' && (
                            <div className="flex-1">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto mt-8">
                                    <div className="bg-black/20 p-8 rounded-2xl border border-white/5 text-center flex flex-col items-center justify-center gap-4">
                                        <span className="text-4xl">📤</span>
                                        <h4 className="text-lg font-bold text-white uppercase tracking-wider">Esporta Dati</h4>
                                        <div className="flex gap-3 w-full">
                                            <button onClick={handleExportJSON} className="flex-1 btn-secondary text-sm">JSON (Backup)</button>
                                            <button onClick={handleExportCSV} className="flex-1 btn-secondary text-sm">CSV (Excel)</button>
                                        </div>
                                    </div>
                                    <div className="bg-black/20 p-8 rounded-2xl border border-white/5 text-center flex flex-col items-center justify-center gap-4">
                                        <span className="text-4xl">📥</span>
                                        <h4 className="text-lg font-bold text-white uppercase tracking-wider">Importa Backup</h4>
                                        <p className="text-textMuted text-sm mb-4">Ripristina i dati da un file JSON precedente.</p>
                                        <input type="file" id="importFile" accept=".json" className="hidden" onChange={handleImport} />
                                        <button onClick={() => document.getElementById('importFile').click()} className="w-full btn-primary text-sm">Seleziona File</button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* TRIP MODAL */}
            <div className={`fixed inset-0 bg-black/95 backdrop-blur-md z-[100] p-0 md:p-8 flex items-center justify-center ${isTripModalOpen ? '' : 'hidden'}`}>
                <div className="bg-cardDark w-full h-full max-w-[1400px] md:rounded-3xl border border-white/10 shadow-2xl flex flex-col overflow-hidden relative">
                    <div className="flex justify-between items-center p-4 md:p-6 border-b border-white/5 bg-cardDark z-20 shrink-0">
                        <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">{editingTripId ? "✏️ Modifica Viaggio" : "📝 Nuovo Viaggio"}</h2>
                        <div className="flex gap-2 md:gap-3">
                            <button onClick={resetForm} className="btn-secondary px-3 py-2 text-xs">Reset</button>
                            <button onClick={closeTripModal} className="btn-danger px-3 py-2 text-xs">Chiudi</button>
                        </div>
                    </div>
                    <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 overflow-y-auto lg:overflow-hidden">
                        <div className="col-span-1 lg:col-span-1 p-4 md:p-6 lg:overflow-y-auto border-r border-white/5 bg-bgApp/50 order-2 lg:order-1">
                            <div className="space-y-6 max-w-lg mx-auto pb-10 lg:pb-0">
                                <div className="bg-black/20 p-4 rounded-xl border border-white/5 space-y-4">
                                    <div className="flex bg-bgApp p-1 rounded-lg border border-white/10">
                                        <button type="button" onClick={() => setTripType('car')} className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${tripType === 'car' ? 'bg-accent text-white' : 'bg-transparent text-textMuted'}`}>🚗 Auto</button>
                                        <button type="button" onClick={() => setTripType('walk')} className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${tripType === 'walk' ? 'bg-accent text-white' : 'bg-transparent text-textMuted'}`}>🚶 A Piedi</button>
                                    </div>
                                    <div>
                                        <label className="input-label">Partenza</label>
                                        <select value={startSavedSelect} onChange={e => handleLocationSelect('start', e.target.value)} className="input-field focus:border-accent">
                                            <option value="">Seleziona...</option>
                                            <option value="manual">✍️ Manuale...</option>
                                            <optgroup label="Salvati">
                                                {savedPlaces.map(p => <option key={p.docId} value={p.docId}>{p.name}</option>)}
                                            </optgroup>
                                        </select>
                                        <div className={startSavedSelect === 'manual' ? 'mt-2 space-y-2' : 'hidden mt-2 space-y-2'}>
                                            <input type="text" value={startLoc} onChange={e => setStartLoc(e.target.value)} placeholder="Indirizzo" className="input-field" />
                                            <input type="text" value={startLocName} onChange={e => setStartLocName(e.target.value)} placeholder="Nome personalizzato" className="input-field" />
                                        </div>
                                    </div>
                                    <div className="flex justify-center -my-3 relative z-10"><button className="w-8 h-8 rounded-full bg-cardDark border border-white/10 text-textMuted hover:text-accent flex items-center justify-center transition-colors">⇅</button></div>
                                    <div>
                                        <label className="input-label">Arrivo</label>
                                        <select value={endSavedSelect} onChange={e => handleLocationSelect('end', e.target.value)} className="input-field focus:border-accent">
                                            <option value="">Seleziona...</option>
                                            <option value="manual">✍️ Manuale...</option>
                                            <optgroup label="Salvati">
                                                {savedPlaces.map(p => <option key={p.docId} value={p.docId}>{p.name}</option>)}
                                            </optgroup>
                                        </select>
                                        <div className={endSavedSelect === 'manual' ? 'mt-2 space-y-2' : 'hidden mt-2 space-y-2'}>
                                            <input type="text" value={endLoc} onChange={e => setEndLoc(e.target.value)} placeholder="Indirizzo" className="input-field" />
                                            <input type="text" value={endLocName} onChange={e => setEndLocName(e.target.value)} placeholder="Nome personalizzato" className="input-field" />
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="input-label">Data</label><input type="date" value={tripDate} onChange={e => setTripDate(e.target.value)} className="input-field" /></div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div><label className="input-label">Inizio</label><input type="time" value={timeStart} onChange={e => setTimeStart(e.target.value)} className="input-field" /></div>
                                        <div><label className="input-label">Fine</label><input type="time" value={timeEnd} onChange={e => setTimeEnd(e.target.value)} className="input-field" /></div>
                                    </div>
                                    <div><label className="input-label">Distanza (Km)</label><input type="number" value={distance} onChange={e => setDistance(e.target.value)} placeholder="0.0" step="0.1" className="input-field" /></div>
                                    {tripType === 'car' && <div><label className="input-label">Media (Km/h)</label><input type="number" value={avgSpeed} onChange={e => setAvgSpeed(e.target.value)} placeholder="0" step="0.1" className="input-field" /></div>}
                                </div>
                                <div><label className="input-label">Note</label><textarea value={notes} onChange={e => setNotes(e.target.value)} rows="2" placeholder="..." className="input-field resize-none"></textarea></div>
                                <button onClick={handleSaveTrip} className="w-full mt-4 btn-primary text-base shadow-lg shadow-emerald-900/20">{editingTripId ? "Aggiorna Record" : "Salva Viaggio"}</button>
                            </div>
                        </div>
                        <div className="col-span-1 lg:col-span-2 p-4 md:p-6 flex flex-col h-auto lg:h-full bg-cardDark relative order-1 lg:order-2 border-b lg:border-b-0 border-white/5">
                            <div className="flex justify-between items-center mb-4"><h3 className="text-xs font-bold text-white uppercase tracking-wider">🗺️ Pianificazione Rotta</h3></div>
                            <div ref={mapRef} className="w-full h-[400px] lg:h-auto lg:flex-1 rounded-2xl bg-bgApp border border-white/5 overflow-hidden shadow-inner relative z-0"></div>
                            <div className="mt-4 flex flex-wrap gap-2 justify-between items-center">
                                <div className="flex gap-2">
                                    <button onClick={addMapPoint} className="btn-secondary px-3 py-2 text-xs">📌 Add WP</button>
                                    <button onClick={removeLastPoint} className="btn-secondary px-3 py-2 text-xs">↩️ Undo</button>
                                    <button onClick={clearMapPoints} className="btn-danger px-3 py-2 text-xs">🗑️ Clear</button>
                                </div>
                                <button onClick={plotRoute} className="btn-primary px-6 py-2 text-sm shadow-lg shadow-emerald-900/20">📍 Calcola Rotta</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* DETAIL MODAL */}
            {selectedTrip && isDetailModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[150] p-4 flex items-center justify-center">
                    <div className="bg-cardDark w-full max-w-lg rounded-2xl border border-white/10 shadow-2xl p-6 relative flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-4">
                            <h3 className="text-lg font-bold text-white">Dettaglio Viaggio</h3>
                            <button onClick={closeDetailModal} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-textMuted">✕</button>
                        </div>
                        <div className="overflow-y-auto pr-2 space-y-3">
                            <div className="flex justify-between items-center">
                                <h3 className="font-bold text-white text-lg">{new Date(selectedTrip.date).toLocaleDateString()}</h3>
                            </div>

                            {/* Map Container */}
                            <div ref={detailMapRef} className="w-full h-[200px] rounded-xl bg-bgApp border border-white/5 mb-4 relative z-0"></div>

                            <div className="grid grid-cols-1 gap-2 text-sm">
                                <div className="bg-white/5 p-2 rounded-lg"><span className="text-[10px] uppercase text-textMuted block">Partenza</span><span className="text-white font-medium">{selectedTrip.startLocationName || selectedTrip.startLoc}</span></div>
                                <div className="bg-white/5 p-2 rounded-lg"><span className="text-[10px] uppercase text-textMuted block">Arrivo</span><span className="text-white font-medium">{selectedTrip.endLocationName || selectedTrip.endLoc}</span></div>
                            </div>
                            <div className="bg-black/20 p-3 rounded-lg text-xs text-textMuted italic border border-white/5">{selectedTrip.notes || 'Nessuna nota.'}</div>
                            <div className="flex gap-2 mt-4 pt-2 border-t border-white/5 overflow-x-auto">
                                {selectedTrip.isPublic ? (
                                    <>
                                        <button className="flex-1 btn-secondary min-w-[60px] text-xs" onClick={() => copyTripLink(selectedTrip)}>🔗 Copia Link</button>
                                        <button className="flex-1 btn-secondary min-w-[60px] text-xs text-yellow-400 border-yellow-400/20 bg-yellow-400/10 hover:bg-yellow-400/20" onClick={() => toggleTripPrivacy(selectedTrip)}>🔒 Privato</button>
                                    </>
                                ) : (
                                    <button className="flex-1 btn-secondary min-w-[60px] text-xs" onClick={() => toggleTripPrivacy(selectedTrip)}>🔗 Condividi</button>
                                )}
                                <button className="flex-1 btn-secondary min-w-[60px] text-xs" onClick={() => editTrip(selectedTrip)}>✏️ Modifica</button>
                                <button className="flex-1 btn-danger min-w-[60px] text-xs" onClick={() => handleDeleteTrip(selectedTrip.docId)}>🗑️ Elimina</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
