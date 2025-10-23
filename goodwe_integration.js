// goodwe_api.js - Versão Híbrida (Estação + Inversor)
require('dotenv').config();
console.log('--- 1. dotenv carregado ---');

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const mongoose = require('mongoose');

console.log('--- 2. Módulos carregados ---');

const app = express();
const port = process.env.PORT || 3001;
// Voltando para 'us.semsportal.com' que é o correto para o Brasil
const SEMS_BASE_URL = process.env.SEMS_BASE_URL || 'https://us.semsportal.com'; 

// --- MIDDLEWARES E CONFIGURAÇÃO ---
console.log('--- 3. Configurando Middlewares ---');
app.use(cors());
app.use(express.json());

// --- SCHEMA E MODEL DO MONGODB ---
const powerDataSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    invId: { type: String, required: true },
    plantId: { type: String, required: true }, 
    data: { type: Object, required: true },
    timestamp: { type: Date, default: Date.now }
});
// Evita erro de sobrescrita em HMR (Hot Module Replacement)
const PowerData = mongoose.models.PowerData || mongoose.model('PowerData', powerDataSchema);
console.log('--- 4. Schema MongoDB definido ---');


/**
 * Função auxiliar para buscar dados do INVERSOR (coluna única).
 * Usada para dados em tempo real (Potência, Bateria).
 */
async function getGoodWeColumnData(semsToken, invId, column, date) {
    const dataUrl = `${SEMS_BASE_URL}/api/PowerStationMonitor/GetInverterDataByColumn`;
    const dataHeaders = { "Token": semsToken, "Content-Type": "application/json", "Accept": "*/*" };
    const dataPayload = { "date": date, "column": column, "id": invId };

    console.log(`[DIAGNÓSTICO] Buscando coluna (Inversor): ${column}...`);
    const response = await axios.post(dataUrl, dataPayload, { headers: dataHeaders, timeout: 20000 });
    
    if (response.data.code !== 0) {
        throw new Error(`Falha ao buscar dados da coluna '${column}'. Mensagem: ${response.data.msg}. Código: ${response.data.code}`);
    }
    
    console.log(`[DIAGNÓSTICO] Sucesso ao buscar coluna: ${column}.`);
    return response.data;
}

/**
 * Função auxiliar para buscar dados da ESTAÇÃO (Planta).
 * Usada para dados de sumário (Diário, Mensal, Anual, Total).
 */
async function getGoodWeStationData(semsToken, plantId) {
    const dataUrl = `${SEMS_BASE_URL}/api/v2/PowerStation/GetStatisticsByPowerStationId`;
    const dataHeaders = { "Token": semsToken, "Content-Type": "application/json", "Accept": "*/*" };
    const dataPayload = { "powerStationId": plantId };

    console.log(`[DIAGNÓSTICO] Buscando dados da Estação (Plant ID): ${plantId}...`);
    const response = await axios.post(dataUrl, dataPayload, { headers: dataHeaders, timeout: 20000 });

    // GoodWe usa 0 ou 200 para sucesso em diferentes endpoints
    if (response.data.code !== 0 && response.data.code !== 200) {
        // O erro "ver is not fund" (Código 100000) acontece aqui se o ID for inválido
        throw new Error(`Falha ao buscar dados da Estação. Mensagem: ${response.data.msg}. Código: ${response.data.code}`);
    }
    
    console.log(`[DIAGNÓSTICO] Sucesso ao buscar dados da Estação.`);
    return response.data;
}


/**
 * Função auxiliar para extrair o valor mais recente (ou o primeiro) de uma resposta de coluna (inversor).
 */
function extractLatestValue(apiData) {
    const dataArray = apiData?.data?.column1 || [];
    if (dataArray.length > 0) {
        if (dataArray.length === 1) {
            return parseFloat(dataArray[0].column) || 0;
        }
        const lastPoint = dataArray[dataArray.length - 1];
        return parseFloat(lastPoint.column) || 0;
    }
    return 0;
}


// --- ROTAS DA API ---

// Rota de health check (GET /health)
console.log('--- 5. Definindo Rota /health ---');
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'API GoodWe está funcionando' });
});

