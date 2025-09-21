// tuya.js
const axios = require('axios');
const crypto = require('crypto');

const TUYA_API_URL = process.env.TUYA_API_URL;
const CLIENT_ID = process.env.TUYA_CLIENT_ID;
const CLIENT_SECRET = process.env.TUYA_CLIENT_SECRET;

async function getTuyaAccessToken() {
    const timestamp = Date.now().toString();

    const sign = crypto.createHmac('sha256', CLIENT_SECRET)
                       .update(CLIENT_ID + '\n' + timestamp)
                       .digest('hex')
                       .toUpperCase();

    const headers = {
        'client_id': CLIENT_ID,
        'sign': sign,
        't': timestamp,
        'sign_method': 'HMAC-SHA256',
    };

    try {
        const response = await axios.get(
            `${TUYA_API_URL}/v1.0/token?grant_type=1`,
            { headers: headers }
        );
        return response.data.result.access_token;
    } catch (error) {
        console.error('Erro ao obter token da Tuya:', error.response.data);
        throw new Error('Falha na autenticação com a API da Tuya');
    }
}

async function getTuyaDeviceList(accessToken) {
    const headers = {
        'Authorization': `Bearer ${accessToken}`,
    };

    const response = await axios.get(
        `${TUYA_API_URL}/v1.0/iot-03/devices`,
        { headers: headers }
    );
    return response.data.result;
}

module.exports = {
    getTuyaAccessToken,
    getTuyaDeviceList
};