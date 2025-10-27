// goodwe_api.js - Versão 12 (Otimizada - Link Único)
// Esta versão usa APENAS 'us.semsportal.com' (que sabemos que funciona).
// Mantém a lógica Híbrida (Mock da Estação + Inversor Real).
require('dotenv').config();
console.log('--- 1. dotenv carregado ---');

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const mongoose = require('mongoose');

console.log('--- 2. Módulos carregados ---');

const app = express();
const port = process.env.PORT || 3001;

// --- LINK ÚNICO ---
// Usando 'us' - Sabemos que Login e V1 (Inversor) funcionam aqui
const BASE_URL = process.env.BASE_URL || 'https://eu.semsportal.com'; 

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
const PowerData = mongoose.models.PowerData || mongoose.model('PowerData', powerDataSchema);
console.log('--- 4. Schema MongoDB definido ---');


/**
 * Função auxiliar para buscar dados do INVERSOR (coluna única).
 * ESTA É UMA CHAMADA REAL.
 */
async function getGoodWeColumnData(semsToken, invId, column, date) {
    const dataUrl = `${BASE_URL}/api/PowerStationMonitor/GetInverterDataByColumn`;
    const dataHeaders = { "Token": semsToken, "Content-Type": "application/json", "Accept": "*/*" };
    const dataPayload = { "date": date, "column": column, "id": invId };

    console.log(`[DIAGNÓSTICO] Buscando coluna REAL (Inversor): ${column}...`);
    const response = await axios.post(dataUrl, dataPayload, { headers: dataHeaders, timeout: 20000 });
    
    if (response.data.code !== 0) {
        throw new Error(`Falha ao buscar dados da coluna '${column}'. Mensagem: ${response.data.msg}. Código: ${response.data.code}`);
    }
    
    console.log(`[DIAGNÓSTICO] Sucesso ao buscar coluna REAL: ${column}.`);
    return response.data;
}

/**
 * Função auxiliar SIMULADA (Mock) para dados da ESTAÇÃO (Planta).
 * ESTA FUNÇÃO NÃO FAZ CHAMADA DE API. Ela retorna os dados do seu print.
 */
async function getMockStationData(plantId) {
    console.log(`[DIAGNÓSTICO] SIMULANDO dados da Estação (Plant ID): ${plantId}...`);
    
    // Simula um pequeno atraso, como se fosse uma chamada de API real
    await new Promise(resolve => setTimeout(resolve, 50)); 

    // Estes são os dados do seu último print (image.png)
    const mockData = {
        day_generation: 3.30,
        month_generation: 302.60,
        year_generation: 307.90,
        total_generation: 307.90, // No seu print, "Lifetime" é igual a "This Year"
        nominal_power: 6.00 // Do seu print ("Total Installed Capacity")
    };

    console.log("[DIAGNÓSTICO] Sucesso: Dados da Estação SIMULADOS.");
    // Retorna no formato que a função real retornaria (com 'data' dentro)
    return { data: mockData }; 
}


/**
 * Função auxiliar para extrair o valor mais recente (ou o primeiro) de uma resposta de coluna (inversor).
 */
function extractLatestValue(apiData) {
    const dataArray = apiData?.data?.column1 || [];
    if (dataArray.length > 0) {
        if (dataArray.length === 1) { return parseFloat(dataArray[0].column) || 0; }
        const lastPoint = dataArray[dataArray.length - 1];
        return parseFloat(lastPoint.column) || 0;
    }
    return 0;
}


// --- ROTAS DA API ---

console.log('--- 5. Definindo Rota /health ---');
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'API GoodWe está funcionando (Modo Híbrido)' });
});

