// Carrega as variáveis de ambiente do arquivo .env
require('dotenv').config();

const express = require('express');
const axios = require('axios');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const authenticateToken = require('./auth_middleware');

const app = express();
const port = process.env.PORT || 3001;
const cors = require('cors');

app.use(cors({
    origin: [
        'https://*.vercel.app',
        'https://*.vercel.app/*',
        'https://vercel.app',
        'https://alexa.amazon.com',
        'https://*.amazonaws.com'
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Token']
}));

// Habilite preflight requests
app.options('*', cors());
// Configuração para conectar ao MongoDB
const DB_URI = process.env.DB_URI;
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

// URL base da API do SEMS Portal
const SEMS_BASE_URL = 'https://eu.semsportal.com';

// --- NOVA ROTA PARA GERAR O TOKEN JWT ---
// Use esta rota para obter o token para as rotas protegidas
app.post('/auth/login', (req, res) => {
    // Este é um exemplo simples. Em um projeto real, você verificaria o login e a senha aqui.
    // O userId pode ser qualquer identificador único que você salve.
    const user = {
        userId: '65f6c825a0a38b251b32e08e', // Exemplo de um ObjectId fixo para testes
    };

    const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
});

// --- Rota de login para a API do SEMS Portal ---
app.post('/api/goodwe/sems-login', authenticateToken, async (req, res) => {
    const { account, pwd } = req.body;

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

// --- Rota protegida para buscar e salvar os dados da powerstation ---
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

// Importa o construtor da Skill da Alexa do novo arquivo
const alexaSkillBuilder = require('./api/alexa');

// ... (todas as suas rotas anteriores) ...

// --- Rota para a Alexa ---
// A Alexa enviará todas as requisições para este endpoint
// A sua rota /alexa no arquivo goodwe_integration.js
app.post('/alexa', async (req, res) => {
    try {
        const skill = alexaSkillBuilder.create();
        const response = await skill.invoke(req.body);
        res.json(response);
    } catch (error) {
        console.error('Erro ao processar requisição da Alexa:', error.message);
        res.status(500).json({ error: 'Erro interno do servidor Alexa.' });
    }
});

app.listen(port, () => {
    console.log(`Serviço de integração da GoodWe rodando em http://localhost:${port}`);
});