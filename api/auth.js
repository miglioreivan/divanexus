import { Redis } from '@upstash/redis';
import crypto from 'crypto';

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = (redisUrl && redisToken && redisUrl !== 'YOUR_UPSTASH_REDIS_REST_URL' && redisUrl.trim() !== '')
    ? new Redis({ url: redisUrl, token: redisToken })
    : null;

const ADMIN_UID = "vdeS2SIosTWqeauP0PaZIllEG1f2";

// Helper to hash passwords using Node's native scrypt algorithm
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return { salt, hash };
}

// Helper to verify passwords
function verifyPassword(password, salt, storedHash) {
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return hash === storedHash;
}

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

export default async function handler(req, res) {
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
        return res.status(503).json({ error: "Redis non configurato lato server.", isFallback: true });
    }

    const { action, args } = req.body || {};
    if (!action) {
        return res.status(400).json({ error: "Azione non specificata." });
    }

    const cookies = parseCookies(req);
    const sessionToken = cookies.session_token;

    // Get current session if token is provided
    let currentUser = null;
    if (sessionToken) {
        try {
            currentUser = await redis.get(`session:${sessionToken}`);
        } catch (e) {
            console.error("Errore lettura sessione Redis:", e);
        }
    }

    try {
        switch (action) {
            case 'login': {
                const { email, password } = args || {};
                if (!email || !password) {
                    return res.status(400).json({ error: "Email e password richiesti." });
                }

                const cleanEmail = email.trim().toLowerCase();

                // 1. Auto-Bootstrapping: Se non esistono utenti in Redis, creiamo il primo utente come Admin
                const userCount = await redis.scard("users_set");
                if (userCount === 0) {
                    const { salt, hash } = hashPassword(password);
                    const uid = ADMIN_UID;

                    const adminCredentials = {
                        uid,
                        email: cleanEmail,
                        passwordHash: hash,
                        salt,
                        role: 'admin'
                    };

                    await redis.set(`auth:user:${cleanEmail}`, adminCredentials);
                    await redis.set(`user:${uid}`, { 
                        email: cleanEmail, 
                        role: 'admin', 
                        createdAt: new Date().toISOString() 
                    });
                    await redis.sadd("users_set", uid);
                    console.info(`👑 Bootstrapping: Creato il primo utente come Admin: ${cleanEmail}`);
                }

                // 2. Cerca le credenziali dell'utente
                const credentials = await redis.get(`auth:user:${cleanEmail}`);
                if (!credentials) {
                    return res.status(401).json({ error: "Email o password errati." });
                }

                // 3. Verifica la password
                const isPasswordValid = verifyPassword(password, credentials.salt, credentials.passwordHash);
                if (!isPasswordValid) {
                    return res.status(401).json({ error: "Email o password errati." });
                }

                // 4. Genera il token di sessione
                const token = `session_${crypto.randomUUID()}`;
                const sessionData = {
                    uid: credentials.uid,
                    email: credentials.email,
                    role: credentials.role
                };

                // Salva la sessione in Redis (Scadenza 7 giorni: 604800 secondi)
                await redis.set(`session:${token}`, sessionData, { ex: 604800 });

                // Imposta il cookie HTTPOnly
                res.setHeader('Set-Cookie', `session_token=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`);

                return res.status(200).json({
                    success: true,
                    user: sessionData
                });
            }

            case 'logout': {
                if (sessionToken) {
                    await redis.del(`session:${sessionToken}`);
                }
                res.setHeader('Set-Cookie', 'session_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
                return res.status(200).json({ success: true });
            }

            case 'me': {
                if (currentUser) {
                    return res.status(200).json({
                        authenticated: true,
                        user: currentUser
                    });
                }
                return res.status(200).json({ authenticated: false });
            }

            case 'createUser': {
                // Solo gli amministratori possono creare utenti
                if (!currentUser || currentUser.role !== 'admin') {
                    return res.status(403).json({ error: "Accesso negato. Solo l'amministratore può creare utenti." });
                }

                const { email: newUserEmail, password: newUserPassword, role = 'user' } = args || {};
                if (!newUserEmail || !newUserPassword) {
                    return res.status(400).json({ error: "Email e password richiesti." });
                }

                const cleanNewEmail = newUserEmail.trim().toLowerCase();

                // Verifica se l'utente esiste già
                const existing = await redis.get(`auth:user:${cleanNewEmail}`);
                if (existing) {
                    return res.status(400).json({ error: "Questo utente è già registrato." });
                }

                // Crea nuovo utente
                const { salt, hash } = hashPassword(newUserPassword);
                const newUid = `user_${crypto.randomUUID()}`;

                const newCredentials = {
                    uid: newUid,
                    email: cleanNewEmail,
                    passwordHash: hash,
                    salt,
                    role
                };

                await redis.set(`auth:user:${cleanNewEmail}`, newCredentials);
                await redis.set(`user:${newUid}`, {
                    email: cleanNewEmail,
                    role,
                    createdAt: new Date().toISOString()
                });
                await redis.sadd("users_set", newUid);

                return res.status(200).json({
                    success: true,
                    uid: newUid
                });
            }

            case 'changePassword': {
                if (!currentUser) {
                    return res.status(401).json({ error: "Utente non autenticato." });
                }

                const { currentPassword, newPassword } = args || {};
                if (!currentPassword || !newPassword) {
                    return res.status(400).json({ error: "Vecchia e nuova password richieste." });
                }

                const credentials = await redis.get(`auth:user:${currentUser.email.toLowerCase()}`);
                if (!credentials) {
                    return res.status(404).json({ error: "Credenziali non trovate." });
                }

                // Verifica vecchia password
                const isPasswordValid = verifyPassword(currentPassword, credentials.salt, credentials.passwordHash);
                if (!isPasswordValid) {
                    return res.status(400).json({ error: "Vecchia password errata." });
                }

                // Aggiorna password
                const { salt, hash } = hashPassword(newPassword);
                credentials.passwordHash = hash;
                credentials.salt = salt;

                await redis.set(`auth:user:${currentUser.email.toLowerCase()}`, credentials);

                return res.status(200).json({ success: true });
            }

            case 'updateAuth': {
                if (!currentUser) {
                    return res.status(401).json({ error: "Utente non autenticato." });
                }

                const { email: newEmail, password: newPassword } = args || {};
                const credentials = await redis.get(`auth:user:${currentUser.email.toLowerCase()}`);
                if (!credentials) {
                    return res.status(404).json({ error: "Credenziali non trovate." });
                }

                // If updating email
                if (newEmail && newEmail.trim().toLowerCase() !== currentUser.email.toLowerCase()) {
                    const cleanNewEmail = newEmail.trim().toLowerCase();
                    const existing = await redis.get(`auth:user:${cleanNewEmail}`);
                    if (existing) {
                        return res.status(400).json({ error: "Questa email è già in uso." });
                    }
                    
                    // Delete old credentials key, save under new email
                    await redis.del(`auth:user:${currentUser.email.toLowerCase()}`);
                    credentials.email = cleanNewEmail;
                    await redis.set(`auth:user:${cleanNewEmail}`, credentials);
                    
                    // Update session in Redis
                    currentUser.email = cleanNewEmail;
                    await redis.set(`session:${sessionToken}`, currentUser, { ex: 604800 });
                }

                // If updating password
                if (newPassword) {
                    const { salt, hash } = hashPassword(newPassword);
                    credentials.passwordHash = hash;
                    credentials.salt = salt;
                    await redis.set(`auth:user:${credentials.email.toLowerCase()}`, credentials);
                }

                return res.status(200).json({ success: true, user: currentUser });
            }

            default:
                return res.status(400).json({ error: `Azione non riconosciuta: ${action}` });
        }
    } catch (e) {
        console.error("❌ Errore API Auth:", e);
        return res.status(500).json({ error: `Errore Server Interno: ${e.message}` });
    }
}