console.log('--- 6. Definindo Rota /api/dashboard ---');
app.post('/api/dashboard', async (req, res) => {
    // Note: 'plantId' ainda é necessário para manter a estrutura, mesmo sendo usado para mock
    const { account, pwd, invId, plantId } = req.body; 
    console.log(`[LOG] Recebida requisição para o dashboard: /api/dashboard (Modo Híbrido)`);

    // Validação
    if (!account || !pwd || !invId || !plantId) {
        return res.status(400).json({ message: 'Credenciais, ID do Inversor (invId) e ID da Planta (plantId) são necessários.' });
    }
    
    // --- 1. LÓGICA DE AUTENTICAÇÃO INTERNA (Login REAL - Link Único) ---
    const initialTokenPayload = { "client": "web", "version": "v1.0.0", "language": "en" };
    const initialToken = Buffer.from(JSON.stringify(initialTokenPayload)).toString('base64');
    const loginUrl = `${BASE_URL}/api/v2/common/crosslogin`;
    const loginHeaders = { "Token": initialToken, "Content-Type": "application/json", "Accept": "application/json" };
    const loginPayload = { "account": account, "pwd": pwd, "is_local": false };

    try {
        console.log(`-> [DASHBOARD] Tentando login na API GoodWe em ${BASE_URL}...`);
        const loginResponse = await axios.post(loginUrl, loginPayload, { headers: loginHeaders, timeout: 15000 });
        const semsData = loginResponse.data;

        if (semsData.code !== 0 && semsData.code !== 1 && semsData.code !== 200) {
            console.error('-> Falha no Login GoodWe:', semsData);
            return res.status(401).json({ message: 'Falha no login com a API GoodWe.', details: semsData });
        }

        const semsToken = Buffer.from(JSON.stringify(semsData.data)).toString('base64');
        console.log('-> [DASHBOARD] semsToken obtido com sucesso.');
        
        // --- 2. BUSCAR DADOS (ESTAÇÃO SIMULADA + INVERSOR REAL) ---
        const todayString = new Date().toISOString().split('T')[0] + " 00:00:00";
        
        // Tarefa 1: Chamar a função SIMULADA (Mock)
        const stationDataPromise = getMockStationData(plantId);

        // Tarefa 2: Chamar as funções REAIS do Inversor
        const pacPromise = getGoodWeColumnData(semsToken, invId, 'pac', todayString);
        const batteryPromise = getGoodWeColumnData(semsToken, invId, 'Cbattery1', todayString);

        // Usamos allSettled para garantir que, se a bateria falhar, o 'pac' ainda funcione
        const [
            stationResult, 
            pacResult, 
            batteryResult
        ] = await Promise.allSettled([
            stationDataPromise,
            pacPromise,
            batteryPromise
        ]);

        // --- 3. EXTRAIR E PROCESSAR OS VALORES ---
        let geracaoDiaria = 0, geracaoMensal = 0, geracaoAnual = 0, geracaoTotal = 0, capacidadeInstalada = 6.00;

        // Processa dados da ESTAÇÃO (Simulados)
        if (stationResult.status === 'fulfilled' && stationResult.value.data) {
            const stationData = stationResult.value.data;
            console.log("[DIAGNÓSTICO] Sucesso: Dados da Estação SIMULADOS recebidos:", stationData);
            geracaoDiaria = parseFloat(stationData.day_generation);
            geracaoMensal = parseFloat(stationData.month_generation);
            geracaoAnual = parseFloat(stationData.year_generation);
            geracaoTotal = parseFloat(stationData.total_generation);
            capacidadeInstalada = parseFloat(stationData.nominal_power);
        } else {
             // Isto não deve acontecer, pois a função mock sempre funciona
             console.error('❌ Erro CRÍTICO: Falha ao buscar dados SIMULADOS da Estação.');
        }

        // Processa dados REAIS do INVERSOR
        const potenciaAtual = (pacResult.status === 'fulfilled') ? extractLatestValue(pacResult.value) : 0;
        const nivelBateria = (batteryResult.status === 'fulfilled') ? extractLatestValue(batteryResult.value) : 0;
        
        if (pacResult.status === 'rejected') console.warn('Aviso: Falha ao buscar coluna REAL "pac".', pacResult.reason.message);
        if (batteryResult.status === 'rejected') console.warn('Aviso: Falha ao buscar coluna REAL "Cbattery1".', batteryResult.reason.message);


        // --- 4. MONTAR O JSON DE RESPOSTA (SEMPRE SUCESSO) ---
        const responsePayload = {
            ok: true,
            data_status: "hybrid_mock_plant_real_inverter", // Status claro
            realtime: { 
                potencia_atual_w: potenciaAtual,     // DADO REAL
                nivel_bateria_percent: nivelBateria // DADO REAL
            },
            summary: { 
                geracao_diaria_kwh: geracaoDiaria,   // DADO SIMULADO
                geracao_mensal_kwh: geracaoMensal, // DADO SIMULADO
                geracao_anual_kwh: geracaoAnual,   // DADO SIMULADO
                geracao_total_kwh: geracaoTotal,     // DADO SIMULADO
                capacidade_instalada_kwp: capacidadeInstalada
            },
            last_updated: new Date().toISOString()
        };
        
        // 5. Salvar no MongoDB
        try {
            const newPowerData = new PowerData({
                userId: 'flutterflow_user_hybrid',
                invId: invId,
                plantId: plantId, 
                data: responsePayload 
            });
            await newPowerData.save();
            console.log('✅ Dados (Híbridos) salvos no MongoDB.');
        } catch (dbError) {
            console.warn('⚠️  Aviso: Falha ao salvar (Híbrido) no MongoDB:', dbError.message);
        }

        // 6. Enviar resposta para o App
        res.status(200).json(responsePayload);

    } catch (error) {
        console.error('❌ Erro CRÍTICO ao processar a requisição do dashboard:', error.message);
        if (error.response) { console.error('Detalhes do erro (Axios):', error.response.data); }
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

