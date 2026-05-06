// auth_pal/utils/notification.js

const sendNotificationToQueue = async (jenis, email, isi_email) => {
    try {
        const url = process.env.NOTIFICATION_SERVICE_URL;
        const apiKey = process.env.INTERNAL_API_KEY;

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey,
            },
            body: JSON.stringify({
                jenis,
                email,
                isi_email,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("Gagal menambahkan ke antrean notifikasi:", data.message);
            return false;
        }

        console.log(`Berhasil menambahkan antrean email untuk: ${email}`);
        return true;
    } catch (error) {
        console.error("Gagal menghubungi Notification Service:", error.message);
        return false;
    }
};

module.exports = { sendNotificationToQueue };