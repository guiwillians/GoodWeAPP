// goodwe_integration.js - VERSÃO FINAL SEM JWT
require('dotenv').config();
console.log('--- 1. dotenv carregado ---');

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const mongoose = require('mongoose');

console.log('--- 2. Módulos carregados ---');

const app = express();
const port = process.env.PORT || 3001; // Render/Vercel usam process.env.PORT
const SEMS_BASE_URL = process.env.SEMS_BASE_URL || 'https://us.semsportal.com'; // Região 'eu' para o Brasil

// --- MIDDLEWARES (Antes das Rotas) ---
console.log('--- 3. Configurando Middlewares ---');
app.use(cors());
app.use(express.json());

// --- SCHEMA E MODEL DO MONGODB ---
const powerDataSchema = new mongoose.Schema({
    userId: { type: String, required: true }, // Usando String para ID fixo
    invId: { type: String, required: true },
    data: { type: Object, required: true },
    timestamp: { type: Date, default: Date.now }
});
const PowerData = mongoose.model('PowerData', powerDataSchema);
console.log('--- 4. Schema MongoDB definido ---');


// --- ROTAS DA API ---

// Rota de health check (GET /health) - Para verificar se o servidor está online
console.log('--- 5. Definindo Rota /health ---');
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'API GoodWe está funcionando' });
});

// Rota Consolidada: Login GoodWe + Busca Dados + Salvar MongoDB (ACESSO LIVRE)
console.log('--- 6. Definindo Rota /api/goodwe/data ---');
app.post('/api/goodwe/data', async (req, res) => {
    // Aceita credenciais no body
    const { account, pwd, invId, column, date } = req.body;
    console.log(`[LOG] Recebida requisição para /api/goodwe/data (Coluna: ${column})`);

    if (!account || !pwd || !invId || !column || !date) {
        console.warn('-> Parâmetros faltando na requisição.');
        return res.status(400).json({ message: 'Credenciais e parâmetros necessários faltando.' });
    }

    // --- 1. LÓGICA DE AUTENTICAÇÃO INTERNA (GoodWe Login) ---
    const initialTokenPayload = { "client": "web", "version": "v1.0.0", "language": "en" };
    const initialToken = Buffer.from(JSON.stringify(initialTokenPayload)).toString('base64');
    const loginUrl = `${SEMS_BASE_URL}/api/v2/common/crosslogin`;
    const loginHeaders = { "Token": initialToken, "Content-Type": "application/json", "Accept": "application/json" };
    const loginPayload = { "account": account, "pwd": pwd, "is_local": false };

    try {
        console.log('-> Tentando login na API GoodWe...');
        const loginResponse = await axios.post(loginUrl, loginPayload, { headers: loginHeaders, timeout: 15000 }); // Timeout 15s
        const semsData = loginResponse.data;

        // Se o login falhar (qualquer código que não seja sucesso)
        if (semsData.code !== 0 && semsData.code !== 1 && semsData.code !== 200) {
            console.error('-> Falha no Login GoodWe (Credenciais Inválidas):', semsData);
            return res.status(401).json({ message: 'Falha no login com a API GoodWe. Verifique as credenciais.', details: semsData });
        }

        const semsToken = Buffer.from(JSON.stringify(semsData.data)).toString('base64');
        console.log('-> semsToken obtido com sucesso.');
        // --- FIM DA AUTENTICAÇÃO ---

        // 2. BUSCAR DADOS USANDO O TOKEN OBTIDO
        console.log(`-> Buscando dados da coluna '${column}'...`);
        const dataUrl = `${SEMS_BASE_URL}/api/PowerStationMonitor/GetInverterDataByColumn`;
        const dataHeaders = { "Token": semsToken, "Content-Type": "application/json", "Accept": "*/*" };
        const dataPayload = { "date": date, "column": column, "id": invId };

        const response = await axios.post(dataUrl, dataPayload, { headers: dataHeaders, timeout: 20000 });
        const apiData = response.data;
        
        // Se a busca de DADOS falhar (aqui que o erro 100002 acontece)
        if (apiData.code !== 0) {
            console.error('-> Falha na busca de dados GoodWe (Token Expirado?):', apiData);
            return res.status(401).json({ message: 'Falha ao buscar dados da GoodWe (Token pode ter expirado).', details: apiData });
        }
        
        console.log('-> Dados da GoodWe recebidos.');

        // 3. SALVAR NO MONGODB (ID fixo)
        console.log('-> Tentando salvar no MongoDB...');
        const newPowerData = new PowerData({
            userId: '65f6c825a0a38b251b32e08e', // ID fixo de teste
            invId: invId,
            data: apiData // Salva a resposta completa
        });
        await newPowerData.save();
        console.log('✅ Dados salvos no MongoDB com sucesso.');

        res.status(200).json(apiData); // Retorna os dados brutos da GoodWe

    } catch (error) {
        console.error('❌ Erro CRÍTICO ao processar a requisição:', error.message);
        // Log detalhado do erro axios se disponível
        if (error.response) {
            console.error("Detalhes do erro Axios:", error.response.status, error.response.data);
        }
        res.status(500).json({ message: 'Erro interno ao processar a requisição.' });
    }
});


// --- INICIALIZAÇÃO DO SERVIDOR (APÓS CONEXÃO COM O MONGO DB) ---
// FIXO: Isso resolve o erro de 'buffering timed out'
const DB_URI = process.env.DB_URI;
console.log('--- 7. Conectando ao MongoDB... ---');
mongoose.connect(DB_URI)
    .then(() => {
        console.log('✅ Serviço de Integração conectado ao MongoDB');
        // APENAS INICIA O SERVIDOR DEPOIS QUE O MONGO ESTÁ CONECTADO
        app.listen(port, () => {
            console.log(`✅ Servidor rodando na porta ${port}`);
        });
    })
    .catch(err => {
        console.error('❌ Erro de conexão FATAL ao MongoDB:', err.message);
        process.exit(1); // Encerra a aplicação se não conseguir conectar ao DB
    });