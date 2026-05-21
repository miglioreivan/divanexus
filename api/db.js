import { Redis } from '@upstash/redis';

// Initialize Redis only if the required credentials are provided
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = (redisUrl && redisToken && redisUrl !== 'YOUR_UPSTASH_REDIS_REST_URL' && redisUrl.trim() !== '')
    ? new Redis({ url: redisUrl, token: redisToken })
    : null;

const ADMIN_UID = "vdeS2SIosTWqeauP0PaZIllEG1f2";

// Cookie parser helper
function parseCookies(req) {
    const list = {};
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return list;

    cookieHeader.split(';').forEach(cookie => {
        let [name, ...rest] = cookie.split('=');
        name = name.trim();
        if (!name) return;
        const value = rest.join('=').trim();
        list[name] = decodeURIComponent(value);
    });
    return list;
}

function isOwner(uid, verifiedUid) {
    return uid && verifiedUid && uid === verifiedUid;
}

function isAdmin(verifiedUid) {
    return verifiedUid && verifiedUid === ADMIN_UID;
}

export default async function handler(req, res) {
    // Set headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: "Metodo non consentito. Utilizzare POST." });
    }

    if (!redis) {
        console.warn("⚠️ Upstash Redis non configurato lato server. Verrà restituito lo stato di Fallback.");
        return res.status(503).json({ error: "Redis non configurato", isFallback: true });
    }

    const { action, args } = req.body || {};
    if (!action) {
        return res.status(400).json({ error: "Azione non specificata." });
    }

    // Extract session token from cookie
    const cookies = parseCookies(req);
    const sessionToken = cookies.session_token;

    let verifiedUser = null;
    let verifiedUid = null;

    try {
        if (sessionToken) {
            const sessionData = await redis.get(`session:${sessionToken}`);
            if (sessionData) {
                verifiedUser = sessionData;
                verifiedUid = sessionData.uid;
            }
        }
    } catch (e) {
        console.warn("🔍 Sessione non verificata o scaduta:", e.message);
    }

    try {
        switch (action) {
            // -----------------------------------------
            // 1. PROFili UTENTE
            // -----------------------------------------
            case 'getUserProfile': {
                const { uid } = args || {};
                if (!isOwner(uid, verifiedUid) && !isAdmin(verifiedUid)) {
                    return res.status(403).json({ error: "Accesso negato. Non sei il proprietario o un admin." });
                }
                const data = await redis.get(`user:${uid}`);
                return res.status(200).json(data || null);
            }

            case 'setUserProfile': {
                const { uid, profileData, options } = args || {};
                if (!isOwner(uid, verifiedUid) && !isAdmin(verifiedUid)) {
                    return res.status(403).json({ error: "Accesso negato." });
                }
                let existing = {};
                if (options?.merge !== false) {
                    existing = (await redis.get(`user:${uid}`)) || {};
                }
                const updated = { ...existing, ...profileData };
                await redis.set(`user:${uid}`, updated);
                await redis.sadd("users_set", uid);
                return res.status(200).json({ success: true });
            }

            case 'getAllUsers': {
                if (!isAdmin(verifiedUid)) {
                    return res.status(403).json({ error: "Accesso negato. Solo gli amministratori possono listare gli utenti." });
                }
                const uids = await redis.smembers("users_set");
                const users = [];
                if (uids && uids.length > 0) {
                    for (const uid of uids) {
                        const profile = await redis.get(`user:${uid}`);
                        if (profile) {
                            users.push({ uid, ...profile });
                        }
                    }
                }
                return res.status(200).json(users);
            }

            case 'deleteUserProfile': {
                const { uid } = args || {};
                if (!isOwner(uid, verifiedUid) && !isAdmin(verifiedUid)) {
                    return res.status(403).json({ error: "Accesso negato." });
                }
                await redis.del(`user:${uid}`);
                await redis.del(`user:${uid}:lovetracker`);
                await redis.del(`user:${uid}:university`);
                await redis.srem("users_set", uid);
                return res.status(200).json({ success: true });
            }

            // -----------------------------------------
            // 2. LOVE TRACKER
            // -----------------------------------------
            case 'getLoveTrackerData': {
                const { uid } = args || {};
                if (!isOwner(uid, verifiedUid) && !isAdmin(verifiedUid)) {
                    return res.status(403).json({ error: "Accesso negato." });
                }
                const data = await redis.get(`user:${uid}:lovetracker`);
                return res.status(200).json(data?.data || {});
            }

            case 'setLoveTrackerData': {
                const { uid, loveData } = args || {};
                if (!isOwner(uid, verifiedUid) && !isAdmin(verifiedUid)) {
                    return res.status(403).json({ error: "Accesso negato." });
                }
                await redis.set(`user:${uid}:lovetracker`, { 
                    data: loveData, 
                    lastUpdate: new Date().toISOString() 
                });
                return res.status(200).json({ success: true });
            }

            // -----------------------------------------
            // 3. UNIVERSITY
            // -----------------------------------------
            case 'getUniversityData': {
                const { uid } = args || {};
                const data = await redis.get(`user:${uid}:university`);
                if (data) {
                    const isPublic = data.isUniPublic || false;
                    if (isPublic || isOwner(uid, verifiedUid) || isAdmin(verifiedUid)) {
                        return res.status(200).json(data);
                    } else {
                        return res.status(403).json({ error: "Accesso negato. Questa carriera è privata." });
                    }
                }
                
                // Se non esiste ancora ma siamo proprietario/admin, inviamo il template base
                if (isOwner(uid, verifiedUid) || isAdmin(verifiedUid)) {
                    return res.status(200).json({ uniData: { exams: [], deadlines: [], schedule: [], subjects: [] }, isUniPublic: false });
                }
                return res.status(404).json({ error: "Carriera non trovata." });
            }

            case 'setUniversityData': {
                const { uid, uniData, isUniPublic } = args || {};
                if (!isOwner(uid, verifiedUid) && !isAdmin(verifiedUid)) {
                    return res.status(403).json({ error: "Accesso negato." });
                }
                await redis.set(`user:${uid}:university`, { uniData, isUniPublic });
                return res.status(200).json({ success: true });
            }

            // -----------------------------------------
            // 4. REGISTRATION REQUESTS
            // -----------------------------------------
            case 'getRegistrationRequests': {
                if (!isAdmin(verifiedUid)) {
                    return res.status(403).json({ error: "Accesso negato." });
                }
                const dataMap = await redis.hgetall("registration_requests");
                const list = [];
                if (dataMap) {
                    Object.entries(dataMap).forEach(([id, req]) => {
                        const parsed = typeof req === 'string' ? JSON.parse(req) : req;
                        list.push({ id, ...parsed });
                    });
                }
                return res.status(200).json(list);
            }

            case 'addRegistrationRequest': {
                const { requestData } = args || {};
                const enrichedData = {
                    ...requestData,
                    status: 'pending',
                    timestamp: new Date().toISOString()
                };
                const id = `req_${Date.now()}`;
                await redis.hset("registration_requests", { [id]: enrichedData });
                return res.status(200).json({ id });
            }

            case 'deleteRegistrationRequest': {
                const { id } = args || {};
                if (!isAdmin(verifiedUid)) {
                    return res.status(403).json({ error: "Accesso negato." });
                }
                await redis.hdel("registration_requests", id);
                return res.status(200).json({ success: true });
            }

            default:
                return res.status(400).json({ error: `Azione non riconosciuta: ${action}` });
        }
    } catch (e) {
        console.error("❌ Errore esecuzione azione DB:", e);
        return res.status(500).json({ error: `Errore Server Interno: ${e.message}` });
    }
}
