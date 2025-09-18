// tuya.js
const axios = require('axios');

const TUYA_API_URL = 'https://openapi.tuyaus.com'; // Use o URL da sua região
const CLIENT_ID = process.env.TUYA_CLIENT_ID;
const CLIENT_SECRET = process.env.TUYA_CLIENT_SECRET;

// Função para obter o token de acesso da Tuya
async function getTuyaAccessToken() {
    const response = await axios.get(
        `${TUYA_API_URL}/v1.0/token?grant_type=1`,
        { headers: { 'client_id': CLIENT_ID, 'secret_key': CLIENT_SECRET } }
    );
    return response.data.result.access_token;
}

// Função para obter a lista de dispositivos
async function getTuyaDeviceList(accessToken) {
    const response = await axios.get(
        `${TUYA_API_URL}/v1.0/iot-03/devices`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    return response.data.result;
}

// Exporta as funções para que o arquivo principal possa usá-las
module.exports = {
    getTuyaAccessToken,
    getTuyaDeviceList
};