const express = require('express');
const axios = require('axios');
const cors = require('cors');
const mongoose = require('mongoose');
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
    sn: { type: String, required: true }, // Número de série do dispositivo
    data: { type: Object, required: true }, // Os dados brutos da API
    timestamp: { type: Date, default: Date.now }
});

const PowerData = mongoose.model('PowerData', powerDataSchema);

app.use(cors());

// URL da API da GoodWe
const GOODWE_API_URL = 'https://www.semsportal.com/powerstation/PowerStatusSnMin/deaa8eb0-3f71-4b34-9680-09ab855fbc6c';

// Rota protegida para buscar e salvar os dados da powerstation
app.get('/api/goodwe/data', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        console.log(`Buscando dados para o usuário: ${req.user.email}`);

        // 1. Busca os dados da API da GoodWe
        const response = await axios.get(GOODWE_API_URL);
        const apiData = response.data;

        // 2. Salva os dados no MongoDB
        const newPowerData = new PowerData({
            userId: userId,
            sn: 'deaa8eb0-3f71-4b34-9680-09ab855fbc6c', // ID da powerstation
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
            res.status(503).json({ message: 'Não foi possível conectar à API da GoodWe. Serviço indisponível.' });
        } else {
            res.status(500).json({ message: 'Erro interno ao processar a requisição.' });
        }
    }
});

app.listen(port, () => {
    console.log(`Serviço de integração da GoodWe rodando em http://localhost:${port}`);
});
