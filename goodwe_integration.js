require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 3001;

// Configuração para conectar ao MongoDB
const DB_URI = process.env.DB_URI;
mongoose.connect(DB_URI)
    .then(() => console.log('Serviço de Integração conectado ao MongoDB'))
    .catch(err => console.error('Erro de conexão ao MongoDB:', err));

// Esquema para os dados da powerstation
const powerDataSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    invId: { type: String, required: true },
    data: { type: Object, required: true },
    timestamp: { type: Date, default: Date.now }
});

const PowerData = mongoose.model('PowerData', powerDataSchema);

// Configuração CORS correta
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Middleware de autenticação simplificado
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token de acesso necessário' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Token inválido' });
    }
};

// URL base da API do SEMS Portal
const SEMS_BASE_URL = 'https://eu.semsportal.com';

// Rota de login para a API do SEMS Portal
app.post('/api/goodwe/sems-login', authenticateToken, async (req, res) => {
    const { account, pwd } = req.body;

    const initialTokenPayload = { 
        "uid": "", 
        "timestamp": 0, 
        "token": "", 
        "client": "web", 
        "version": "", 
        "language": "en" 
    };
    
    const initialToken = Buffer.from(JSON.stringify(initialTokenPayload)).toString('base64');

    const loginUrl = `${SEMS_BASE_URL}/api/v2/common/crosslogin`;
    const headers = { 
        "Token": initialToken, 
        "Content-Type": "application/json", 
        "Accept": "*/*" 
    };
    
    const payload = { 
        "account": account, 
        "pwd": pwd, 
        "agreement_agreement": 0, 
        "is_local": false 
    };

    try {
        const response = await axios.post(loginUrl, payload, { 
            headers: headers, 
            timeout: 20000 
        });
        
        const semsData = response.data;

        if (semsData.code === 0 || semsData.code === 1 || semsData.code === 200) {
            const token = Buffer.from(JSON.stringify(semsData.data)).toString('base64');
            res.status(200).json({ semsToken: token });
        } else {
            res.status(401).json({ 
                message: 'Falha no login com a API GoodWe.', 
                details: semsData 
            });
        }
    } catch (error) {
        console.error('Erro no crosslogin:', error.message);
        res.status(500).json({ 
            message: 'Erro ao tentar login na API GoodWe.' 
        });
    }
});

// Rota para buscar e salvar dados da powerstation
app.post('/api/goodwe/data', authenticateToken, async (req, res) => {
    const { semsToken, invId, column, date } = req.body;

    if (!semsToken || !invId || !column || !date) {
        return res.status(400).json({ 
            message: 'Parâmetros necessários faltando.' 
        });
    }

    const dataUrl = `${SEMS_BASE_URL}/api/PowerStationMonitor/GetInverterDataByColumn`;
    const headers = { 
        "Token": semsToken, 
        "Content-Type": "application/json", 
        "Accept": "*/*" 
    };
    
    const payload = { 
        "date": date, 
        "column": column, 
        "id": invId 
    };

    try {
        const response = await axios.post(dataUrl, payload, { 
            headers: headers, 
            timeout: 20000 
        });
        
        const apiData = response.data;
        
        // Salva os dados no MongoDB
        const newPowerData = new PowerData({
            userId: req.user.userId,
            invId: invId,
            data: apiData
        });
        
        await newPowerData.save();
        console.log('Dados salvos no MongoDB com sucesso.');
        
        res.status(200).json(apiData);
    } catch (error) {
        console.error('Erro ao processar a requisição:', error.message);
        res.status(500).json({ 
            message: 'Erro interno ao processar a requisição.' 
        });
    }
});
const tuya = require('./tuya'); // Importa as funções do arquivo tuya.js

// Nova rota para listar dispositivos Tuya
app.get('/api/tuya/devices', async (req, res) => {
    try {
        const accessToken = await tuya.getTuyaAccessToken();
        const deviceList = await tuya.getTuyaDeviceList(accessToken);

        res.status(200).json(deviceList);
    } catch (error) {
        console.error('Erro na integração Tuya:', error.message);
        res.status(500).json({ message: 'Erro ao conectar com a API Tuya.' });
    }
});

// Rota de health check
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        message: 'API GoodWe está funcionando' 
    });
});

app.listen(port, () => {
    console.log(`✅ Serviço de integração da GoodWe rodando em http://localhost:${port}`);
});