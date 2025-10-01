// goodwe_integration.js (Foco em Potência e Bateria)
require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 3001;
const SEMS_BASE_URL = 'https://eu.semsportal.com';

// --- CONEXÃO COM O BANCO DE DADOS ---
const DB_URI = process.env.DB_URI;
mongoose.connect(DB_URI)
    .then(() => console.log('✅ Serviço de Integração conectado ao MongoDB'))
    .catch(err => console.error('Erro de conexão ao MongoDB:', err));

const powerDataSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    invId: { type: String, required: true },
    data: { type: Object, required: true },
    timestamp: { type: Date, default: Date.now }
});
const PowerData = mongoose.model('PowerData', powerDataSchema);

app.use(cors());
app.use(express.json());

// Middleware de autenticação
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) { return res.status(401).json({ error: 'Token de acesso necessário' }); }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Token inválido' });
    }
};


// --- ROTAS ESSENCIAIS (Públicas e Protegidas) ---

// Rota 1: Obtém o Token JWT (Chave de Acesso)
app.post('/auth/login', (req, res) => {
    const user = { userId: '65f6c825a0a38b251b32e08e' }; 
    const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
});

// Rota de health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'API GoodWe está funcionando' });
});


// Rota 2: Login na GoodWe e Geração do semsToken
app.post('/api/goodwe/sems-login', authenticateToken, async (req, res) => {
    // ... (Sua lógica de autenticação com a GoodWe) ...
    const { account, pwd } = req.body;
    const loginUrl = `${SEMS_BASE_URL}/api/v2/common/crosslogin`;
    // ... (O restante da lógica para construir o initialToken e fazer a requisição) ...

    try {
        // ... (Lógica para obter o semsToken) ...
        const semsData = { data: { token: 'EXEMPLO_TOKEN' } }; // Substituir pela chamada real
        const token = Buffer.from(JSON.stringify(semsData.data)).toString('base64');
        res.status(200).json({ semsToken: token });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao tentar login na API GoodWe.' });
    }
});


// Rota 3: Rota Unificada para Potência e Bateria (Dados Finais)
app.post('/api/solar/status', authenticateToken, async (req, res) => {
    const { semsToken, invId, date } = req.body;
    
    if (!semsToken || !invId || !date) {
        return res.status(400).json({ message: 'Parâmetros necessários faltando.' });
    }

    // Busca Potência (Pac) e Bateria (Soc) em chamadas separadas ou uma só
    const dataUrl = `${SEMS_BASE_URL}/api/PowerStationMonitor/GetInverterDataByColumn`;
    const headers = { "Token": semsToken, "Content-Type": "application/json", "Accept": "*/*" };
    
    // Teste 1: POTÊNCIA (Pac)
    const payloadPac = { "date": date, "column": "Pac", "id": invId };
    const resPac = await axios.post(dataUrl, payloadPac, { headers: headers, timeout: 20000 });

    // Teste 2: BATERIA (Soc)
    const payloadSoc = { "date": date, "column": "Soc", "id": invId };
    const resSoc = await axios.post(dataUrl, payloadSoc, { headers: headers, timeout: 20000 });
    
    // Processamento da resposta
    const potencia = resPac.data.data?.column1?.slice(-1)[0]?.column || 0;
    const bateria = resSoc.data.data?.column1?.slice(-1)[0]?.column || 0;

    res.status(200).json({
        ok: true,
        potencia_atual: parseFloat(potencia),
        soc_bateria: parseFloat(bateria),
        unidade_potencia: 'W',
        unidade_bateria: '%'
    });
});
// -------------------------------------------------------------------


app.listen(port, () => {
    console.log(`✅ Serviço de integração da GoodWe rodando em http://localhost:${port}`);
});