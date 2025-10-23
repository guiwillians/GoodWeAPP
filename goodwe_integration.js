// goodwe_integration.js - VERSÃO FINAL (Endpoint Otimizado)
require('dotenv').config();
console.log('--- 1. dotenv carregado ---');

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const mongoose = require('mongoose');

console.log('--- 2. Módulos carregados ---');

const app = express();
const port = process.env.PORT || 3001;
// Usamos 'eu' para inversores no Brasil, que é o endpoint mais estável
const SEMS_BASE_URL = process.env.SEMS_BASE_URL || 'https://us.semsportal.com'; 

// --- MIDDLEWARES E CONFIGURAÇÃO ---
console.log('--- 3. Configurando Middlewares ---');
app.use(cors());
app.use(express.json());

// --- SCHEMA E MODEL DO MONGODB ---
const powerDataSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    invId: { type: String, required: true },
    data: { type: Object, required: true },
    timestamp: { type: Date, default: Date.now }
});
const PowerData = mongoose.model('PowerData', powerDataSchema);
console.log('--- 4. Schema MongoDB definido ---');


// Rota de health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'API GoodWe está funcionando' });
});

// Rota de Dashboard Unificada: Pega todos os dados necessários
app.post('/api/dashboard', async (req, res) => {
    const { account, pwd, invId } = req.body;
    console.log(`[LOG] Recebida requisição para o dashboard: /api/dashboard`);

    if (!account || !pwd || !invId) {
        return res.status(400).json({ message: 'Credenciais e ID do inversor são necessários.' });
    }

    // --- 1. LÓGICA DE AUTENTICAÇÃO INTERNA (GoodWe Login) ---
    const initialTokenPayload = { "client": "web", "version": "v1.0.0", "language": "en" };
    const initialToken = Buffer.from(JSON.stringify(initialTokenPayload)).toString('base64');
    const loginUrl = `${SEMS_BASE_URL}/api/v2/common/crosslogin`;
    const loginHeaders = { "Token": initialToken, "Content-Type": "application/json", "Accept": "application/json" };
    const loginPayload = { "account": account, "pwd": pwd, "is_local": false };

    try {
        console.log('-> Tentando login na API GoodWe...');
        const loginResponse = await axios.post(loginUrl, loginPayload, { headers: loginHeaders, timeout: 15000 });
        const semsData = loginResponse.data;

        if (semsData.code !== 0 && semsData.code !== 1 && semsData.code !== 200) {
            console.error('-> Falha no Login GoodWe (Credenciais Inválidas):', semsData);
            return res.status(401).json({ message: 'Falha no login com a API GoodWe. Verifique as credenciais.', details: semsData });
        }

        const semsToken = Buffer.from(JSON.stringify(semsData.data)).toString('base64');
        console.log('-> semsToken obtido com sucesso.');

        // --- 2. BUSCAR DADOS (MÉTODO OTIMIZADO: GetMonitorDetailByPowerstationId) ---
        // Este endpoint retorna todos os dados de uma vez, evitando o erro de token expirado (100002)
        const dataUrl = `${SEMS_BASE_URL}/api/PowerStationMonitor/GetMonitorDetailByPowerstationId`;
        const dataHeaders = { "Token": semsToken, "Content-Type": "application/json", "Accept": "*/*" };
        // Este endpoint só precisa do ID do inversor (que vem do seu invId)
        const dataPayload = { "id": invId }; 

        console.log('-> Buscando dados do monitor detalhado...');
        const response = await axios.post(dataUrl, dataPayload, { headers: dataHeaders, timeout: 20000 });

        if (response.data.code !== 0) {
            // Se a busca de DADOS falhar (aqui que o erro 100002/100000 acontece)
            console.error('-> Falha na busca de dados GoodWe (Token Expirado?):', response.data);
            return res.status(401).json({ message: 'Falha ao buscar dados da GoodWe.', details: response.data });
        }

        const apiData = response.data.data; // A resposta real está em .data.data
        console.log('-> Dados detalhados recebidos.');

        // --- 3. EXTRAIR E PROCESSAR OS VALORES REAIS ---
        // Mapeamento baseado no dashboard da GoodWe
        const potenciaAtual = parseFloat(apiData.pac) || 0;       // W (Potência Realtime)
        const nivelBateria = parseFloat(apiData.Soc) || 0;       // % (Bateria Realtime)
        const geracaoDiaria = parseFloat(apiData.eday) || 0;     // kWh (Energia Hoje)
        const geracaoMensal = parseFloat(apiData.emonth) || 0;   // kWh (Energia Mês)
        const geracaoAnual = parseFloat(apiData.eyear) || 0;     // kWh (Energia Ano)
        const geracaoTotal = parseFloat(apiData.etotal) || 24;    // kWh (Energia Total)

        // --- 4. MONTAR O JSON DE RESPOSTA PARA O FLUTTERFLOW ---
        const responsePayload = {
            ok: true,
            data_status: "real",
            realtime: {
                potencia_atual_w: potenciaAtual, 
                nivel_bateria_percent: nivelBateria 
            },
            summary: {
                geracao_diaria_kwh: geracaoDiaria,
                geracao_mensal_kwh: geracaoMensal,
                geracao_anual_kwh: geracaoAnual,
                geracao_total_kwh: geracaoTotal,
                capacidade_instalada_kwp: 6.00 // Valor fixo do seu dashboard
            },
            last_updated: apiData.last_update_time || new Date().toISOString()
        };
        
        // 5. Salvar no MongoDB
        const newPowerData = new PowerData({
            userId: 'flutterflow_user_fixed_id', // ID fixo para todos os registros
            invId: invId,
            data: responsePayload // Salva o JSON consolidado
        });
        await newPowerData.save();
        console.log('✅ Dados salvos no MongoDB com sucesso.');

        res.status(200).json(responsePayload);

    } catch (error) {
        console.error('❌ Erro CRÍTICO ao processar a requisição do dashboard:', error.message);
        res.status(500).json({ message: 'Erro interno ao processar a requisição do dashboard.' });
    }
});


// --- INICIALIZAÇÃO DO SERVIDOR (APÓS CONEXÃO COM O MONGO DB) ---
const DB_URI = process.env.DB_URI;
mongoose.connect(DB_URI)
    .then(() => {
        console.log('✅ Serviço de Integração conectado ao MongoDB');
        app.listen(port, () => {
            console.log(`✅ Servidor rodando na porta ${port}`);
        });
    })
    .catch(err => {
        console.error('❌ Erro de conexão FATAL ao MongoDB:', err.message);
        process.exit(1);
    });

