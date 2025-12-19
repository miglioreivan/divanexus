import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, onSnapshot, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import './University.css';

export default function University() {
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState(null);
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    // Data State
    const [uniData, setUniData] = useState({ exams: [], deadlines: [], schedule: [], subjects: [] });
    const [isPublic, setIsPublic] = useState(false);
    const [isGuestView, setIsGuestView] = useState(false);
    const [guestData, setGuestData] = useState(null);

    // Modal States
    const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
    const [isClassModalOpen, setIsClassModalOpen] = useState(false);
    const [showExamForm, setShowExamForm] = useState(false);

    // Form States
    const [newSubName, setNewSubName] = useState('');
    const [newSubCfu, setNewSubCfu] = useState('');
    const [newSubProf, setNewSubProf] = useState('');

    const [classSubjectId, setClassSubjectId] = useState('');
    const [classDay, setClassDay] = useState('1');
    const [classTime, setClassTime] = useState('');
    const [classRoom, setClassRoom] = useState('');

    const [examSubjectId, setExamSubjectId] = useState('');
    const [examDate, setExamDate] = useState('');
    const [examCfu, setExamCfu] = useState('');
    const [examGrade, setExamGrade] = useState('');

    const [deadSubjectSelect, setDeadSubjectSelect] = useState('custom');
    const [deadTitleCustom, setDeadTitleCustom] = useState('');
    const [deadDate, setDeadDate] = useState('');

    const fileInputRef = useRef(null);

    useEffect(() => {
        const sharedUid = searchParams.get('shared');
        if (sharedUid) {
            setIsGuestView(true);
            loadSharedCareer(sharedUid);
        } else {
            const unsubscribe = onAuthStateChanged(auth, (user) => {
                if (!user) {
                    navigate('/');
                } else {
                    setCurrentUser(user);
                    const docRef = doc(db, "users", user.uid, "university", "main");
                    const sub = onSnapshot(docRef, (docSnap) => {
                        if (docSnap.exists()) {
                            const d = docSnap.data();
                            setIsPublic(d.isUniPublic || false);
                            setUniData(d.uniData || { exams: [], deadlines: [], schedule: [], subjects: [] });
                        } else {
                            setUniData({ exams: [], deadlines: [], schedule: [], subjects: [] });
                        }
                        setLoading(false);
                    }, (error) => {
                        console.error("University Load Error:", error);
                        setLoading(false);
                    });
                    return () => sub();
                }
            });
            return () => unsubscribe();
        }
    }, [navigate, searchParams]);

    const loadSharedCareer = async (uid) => {
        try {
            const docRef = doc(db, "users", uid, "university", "main");
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.isUniPublic) {
                    setGuestData(data.uniData || { exams: [], subjects: [] });
                } else {
                    alert("Questa carriera è privata.");
                    navigate('/');
                }
            } else {
                alert("Utente non trovato.");
                navigate('/');
            }
            setLoading(false);
        } catch (e) {
            console.error(e);
            alert("Errore caricamento.");
            navigate('/');
        }
    };

    const saveToCloud = async (newData, publicStatus = isPublic) => {
        if (!currentUser || isGuestView) return;
        try {
            await setDoc(doc(db, "users", currentUser.uid, "university", "main"), { uniData: newData, isUniPublic: publicStatus }, { merge: true });
        } catch (e) { console.error("Err save:", e); }
    };

    // --- LOGIC ---
    const toggleShare = async () => {
        if (!currentUser) return;
        const msg = isPublic
            ? "Vuoi rendere la tua carriera PRIVATA? Il link smetterà di funzionare."
            : "Vuoi rendere PUBBLICA la tua carriera (CFU e Voti)?\nChiunque abbia il link potrà vederla (in sola lettura).";

        if (confirm(msg)) {
            const newStatus = !isPublic;
            setIsPublic(newStatus);
            await saveToCloud(uniData, newStatus);
            if (newStatus) {
                const link = `${window.location.origin}/university?shared=${currentUser.uid}`;
                navigator.clipboard.writeText(link).then(() => alert("Link copiato! 🔗"));
            } else {
                alert("Carriera resa privata 🔒");
            }
        }
    };

    const copyShareLink = () => {
        const link = `${window.location.origin}/university?shared=${currentUser.uid}`;
        navigator.clipboard.writeText(link).then(() => alert("Link copiato! 🔗"));
    };

    // Subjects
    const addSubject = (e) => {
        e.preventDefault();
        const newSub = { id: Date.now(), name: newSubName, cfu: parseInt(newSubCfu), prof: newSubProf };
        const newData = { ...uniData, subjects: [...(uniData.subjects || []), newSub] };
        setUniData(newData);
        saveToCloud(newData);
        setNewSubName(''); setNewSubCfu(''); setNewSubProf('');
    };

    const deleteSubject = (id) => {
        if (confirm("Eliminare?")) {
            const newData = { ...uniData, subjects: uniData.subjects.filter(s => s.id !== id) };
            setUniData(newData);
            saveToCloud(newData);
        }
    };

    // Schedule
    const addClass = (e) => {
        e.preventDefault();
        const newClass = {
            id: Date.now(),
            subjectId: parseInt(classSubjectId),
            day: parseInt(classDay),
            time: classTime,
            room: classRoom
        };
        let schedule = [...(uniData.schedule || []), newClass];
        schedule.sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));

        const newData = { ...uniData, schedule };
        setUniData(newData);
        saveToCloud(newData);
        setIsClassModalOpen(false);
        setClassSubjectId(''); setClassTime(''); setClassRoom('');
    };

    const deleteClass = (id) => {
        if (confirm("Rimuovere?")) {
            const newData = { ...uniData, schedule: uniData.schedule.filter(s => s.id !== id) };
            setUniData(newData);
            saveToCloud(newData);
        }
    };

    const clearSchedule = () => {
        if (confirm("Pulire orario?")) {
            const newData = { ...uniData, schedule: [] };
            setUniData(newData);
            saveToCloud(newData);
        }
    };

    // Exams
    const addExam = (e) => {
        e.preventDefault();
        const g = parseInt(examGrade);
        const newExam = {
            id: Date.now(),
            subjectId: parseInt(examSubjectId),
            date: examDate,
            cfu: parseInt(examCfu),
            grade: g === 31 ? 30 : g,
            laude: g === 31
        };
        const newData = { ...uniData, exams: [...(uniData.exams || []), newExam] };
        setUniData(newData);
        saveToCloud(newData);
        setExamSubjectId(''); setExamDate(''); setExamCfu(''); setExamGrade(''); setShowExamForm(false);
    };

    const deleteExam = (id) => {
        if (confirm("Eliminare?")) {
            const newData = { ...uniData, exams: uniData.exams.filter(e => e.id !== id) };
            setUniData(newData);
            saveToCloud(newData);
        }
    };

    const autoFillExamCfu = (subId) => {
        setExamSubjectId(subId);
        const s = uniData.subjects?.find(sub => sub.id === parseInt(subId));
        if (s) setExamCfu(s.cfu);
    };

    // Deadlines
    const addDeadline = (e) => {
        e.preventDefault();
        let title = deadTitleCustom;
        if (deadSubjectSelect !== 'custom') {
            const s = uniData.subjects?.find(sub => sub.id === parseInt(deadSubjectSelect));
            if (s) title = s.name;
        }

        if (!title) return;

        const newDead = { id: Date.now(), title, date: deadDate };
        let deadlines = [...(uniData.deadlines || []), newDead];
        deadlines.sort((a, b) => new Date(a.date) - new Date(b.date));

        const newData = { ...uniData, deadlines };
        setUniData(newData);
        saveToCloud(newData);
        setDeadTitleCustom(''); setDeadDate(''); setDeadSubjectSelect('custom');
    };

    const deleteDeadline = (id) => {
        const newData = { ...uniData, deadlines: uniData.deadlines.filter(d => d.id !== id) };
        setUniData(newData);
        saveToCloud(newData);
    };

    // Import/Export
    const exportData = () => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([JSON.stringify(uniData)], { type: "application/json" }));
        a.download = "university_backup.json";
        a.click();
    };

    const importData = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const r = new FileReader();
        r.onload = async (ev) => {
            try {
                const imported = JSON.parse(ev.target.result);
                if (confirm("Sovrascrivere i dati correnti?")) {
                    setUniData(imported);
                    await saveToCloud(imported);
                    alert("Importato!");
                }
            } catch { alert("Errore file."); }
        };
        r.readAsText(file);
    };

    // Stats
    const getStats = (data = uniData) => {
        const exams = data?.exams || [];
        const totalCfu = exams.reduce((a, b) => a + b.cfu, 0);
        let w = 0, a = 0;
        if (totalCfu > 0 && exams.length > 0) {
            exams.forEach(e => {
                w += e.grade * e.cfu;
                a += e.grade;
            });
            w = (w / totalCfu).toFixed(2);
            a = (a / exams.length).toFixed(2);
        } else {
            w = "0.00"; a = "0.00";
        }
        const percent = Math.min((totalCfu / 180) * 100, 100);
        return { totalCfu, weightedAvg: w, arithmeticAvg: a, percent };
    };

    const stats = getStats(isGuestView ? guestData : uniData);

    if (loading) return null;

    if (isGuestView) {
        // Style override for University - Indigo
        const pageStyle = {
            '--color-accent': '#6366f1', // Indigo-500
            '--color-accent-hover': '#4f46e5', // Indigo-600
        };

        return (
            <div className="min-h-screen p-4 md:p-8 flex flex-col items-center justify-center" style={pageStyle}>
                <div className="w-full max-w-5xl flex flex-col items-center pt-8 p-4">
                    <div className="text-center mb-8">
                        <h1 className="text-3xl font-bold text-white mb-2">Carriera Universitaria</h1>
                        <p className="text-textMuted">Condivisa tramite UniTracker</p>
                    </div>

                    <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="col-span-1 bento-card p-6 h-fit bg-cardDark border border-white/10 rounded-[24px]">
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Riepilogo</h3>
                            <div className="space-y-4">
                                <div>
                                    <div className="flex justify-between items-end mb-2">
                                        <span className="text-xs font-bold text-textMuted">Progresso</span>
                                        <span className="text-accent font-bold">{Math.round(stats.percent)}%</span>
                                    </div>
                                    <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
                                        <div className="bg-accent h-full rounded-full" style={{ width: `${stats.percent}%` }}></div>
                                    </div>
                                </div>
                                <div className="bg-black/20 p-3 rounded-xl border border-white/5 flex justify-between">
                                    <span className="text-xs font-bold text-textMuted uppercase">CFU</span>
                                    <span className="font-bold text-white">{stats.totalCfu}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                                        <p className="text-[10px] text-textMuted uppercase font-bold">Media Pond.</p>
                                        <p className="text-lg font-bold text-accent">{stats.weightedAvg}</p>
                                    </div>
                                    <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                                        <p className="text-[10px] text-textMuted uppercase font-bold">Media Aritm.</p>
                                        <p className="text-lg font-bold text-white">{stats.arithmeticAvg}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="col-span-1 md:col-span-2 bento-card p-6 bg-cardDark border border-white/10 rounded-[24px]">
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Esami Superati</h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm text-textMuted">
                                    <thead className="text-xs uppercase bg-white/5 text-white">
                                        <tr>
                                            <th className="px-4 py-3 rounded-l-lg">Data</th>
                                            <th className="px-4 py-3">Materia</th>
                                            <th className="px-4 py-3">CFU</th>
                                            <th className="px-4 py-3 rounded-r-lg">Voto</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {guestData?.exams?.map(e => {
                                            const s = guestData.subjects?.find(sub => sub.id === e.subjectId);
                                            return (
                                                <tr key={e.id} className="hover:bg-white/5">
                                                    <td className="px-4 py-3 font-mono">{new Date(e.date).toLocaleDateString()}</td>
                                                    <td className="px-4 py-3 font-medium text-white">{s ? s.name : '-'}</td>
                                                    <td className="px-4 py-3">{e.cfu}</td>
                                                    <td className="px-4 py-3 text-accent font-bold">{e.grade}{e.laude ? 'L' : ''}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Style override for University - Indigo
    const pageStyle = {
        '--color-accent': '#6366f1', // Indigo-500
        '--color-accent-hover': '#4f46e5', // Indigo-600
    };

    return (
        <div className="min-h-screen p-4 md:p-8 flex flex-col items-center" style={pageStyle}>
            <div className="fixed top-6 right-6 z-50 flex gap-2">
                <Link to="/app" className="btn-secondary rounded-full px-4 py-2 text-xs font-semibold no-underline shadow-lg bg-cardDark hover:bg-white/10">
                    🏠 Home
                </Link>
                <button onClick={() => signOut(auth).then(() => navigate('/'))} className="btn-secondary rounded-full px-4 py-2 text-xs font-semibold shadow-lg bg-cardDark hover:bg-red-500/10 hover:text-red-400">
                    Esci
                </button>
            </div>

            <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-4 gap-6 pt-16 md:pt-0">

                {/* SIDEBAR */}
                <div className="col-span-1 lg:col-span-1 flex flex-col gap-6">
                    <div className="bento-card p-6 bg-cardDark border border-white/5 rounded-[24px]">
                        <h1 className="text-3xl font-bold text-white mb-1 tracking-tight">Uni<span className="text-accent">Tracker</span></h1>
                        <p className="text-textMuted text-xs font-medium uppercase tracking-widest mb-6">Gestione Carriera</p>

                        <div className="grid grid-cols-2 gap-3 mb-6">
                            <a href="https://univpm.esse3.cineca.it/" target="_blank" rel="noreferrer" className="flex flex-col items-center justify-center p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-all group no-underline">
                                <span className="text-xl mb-1">🎓</span>
                                <span className="text-xs font-bold">ESSE3</span>
                            </a>
                            <a href="https://learn.univpm.it/" target="_blank" rel="noreferrer" className="flex flex-col items-center justify-center p-4 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 hover:bg-orange-500/20 transition-all group no-underline">
                                <span className="text-xl mb-1">📚</span>
                                <span className="text-xs font-bold">LEARN</span>
                            </a>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <div className="flex justify-between items-end mb-2">
                                    <span className="text-xs font-bold text-textMuted uppercase">Progresso Laurea</span>
                                    <span className="text-accent font-bold">{Math.round(stats.percent)}%</span>
                                </div>
                                <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
                                    <div className="bg-accent h-full rounded-full transition-all duration-1000" style={{ width: `${stats.percent}%` }}></div>
                                </div>
                            </div>

                            <div className="bg-black/20 p-4 rounded-xl border border-white/5 flex justify-between items-center">
                                <div><p className="text-[10px] text-textMuted uppercase font-bold">CFU Acquisiti</p><p className="text-2xl font-bold text-white">{stats.totalCfu}</p></div>
                                <div className="text-right"><p className="text-[10px] text-textMuted uppercase font-bold">Obiettivo</p><p className="text-sm font-bold text-textMuted">/ 180</p></div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-black/20 p-3 rounded-xl border border-white/5"><p className="text-[10px] text-textMuted uppercase font-bold">Media Pond.</p><p className="text-lg font-bold text-accent">{stats.weightedAvg}</p></div>
                                <div className="bg-black/20 p-3 rounded-xl border border-white/5"><p className="text-[10px] text-textMuted uppercase font-bold">Media Aritm.</p><p className="text-lg font-bold text-white">{stats.arithmeticAvg}</p></div>
                            </div>

                            <div className="pt-4 border-t border-white/5">
                                <h3 className="text-[10px] text-textMuted uppercase font-bold mb-2">Backup Dati</h3>
                                <div className="grid grid-cols-2 gap-2">
                                    <button onClick={exportData} className="bg-white/5 hover:bg-white/10 text-white py-2 rounded-lg text-xs font-bold border border-white/10 transition-all flex items-center justify-center gap-1">📤 Export</button>
                                    <button onClick={() => fileInputRef.current.click()} className="bg-white/5 hover:bg-white/10 text-white py-2 rounded-lg text-xs font-bold border border-white/10 transition-all flex items-center justify-center gap-1">📥 Import</button>
                                    <input type="file" ref={fileInputRef} accept=".json" className="hidden" onChange={importData} />
                                </div>
                            </div>

                            <div className="pt-2 border-t border-white/5">
                                {isPublic ? (
                                    <div className="grid grid-cols-2 gap-2">
                                        <button onClick={copyShareLink} className="w-full btn-secondary text-xs">🔗 Copia Link</button>
                                        <button onClick={toggleShare} className="w-full btn-secondary text-yellow-400 hover:text-yellow-300 border-yellow-500/20 hover:bg-yellow-500/10 text-xs">🔒 Privato</button>
                                    </div>
                                ) : (
                                    <button onClick={toggleShare} className="w-full btn-secondary text-accent hover:text-green-300 border-white/10 text-xs gap-2">🔗 Condividi Carriera</button>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="bento-card p-6 flex-grow bg-cardDark border border-white/5 rounded-[24px]">
                        <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">🔔 Scadenze</h3>
                        <form onSubmit={addDeadline} className="flex flex-col gap-2 mb-4">
                            <select value={deadSubjectSelect} onChange={e => setDeadSubjectSelect(e.target.value)} className="input-field bg-black/20">
                                <option value="custom">📝 Altro / Personale</option>
                                <option disabled>──────────</option>
                                {uniData.subjects?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                            {deadSubjectSelect === 'custom' && (
                                <input type="text" value={deadTitleCustom} onChange={e => setDeadTitleCustom(e.target.value)} placeholder="Es. Tasse, Iscrizione..." className="input-field bg-black/20" />
                            )}
                            <div className="flex gap-2">
                                <input type="date" value={deadDate} onChange={e => setDeadDate(e.target.value)} required className="input-field bg-black/20 flex-1" />
                                <button type="submit" className="btn-primary px-3 py-2 text-xs">+</button>
                            </div>
                        </form>
                        <div className="flex flex-col gap-2 overflow-y-auto max-h-[300px]">
                            {uniData.deadlines?.map(d => (
                                <div key={d.id} className="p-3 rounded-xl border bg-white/5 flex justify-between items-center mb-2 border-white/10">
                                    <div><p className="text-xs font-bold text-white">{d.title}</p><p className="text-[10px] text-textMuted">{new Date(d.date).toLocaleDateString()}</p></div>
                                    <button onClick={() => deleteDeadline(d.id)} className="text-textMuted hover:text-white">✕</button>
                                </div>
                            ))}
                            {!uniData.deadlines?.length && <p className="text-center text-xs text-textMuted">Nessuna</p>}
                        </div>
                    </div>
                </div>

                {/* MAIN CONTENT */}
                <div className="col-span-1 lg:col-span-3 flex flex-col gap-6">

                    {/* SCHEDULE */}
                    <div className="bento-card p-6 relative bg-cardDark border border-white/5 rounded-[24px]">
                        <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-4">
                            <div className="flex items-center gap-3">
                                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Orario Lezioni</h3>
                                <button onClick={() => setIsSubjectModalOpen(true)} className="text-[10px] bg-white/5 hover:bg-white/10 border border-white/10 text-textMuted hover:text-white px-3 py-1.5 rounded-lg font-semibold transition flex items-center gap-1">📚 Catalogo Materie</button>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={clearSchedule} className="text-xs bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1" title="Pulisci Orario">♻️ Reset</button>
                                <button onClick={() => setIsClassModalOpen(true)} className="text-xs bg-accent hover:bg-accentHover text-white px-3 py-1.5 rounded-lg font-bold transition">+ Lezione</button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                            {[1, 2, 3, 4, 5].map(day => (
                                <div key={day} className="flex flex-col gap-3">
                                    <div className="text-xs font-bold text-textMuted uppercase text-center pb-2 border-b border-white/5">{["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì"][day - 1]}</div>
                                    <div className="flex flex-col gap-2 min-h-[100px]">
                                        {uniData.schedule?.filter(x => x.day === day).map(x => {
                                            const s = uniData.subjects?.find(sub => sub.id === x.subjectId);
                                            return (
                                                <div key={x.id} className="bg-white/5 p-2 rounded-xl mb-2 border border-white/5">
                                                    <div className="flex justify-between"><span className="text-[10px] text-accent font-bold">{x.time}</span><button onClick={() => deleteClass(x.id)} className="text-[10px] text-red-400">✕</button></div>
                                                    <div className="font-bold text-xs text-white">{s ? s.name : '-'}</div>
                                                    <div className="text-[10px] text-textMuted">{x.room || ''}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* EXAMS */}
                    <div className="bento-card p-6 bg-cardDark border border-white/5 rounded-[24px]">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Libretto Universitario</h3>
                            <button onClick={() => setShowExamForm(!showExamForm)} className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-white px-3 py-1.5 rounded-lg font-bold transition">Registra Esame</button>
                        </div>

                        {showExamForm && (
                            <div className="bg-black/20 p-4 rounded-xl border border-white/5 mb-4">
                                <form onSubmit={addExam} className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div>
                                            <label className="input-label">Materia</label>
                                            <select value={examSubjectId} onChange={e => autoFillExamCfu(e.target.value)} required className="input-field">
                                                <option value="">-- Seleziona --</option>
                                                {uniData.subjects?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                            </select>
                                            <p className="text-[10px] text-textMuted mt-1">Non trovi la materia? <button type="button" onClick={() => { setShowExamForm(false); setIsSubjectModalOpen(true); }} className="text-accent hover:underline">Aggiungila al catalogo</button></p>
                                        </div>
                                        <div><label className="input-label">Data Svolgimento</label><input type="date" value={examDate} onChange={e => setExamDate(e.target.value)} required className="input-field" /></div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div><label className="input-label">CFU</label><input type="number" value={examCfu} onChange={e => setExamCfu(e.target.value)} min="1" max="18" required className="input-field" /></div>
                                        <div><label className="input-label">Voto</label><input type="number" value={examGrade} onChange={e => setExamGrade(e.target.value)} min="18" max="31" required className="input-field" /></div>
                                    </div>
                                    <div className="flex justify-end pt-2"><button type="submit" className="btn-secondary text-white text-xs px-6 py-2">Salva Esame</button></div>
                                </form>
                            </div>
                        )}

                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm text-textMuted">
                                <thead className="text-xs uppercase bg-white/5 text-white">
                                    <tr>
                                        <th className="px-4 py-3 rounded-l-lg">Data</th>
                                        <th className="px-4 py-3">Materia</th>
                                        <th className="px-4 py-3">CFU</th>
                                        <th className="px-4 py-3">Voto</th>
                                        <th className="px-4 py-3 rounded-r-lg text-right"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {uniData.exams?.map(e => {
                                        const s = uniData.subjects?.find(sub => sub.id === e.subjectId);
                                        return (
                                            <tr key={e.id} className="hover:bg-white/5">
                                                <td className="px-4 py-3 font-mono text-xs text-textMuted">{new Date(e.date).toLocaleDateString()}</td>
                                                <td className="px-4 py-3 font-medium text-white">{s ? s.name : '-'}</td>
                                                <td className="px-4 py-3">{e.cfu}</td>
                                                <td className="px-4 py-3 text-accent font-bold">{e.grade}{e.laude ? 'L' : ''}</td>
                                                <td className="px-4 py-3 text-right"><button onClick={() => deleteExam(e.id)} className="text-red-400">✕</button></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* SUBJECT MODAL */}
            {isSubjectModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-cardDark w-full max-w-md rounded-2xl border border-white/10 shadow-2xl p-6 relative flex flex-col max-h-[80vh]">
                        <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-4">
                            <h3 className="text-lg font-bold text-white">Catalogo Materie</h3>
                            <button onClick={() => setIsSubjectModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-textMuted">✕</button>
                        </div>
                        <form onSubmit={addSubject} className="mb-4 space-y-3">
                            <div className="grid grid-cols-4 gap-2">
                                <div className="col-span-3"><input type="text" value={newSubName} onChange={e => setNewSubName(e.target.value)} placeholder="Nome Materia" required className="w-full bg-bgApp border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent" /></div>
                                <div className="col-span-1"><input type="number" value={newSubCfu} onChange={e => setNewSubCfu(e.target.value)} placeholder="CFU" min="1" required className="w-full bg-bgApp border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent" /></div>
                            </div>
                            <input type="text" value={newSubProf} onChange={e => setNewSubProf(e.target.value)} placeholder="Docente" className="w-full bg-bgApp border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent" />
                            <button type="submit" className="w-full py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-white">Aggiungi al Catalogo</button>
                        </form>
                        <div className="flex-grow overflow-y-auto space-y-2 pr-2">
                            {uniData.subjects?.map(s => (
                                <div key={s.id} className="flex justify-between items-center bg-white/5 p-3 rounded-lg border border-white/5 mb-2">
                                    <div><div className="text-sm font-bold text-white flex gap-2 items-center">{s.name} <span className="text-[10px] bg-white/10 px-1 rounded">{s.cfu} CFU</span></div><div className="text-xs text-textMuted">{s.prof}</div></div>
                                    <button onClick={() => deleteSubject(s.id)} className="text-textMuted hover:text-red-400">🗑️</button>
                                </div>
                            ))}
                            {!uniData.subjects?.length && <p className="text-center text-xs text-textMuted">Vuoto</p>}
                        </div>
                    </div>
                </div>
            )}

            {/* CLASS MODAL */}
            {isClassModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-cardDark w-full max-w-sm rounded-2xl border border-white/10 shadow-2xl p-6">
                        <h3 className="text-lg font-bold text-white mb-4">Aggiungi Lezione</h3>
                        <form onSubmit={addClass} className="space-y-4">
                            <div>
                                <label className="input-label">Seleziona Materia</label>
                                <select value={classSubjectId} onChange={e => setClassSubjectId(e.target.value)} required className="input-field">
                                    <option value="">-- Scegli Materia --</option>
                                    {uniData.subjects?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="input-label">Giorno</label>
                                    <select value={classDay} onChange={e => setClassDay(e.target.value)} className="input-field">
                                        <option value="1">Lunedì</option>
                                        <option value="2">Martedì</option>
                                        <option value="3">Mercoledì</option>
                                        <option value="4">Giovedì</option>
                                        <option value="5">Venerdì</option>
                                    </select>
                                </div>
                                <div><label className="input-label">Orario</label><input type="text" value={classTime} onChange={e => setClassTime(e.target.value)} placeholder="09:00 - 11:00" required className="input-field" /></div>
                            </div>
                            <div><label className="input-label">Aula (Opzionale)</label><input type="text" value={classRoom} onChange={e => setClassRoom(e.target.value)} placeholder="Aula A1" className="input-field" /></div>
                            <div className="flex gap-2 pt-2">
                                <button type="button" onClick={() => setIsClassModalOpen(false)} className="flex-1 btn-secondary text-xs">Annulla</button>
                                <button type="submit" className="flex-1 btn-primary text-xs">Salva</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
