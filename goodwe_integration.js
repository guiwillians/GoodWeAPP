// goodwe_integration.js
require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 3001;

// --- Conexão ao MongoDB ---
const DB_URI = process.env.DB_URI;
mongoose.connect(DB_URI)
    .then(() => console.log('✅ Serviço de Integração conectado ao MongoDB'))
    .catch(err => console.error('Erro de conexão ao MongoDB:', err));

// Esquema para os dados da powerstation
const powerDataSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    invId: { type: String, required: true },
    data: { type: Object, required: true },
    timestamp: { type: Date, default: Date.now }
});
const PowerData = mongoose.model('PowerData', powerDataSchema);

app.use(cors());
app.use(express.json());

// --- ROTAS DE ACESSO PÚBLICO E TESTE (Devem vir primeiro) ---

// Rota para gerar o Token JWT (POST /auth/login)
app.post('/auth/login', (req, res) => {
    // Usa um ObjectId válido para evitar erros de validação no MongoDB
    const user = { userId: '65f6c825a0a38b251b32e08e' }; 
    const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
});

// Rota de health check (GET /health)
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'API GoodWe está funcionando' });
});

// -----------------------------------------------------------


// Middleware de autenticação (Protege as rotas abaixo)
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


// --- Rotas da GoodWe (PROTEGIDAS) ---

app.post('/api/goodwe/sems-login', authenticateToken, async (req, res) => {
    const { account, pwd } = req.body;

    // --- REESTRUTURAÇÃO DO CÓDIGO DE LOGIN ---
    
    // 1. O SEMS API requer um token inicial que é apenas Base64(payload padrão)
    // Usamos um payload mínimo para estabilidade
    const tokenPayload = { "client": "web", "language": "en" };
    const initialToken = Buffer.from(JSON.stringify(tokenPayload)).toString('base64');

    const loginUrl = `${SEMS_BASE_URL}/api/v2/common/crosslogin`;
    const headers = { 
        "Token": initialToken, 
        "Content-Type": "application/json", 
        "Accept": "application/json" 
    };
    
    const payload = { 
        "account": account, 
        "pwd": pwd,
        "is_local": false 
    };

    try {
        // Tenta fazer o login com a nova estrutura
        const response = await axios.post(loginUrl, payload, { headers: headers, timeout: 20000 });
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
        // Retorna o erro 500 para evitar que o front-end trave
        res.status(500).json({ message: 'Erro ao tentar login na API GoodWe.' });
    }
});
// Rota para buscar e salvar dados da powerstation
app.post('/api/goodwe/data', authenticateToken, async (req, res) => {
    const { semsToken, invId, column, date } = req.body;

    if (!semsToken || !invId || !column || !date) {
        return res.status(400).json({ message: 'Parâmetros necessários faltando.' });
    }

    const dataUrl = `${SEMS_BASE_URL}/api/PowerStationMonitor/GetInverterDataByColumn`;
    const headers = { "Token": semsToken, "Content-Type": "application/json", "Accept": "*/*" };
    const payload = { "date": date, "column": column, "id": invId };

    try {
        const response = await axios.post(dataUrl, payload, { headers: headers, timeout: 20000 });
        const apiData = response.data;
        
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
        res.status(500).json({ message: 'Erro interno ao processar a requisição.' });
    }
});


app.listen(port, () => {
    console.log(`✅ Serviço de integração da GoodWe rodando em http://localhost:${port}`);
});