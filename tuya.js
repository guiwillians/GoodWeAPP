// tuya.js
const axios = require('axios');
const crypto = require('crypto');

const TUYA_API_URL = process.env.TUYA_API_URL;
const CLIENT_ID = process.env.TUYA_CLIENT_ID;
const CLIENT_SECRET = process.env.TUYA_CLIENT_SECRET;

async function getTuyaAccessToken() {
    const timestamp = Date.now().toString();
    // ... (rest of the code to get the access token) ...
}

async function getTuyaDeviceList(accessToken) {
    const headers = {
        'Authorization': `Bearer ${accessToken}`,
    };

    const response = await axios.get(
        `${TUYA_API_URL}/v1.0/iot-03/devices`,
        { headers: headers }
    );
    return response.data.result; // Esta é a linha que retorna a lista
}

// Esta linha é crucial para exportar as funções
module.exports = {
    getTuyaAccessToken,
    getTuyaDeviceList
};