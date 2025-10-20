// goodwe_integration.js - VERSÃO FINAL REESTRUTURADA
require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 3001;
const SEMS_BASE_URL = 'https://us.semsportal.com';

// --- DEFINIÇÕES DO MONGODB (Schema e Model) ---
const powerDataSchema = new mongoose.Schema({
    // Usamos String para userId aqui para compatibilidade mais fácil com o ID fixo de teste
    userId: { type: String, required: true }, 
    invId: { type: String, required: true },
    data: { type: Object, required: true },
    timestamp: { type: Date, default: Date.now }
});
const PowerData = mongoose.model('PowerData', powerDataSchema);

app.use(cors());
app.use(express.json());


// --- ROTAS DE ACESSO PÚBLICO E TESTE (Devem vir primeiro) ---

// Rota de health check (GET /health)
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'API GoodWe está funcionando' });
});

// Rota de teste JWT (POST /auth/login)
app.post('/auth/login', (req, res) => {
    const user = { userId: '65f6c825a0a38b251b32e08e' }; 
    const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
});


// -------------------------------------------------------------------
// --- ROTA CONSOLIDADA DE DADOS GOODWE (Sem JWT) ---
// -------------------------------------------------------------------

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
        // Tenta obter o semsToken (Login GoodWe)
        const loginResponse = await axios.post(loginUrl, loginPayload, { headers: loginHeaders, timeout: 2000 });
        const semsData = loginResponse.data;
        
        // ... (Verificação de código de sucesso) ...
        
        // ... (O restante da lógica de busca e salvamento no MongoDB) ...

        res.status(200).json(apiData);

    } catch (error) {
        // --- CAPTURA DE ERRO ROBUSTA ---
        console.error('❌ ERRO CRÍTICO NA REQUISIÇÃO GOODWE:', error.message);
        
        let errorMessage = 'Erro ao tentar fazer login na API GoodWe.';
        
        // Se for um erro de rede (Timeout, DNS, etc.)
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            errorMessage = 'Falha de conexão com a API GoodWe. Verifique o servidor.';
        }
        // Se for um erro de resposta HTTP (401, 500, etc.)
        else if (error.response && error.response.data) {
            // Se a GoodWe retornou um erro estruturado, mostre-o.
            return res.status(error.response.status).json({
                message: 'Falha no login com a API GoodWe.', 
                details: error.response.data
            });
        }
        
        // Erro genérico
        res.status(500).json({ message: errorMessage });
    }
});


// -------------------------------------------------------------------
// --- INÍCIO DO SERVIDOR APÓS O MONGO DB CONECTAR (FIX DO TIMEOUT) ---
// -------------------------------------------------------------------

const DB_URI = process.env.DB_URI;
mongoose.connect(DB_URI)
    .then(() => {
        console.log('✅ Serviço de Integração conectado ao MongoDB');
        // APENAS INICIA O SERVIDOR DEPOIS QUE O MONGO ESTÁ CONECTADO
        app.listen(port, () => {
            console.log(`✅ Servidor rodando em http://localhost:${port}`);
        });
    })
    .catch(err => {
        console.error('❌ Erro de conexão FATAL ao MongoDB:', err.message);
        process.exit(1); 
    });