const express = require('express');
const axios = require('axios');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken'); // Importa o JWT para usar o secret
const authenticateToken = require('./auth_middleware');

const app = express();
const port = 3001;

// Configuração para conectar ao MongoDB
const DB_URI = 'mongodb://localhost:27017/goodwe_app';
mongoose.connect(DB_URI)
    .then(() => console.log('Serviço de Integração conectado ao MongoDB'))
    .catch(err => console.error('Erro de conexão ao MongoDB:', err));

// Esquema (Schema) para os dados da powerstation
const powerDataSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    invId: { type: String, required: true },
    data: { type: Object, required: true },
    timestamp: { type: Date, default: Date.now }
});

const PowerData = mongoose.model('PowerData', powerDataSchema);

app.use(cors());
app.use(express.json());

// URL base da API do SEMS Portal (use 'us' ou 'eu' conforme a região do inversor)
const SEMS_BASE_URL = 'https://eu.semsportal.com';

// Rota de login para a API do SEMS Portal
// Esta rota é interna e usada apenas pelo nosso back-end
app.post('/api/goodwe/sems-login', authenticateToken, async (req, res) => {
    const { account, pwd } = req.body;
    
    // Constrói o token inicial (como no código Python)
    const initialTokenPayload = { "uid": "", "timestamp": 0, "token": "", "client": "web", "version": "", "language": "en" };
    const initialToken = Buffer.from(JSON.stringify(initialTokenPayload)).toString('base64');
    
    const loginUrl = `${SEMS_BASE_URL}/api/v2/common/crosslogin`;
    const headers = { "Token": initialToken, "Content-Type": "application/json", "Accept": "*/*" };
    const payload = { "account": account, "pwd": pwd, "agreement_agreement": 0, "is_local": false };
    
    try {
        const response = await axios.post(loginUrl, payload, { headers: headers, timeout: 20000 });
        const semsData = response.data;
        
        if (semsData.code === 0 || semsData.code === 1 || semsData.code === 200) {
            const token = Buffer.from(JSON.stringify(semsData.data)).toString('base64');
            res.status(200).json({ semsToken: token });
        } else {
            res.status(401).json({ message: 'Falha no login com a API GoodWe.', details: semsData });
        }
    } catch (error) {
        console.error('Erro no crosslogin:', error.message);
        res.status(500).json({ message: 'Erro ao tentar login na API GoodWe.' });
    }
});

// Rota protegida para buscar e salvar os dados da powerstation
app.post('/api/goodwe/data', authenticateToken, async (req, res) => {
    const { semsToken, invId, column, date } = req.body;
    
    if (!semsToken || !invId || !column || !date) {
        return res.status(400).json({ message: 'Parâmetros necessários faltando.' });
    }

    const dataUrl = `${SEMS_BASE_URL}/api/PowerStationMonitor/GetInverterDataByColumn`;
    const headers = { "Token": semsToken, "Content-Type": "application/json", "Accept": "*/*" };
    const payload = { "date": date, "column": column, "id": invId };

    try {
        // 1. Busca os dados da API da GoodWe
        const response = await axios.post(dataUrl, payload, { headers: headers, timeout: 20000 });
        const apiData = response.data;
        
        // 2. Salva os dados no MongoDB (associa ao ID do nosso usuário)
        const newPowerData = new PowerData({
            userId: req.user.userId,
            invId: invId,
            data: apiData
        });
        await newPowerData.save();
        console.log('Dados da API salvos no MongoDB com sucesso.');
        
        // 3. Retorna os dados para o front-end
        res.status(200).json(apiData);
    } catch (error) {
        console.error('Erro ao processar a requisição:', error.message);
        if (error.response) {
            res.status(error.response.status).json({ message: 'Erro na API da GoodWe', details: error.response.data });
        } else if (error.request) {
            res.status(503).json({ message: 'Não foi possível conectar à API da GoodWe.' });
        } else {
            res.status(500).json({ message: 'Erro interno ao processar a requisição.' });
        }
    }
});

app.listen(port, () => {
    console.log(`Serviço de integração da GoodWe rodando em http://localhost:${port}`);
});