// Rota de Dashboard Unificada: Pega todos os dados necessários
console.log('--- 6. Definindo Rota /api/dashboard ---');
app.post('/api/dashboard', async (req, res) => {
    // *** MUDANÇA: 'plantId' agora é OBRIGATÓRIO. Removemos a busca por nome e auto-detecção. ***
    const { account, pwd, invId, plantId } = req.body; 
    console.log(`[LOG] Recebida requisição para o dashboard: /api/dashboard`);

    // Validação
    if (!account || !pwd || !invId || !plantId) {
        return res.status(400).json({ message: 'Credenciais, ID do Inversor e ID da Planta (plantId) são necessários.' });
    }
    
    // Evita o envio de "teste" ou nomes
    if (plantId.length < 30) { // IDs reais são longos (formato UUID)
         console.warn(`[AVISO] 'plantId' recebido parece curto demais: "${plantId}". Pode não ser um ID válido.`);
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
        console.log(`[DIAGNÓSTICO] Usando plantId fornecido manualmente: ${plantId}`);
        
        // --- 2. BUSCAR DADOS (ESTAÇÃO E INVERSOR) EM PARALELO ---
        const todayString = new Date().toISOString().split('T')[0] + " 00:00:00";
        
        // Tarefa 1: Buscar dados da Estação (Sumário Confiável)
        const stationDataPromise = getGoodWeStationData(semsToken, plantId);

        // Tarefa 2: Buscar dados do Inversor (Tempo Real)
        const inverterColumns = ['pac', 'Cbattery1']; 
        const inverterDataPromises = inverterColumns.map(column => 
            getGoodWeColumnData(semsToken, invId, column, todayString)
        );

        const [stationResult, pacResult, cbattery1Result] = await Promise.allSettled([
            stationDataPromise,
            ...inverterDataPromises
        ]);

        // --- 3. EXTRAIR E PROCESSAR OS VALORES ---
        let geracaoDiaria = 0;
        let geracaoMensal = 0;
        let geracaoAnual = 0;
        let geracaoTotal = 0;
        let capacidadeInstalada = 6.00; // Valor padrão

        if (stationResult.status === 'fulfilled' && stationResult.value.data) {
            const stationData = stationResult.value.data;
            console.log("[DIAGNÓSTICO] Dados da Estação recebidos:", stationData);
            geracaoDiaria = parseFloat(stationData.day_generation) || 0;
            geracaoMensal = parseFloat(stationData.month_generation) || 0;
            geracaoAnual = parseFloat(stationData.year_generation) || 0;
            geracaoTotal = parseFloat(stationData.total_generation) || 0;
            capacidadeInstalada = parseFloat(stationData.nominal_power) || 6.00;
        } else {
             // Se esta chamada falhar, é 99% de certeza que o plantId está errado.
             console.error('❌ Erro CRÍTICO: Falha ao buscar dados da Estação.');
             if (stationResult.status === 'rejected') {
                console.error('Erro Estação:', stationResult.reason.message);
                // Retorna um erro claro para o usuário
                return res.status(404).json({ message: `Falha ao buscar dados da estação. Verifique se o seu 'plantId' está correto. (Erro: ${stationResult.reason.message})` });
             }
             // Fallback para o total (último caso)
             const etotalFallback = await getGoodWeColumnData(semsToken, invId, 'etotal', todayString).catch(() => null);
             if (etotalFallback) geracaoTotal = extractLatestValue(etotalFallback);
        }

        const potenciaAtual = (pacResult.status === 'fulfilled') ? extractLatestValue(pacResult.value) : 0;
        const nivelBateria = (cbattery1Result.status === 'fulfilled') ? extractLatestValue(cbattery1Result.value) : 0;
        if (pacResult.status === 'rejected') console.error('Erro Inversor (pac):', pacResult.reason.message);
        if (cbattery1Result.status === 'rejected') console.warn('Aviso Inversor (Cbattery1):', cbattery1Result.reason.message);


        // --- 4. MONTAR O JSON DE RESPOSTA PARA O FLUTTERFLOW ---
        const responsePayload = {
            ok: true,
            data_status: (stationResult.status === 'fulfilled' || pacResult.status === 'fulfilled') ? "real" : "offline_or_error",
            realtime: {
                potencia_atual_w: potenciaAtual, 
                nivel_bateria_percent: nivelBateria 
            },
            summary: {
                geracao_diaria_kwh: geracaoDiaria,
                geracao_mensal_kwh: geracaoMensal, 
                geracao_anual_kwh: geracaoAnual, 
                geracao_total_kwh: geracaoTotal,
                capacidade_instalada_kwp: capacidadeInstalada
            },
            last_updated: new Date().toISOString()
        };
        
        // 5. Salvar no MongoDB
        try {
            const newPowerData = new PowerData({
                userId: 'flutterflow_user_fixed_id',
                invId: invId,
                plantId: plantId, 
                data: responsePayload 
            });
            await newPowerData.save();
            console.log('✅ Dados salvos no MongoDB com sucesso.');
        } catch (dbError) {
            console.warn('⚠️  Aviso: Falha ao salvar no MongoDB:', dbError.message);
        }

        // 6. Enviar resposta para o App
        res.status(200).json(responsePayload);

    } catch (error) {
        console.error('❌ Erro CRÍTICO ao processar a requisição do dashboard:', error.message);
        if (error.response) {
            console.error('Detalhes do erro (Axios):', error.response.data);
        }
        res.status(500).json({ ok: false, message: 'Erro interno ao processar a requisição do dashboard.' });
    }
});


// --- INICIALIZAÇÃO DO SERVIDOR ---
const DB_URI = process.env.DB_URI;
if (!DB_URI) {
    console.error('❌ Erro FATAL: Variável de ambiente DB_URI não definida.');
    process.exit(1);
}

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

