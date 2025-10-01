// goodwe_integration.js - VERSÃO FINAL SIMPLIFICADA PARA FRONTEND
require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 3001;

// --- CONEXÃO COM O BANCO DE DADOS (Inicia antes do servidor) ---
const DB_URI = process.env.DB_URI;
mongoose.connect(DB_URI)
    .then(() => console.log('✅ Serviço de Integração conectado ao MongoDB'))
    .catch(err => console.error('Erro de conexão ao MongoDB:', err));

// Esquema e Model (Mantidos para o MongoDB)
const powerDataSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    invId: { type: String, required: true },
    data: { type: Object, required: true },
    timestamp: { type: Date, default: Date.now }
});
const PowerData = mongoose.model('PowerData', powerDataSchema);

app.use(cors());
app.use(express.json());

// URL base da API do SEMS Portal
const SEMS_BASE_URL = 'https://eu.semsportal.com';


// -------------------------------------------------------------------
// --- ROTA ÚNICA E PODEROSA (NÃO PRECISA DE JWT) ---
// -------------------------------------------------------------------

// Rota Consolidada: Login GoodWe + Busca Dados + Salvar MongoDB
app.post('/api/goodwe/data', async (req, res) => { // <-- REMOVIDO: authenticateToken
    const { account, pwd, invId, column, date } = req.body; // Aceita credenciais no body

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
        const loginResponse = await axios.post(loginUrl, loginPayload, { headers: loginHeaders, timeout: 20000 });
        const semsData = loginResponse.data;
        
        if (semsData.code !== 0 && semsData.code !== 1 && semsData.code !== 200) {
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
        
        // 3. SALVAR NO MONGODB (Usando ID fixo para teste)
        const newPowerData = new PowerData({
            userId: '65f6c825a0a38b251b32e08e', // ID fixo de teste
            invId: invId,
            data: apiData
        });
        await newPowerData.save();
        
        res.status(200).json(apiData);

    } catch (error) {
        console.error('Erro ao processar a requisição:', error.message);
        res.status(500).json({ message: 'Erro interno ao processar a requisição.' });
    }
});
// -------------------------------------------------------------------


// --- ROTAS AUXILIARES ---

// Rota para gerar o Token JWT (MANTIDA para outras rotas protegidas)
app.post('/auth/login', (req, res) => {
    const user = { userId: '65f6c825a0a38b251b32e08e' }; 
    const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
});

// Middleware de autenticação (MANTIDO para proteger /tuya e outros)
const authenticateToken = (req, res, next) => {
    // ... (sua lógica JWT) ...
};

// Rota de health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'API GoodWe está funcionando' });
});

app.listen(port, () => {
    console.log(`✅ Serviço de integração da GoodWe rodando em http://localhost:${port}`);
});