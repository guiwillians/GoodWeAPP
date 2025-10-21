require('dotenv').config();
console.log('--- 1. dotenv carregado ---');

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const mongoose = require('mongoose');

console.log('--- 2. Módulos carregados ---');

const app = express();
const port = process.env.PORT || 3001;
// CORREÇÃO: URL correto para plantas no Brasil
const SEMS_BASE_URL = process.env.SEMS_BASE_URL || 'https://us.semsportal.com'; 

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

// Rota de health check para verificar se o servidor está online
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'API GoodWe está funcionando' });
});

/**
 * Função auxiliar para fazer uma chamada de dados à API da GoodWe.
 */
async function getGoodWeColumnData(semsToken, invId, column, date) {
    const dataUrl = `${SEMS_BASE_URL}/api/PowerStationMonitor/GetInverterDataByColumn`;
    const dataHeaders = { "Token": semsToken, "Content-Type": "application/json", "Accept": "*/*" };
    const dataPayload = { "date": date, "column": column, "id": invId };

    const response = await axios.post(dataUrl, dataPayload, { headers: dataHeaders, timeout: 20000 });
    
    if (response.data.code !== 0) {
        throw new Error(`Falha ao buscar dados da coluna '${column}'. Mensagem: ${response.data.msg}`);
    }
    
    return response.data;
}


// Rota de Dashboard Unificada: Pega todos os dados necessários para o frontend
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
            return res.status(401).json({ message: 'Falha no login com a API GoodWe. Verifique as credenciais.', details: semsData });
        }

        const semsToken = Buffer.from(JSON.stringify(semsData.data)).toString('base64');
        console.log('-> semsToken obtido com sucesso.');

        // --- 2. BUSCAR TODOS OS DADOS EM PARALELO ---
        const todayString = new Date().toISOString().split('T')[0] + " 00:00:00";
        
        const dataPromises = [
            getGoodWeColumnData(semsToken, invId, 'pac', todayString),    // Potência em tempo real
            getGoodWeColumnData(semsToken, invId, 'eday', todayString),   // Geração diária
            getGoodWeColumnData(semsToken, invId, 'etotal', todayString), // Geração total (vida útil)
            getGoodWeColumnData(semsToken, invId, 'soc', todayString)     // Nível da bateria
        ];

        const [pacData, edayData, etotalData, socData] = await Promise.all(dataPromises);

        // --- 3. EXTRAIR E PROCESSAR OS VALORES ---
        const extractLatestValue = (apiData) => {
            const dataArray = apiData?.data?.column1 || [];
            if (dataArray.length > 0) {
                const lastPoint = dataArray[dataArray.length - 1];
                return parseFloat(lastPoint.column) || 0;
            }
            return 0;
        };
        
        const potenciaAtual = extractLatestValue(pacData);
        const geracaoDiaria = extractLatestValue(edayData);
        const geracaoTotal = extractLatestValue(etotalData);
        const nivelBateria = extractLatestValue(socData);
        
        // Simulação de dados mensais e anuais baseados no total
        const geracaoMensalEstimada = (geracaoTotal / 12).toFixed(2);
        const geracaoAnualEstimada = geracaoTotal;

        // --- 4. MONTAR O JSON DE RESPOSTA PARA O FLUTTERFLOW ---
        const responsePayload = {
            ok: true,
            realtime: {
                potencia_atual_w: potenciaAtual,
                nivel_bateria_percent: nivelBateria
            },
            summary: {
                geracao_diaria_kwh: geracaoDiaria,
                geracao_mensal_kwh: parseFloat(geracaoMensalEstimada),
                geracao_anual_kwh: geracaoAnualEstimada,
                geracao_total_kwh: geracaoTotal
            },
            last_updated: new Date().toISOString()
        };
        
        // 5. Salvar no MongoDB
        const newPowerData = new PowerData({
            userId: 'flutterflow_user_fixed_id',
            invId: invId,
            data: responsePayload 
        });
        await newPowerData.save();
        console.log('✅ Dados do Dashboard salvos no MongoDB.');

        res.status(200).json(responsePayload);

    } catch (error) {
        console.error('❌ Erro CRÍTICO ao processar a requisição do dashboard:', error.message);
        if (error.response) {
            console.error("Detalhes do erro Axios:", error.response.status, error.response.data);
        }
        res.status(500).json({ message: 'Erro interno ao processar a requisição do dashboard.' });
    }
});


// --- INICIALIZAÇÃO DO SERVIDOR (APÓS CONEXÃO COM O MONGO DB) ---
const DB_URI = process.env.DB_URI;
console.log('--- 7. Conectando ao MongoDB... ---');
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

