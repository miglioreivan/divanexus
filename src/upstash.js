// Upstash Integration Client-Side Module
// All database transactions are securely routed via the Vercel API (/api/db) to protect tokens.


/**
 * Publishes a message to Upstash QStash topic
 * @param {string} topic The QStash topic name
 * @param {object} message The message payload
 */
export async function publishMessage(topic, message) {
    const qstashUrl = import.meta.env.VITE_QSTASH_URL || "https://qstash-eu-central-1.upstash.io";
    const qstashToken = import.meta.env.VITE_QSTASH_TOKEN;

    if (!qstashToken) {
        console.warn("⚠️ QStash Token non configurato. Messaggio non inviato:", topic);
        return;
    }

    try {
        const response = await fetch(`${qstashUrl}/v2/publish/${topic}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${qstashToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(message)
        });

        if (!response.ok) {
            throw new Error(`Status ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log("📨 Messaggio inviato a QStash topic:", topic, data);
        return data;
    } catch (error) {
        console.error("❌ Errore durante l'invio del messaggio a QStash:", error);
    }
}
