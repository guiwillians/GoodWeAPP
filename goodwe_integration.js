// goodwe_integration.js - SEM JWT
require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const port = process.env.PORT || 3001;
const SEMS_BASE_URL = 'https://eu.semsportal.com';

// --- CONEXÃO COM O BANCO DE DADOS ---
const DB_URI = process.env.DB_URI;
mongoose.connect(DB_URI)
    .then(() => console.log('✅ Serviço de Integração conectado ao MongoDB'))
    .catch(err => console.error('Erro de conexão ao MongoDB:', err));

// Esquema para os dados da powerstation
const powerDataSchema = new mongoose.Schema({
    userId: { type: String, required: true }, // Mantido como String para o ID fixo
    invId: { type: String, required: true },
    data: { type: Object, required: true },
    timestamp: { type: Date, default: Date.now }
});
const PowerData = mongoose.model('PowerData', powerDataSchema);

app.use(cors());
app.use(express.json());

// --- ROTAS DE ACESSO LIVRE ---

// Rota de health check (GET /health)
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'API GoodWe está funcionando' });
});

// Rota Consolidada: Login GoodWe + Busca Dados + Salvar MongoDB (ACESSO LIVRE)
app.post('/api/goodwe/data', async (req, res) => {
    // Aceita credenciais no body
    const { account, pwd, invId, column, date } = req.body;

    if (!account || !pwd || !invId || !column || !date) {
        return res.status(400).json({ message: 'Credenciais e parâmetros necessários faltando.' });
    }

    // --- 1. LÓGICA DE AUTENTICAÇÃO INTERNA (GoodWe Login) ---
    const initialTokenPayload = { "client": "web", "version": "v1.0.0", "language": "en" };
    const initialToken = Buffer.from(JSON.stringify(initialTokenPayload)).toString('base64');
    const loginUrl = `${SEMS_BASE_URL}/api/v2/common/crosslogin`;
    const loginHeaders = { "Token": initialToken, "Content-Type": "application/json", "Accept": "application/json" };
    const loginPayload = { "account": account, "pwd": pwd, "is_local": false };

    try {
        // Tenta obter o semsToken
        const loginResponse = await axios.post(loginUrl, loginPayload, { headers: loginHeaders, timeout: 5000 });
        const semsData = loginResponse.data;
        
        if (semsData.code !== 0 && semsData.code !== 1 && semsData.code !== 200) {
            // Se o login GoodWe falhar, retorna o erro 401
            return res.status(401).json({ message: 'Falha no login com a API GoodWe. Verifique as credenciais.', details: semsData });
        }
        
        const semsToken = Buffer.from(JSON.stringify(semsData.data)).toString('base64');
        // --- FIM DA AUTENTICAÇÃO ---

        // 2. BUSCAR DADOS USANDO O TOKEN OBTIDO
        const dataUrl = `${SEMS_BASE_URL}/api/PowerStationMonitor/GetInverterDataByColumn`;
        const dataHeaders = { "Token": semsToken, "Content-Type": "application/json", "Accept": "*/*" };
        const dataPayload = { "date": date, "column": column, "id": invId };

        const response = await axios.post(dataUrl, dataPayload, { headers: dataHeaders, timeout: 20000 });
        const apiData = response.data;
        
        // 3. SALVAR NO MONGODB (ID fixo, pois não há login de usuário)
        const newPowerData = new PowerData({
            userId: '65f6c825a0a38b251b32e08e', 
            invId: invId,
            data: apiData
        });
        await newPowerData.save();
        
        res.status(200).json(apiData);

    } catch (error) {
        console.error('❌ Erro ao processar a requisição:', error.message);
        res.status(500).json({ message: 'Erro interno ao processar a requisição.' });
    }
});


app.listen(port, () => {
    console.log(`✅ Serviço de integração da GoodWe rodando em http://localhost:${port}`);
});