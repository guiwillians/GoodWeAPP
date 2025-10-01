// goodwe_integration.js - VERSÃO FINAL CORRIGIDA
require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 3001;

// -----------------------------------------------------
// --- 1. DEFINIÇÕES E MIDDLEWARES (TUDO ANTES DO LISTEN) ---
// -----------------------------------------------------

// Esquema para os dados da powerstation (Definição deve vir antes)
const powerDataSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    invId: { type: String, required: true },
    data: { type: Object, required: true },
    timestamp: { type: Date, default: Date.now }
});
const PowerData = mongoose.model('PowerData', powerDataSchema);

app.use(cors());
app.use(express.json());

// Rota para gerar o Token JWT (POST /auth/login)
app.post('/auth/login', (req, res) => {
    const user = { userId: '65f6c825a0a38b251b32e08e' }; 
    const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
});

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

// URL base da API do SEMS Portal
const SEMS_BASE_URL = 'https://eu.semsportal.com';
// --- ROTAS DA API ---
// (Definição de todas as suas rotas de GoodWe e Tuya)
app.post('/api/goodwe/sems-login', authenticateToken, async (req, res) => {
    // ... (Lógica de login GoodWe) ...
});
app.post('/api/goodwe/data', authenticateToken, async (req, res) => {
    // ... (Lógica de data GoodWe) ...
});
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'API GoodWe está funcionando' });
});


// -------------------------------------------------------------------
// --- 2. INÍCIO SÓ APÓS A CONEXÃO COM O BANCO DE DADOS (CORREÇÃO) ---
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
        // Em um sistema real, você sairia do processo aqui
        process.exit(1); 
    });