// goodwe_api.js - Versão 13 (Login Robusto Multi-Região)
// Tenta fazer login em TODOS os servidores da GoodWe (us, eu, www) até um funcionar.
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

// Lista de servidores para tentar o login
const SEMS_SERVERS = [
    'https://us.semsportal.com',
    'https://eu.semsportal.com',
    'https://www.semsportal.com'
];

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
const PowerData = mongoose.models.PowerData || mongoose.model('PowerData', powerDataSchema);
console.log('--- 4. Schema MongoDB definido ---');


/**
 * Função auxiliar TENTATIVA de login (Versão 13)
 * Tenta fazer login em UM servidor específico.
 */
async function attemptLogin(baseUrl, account, pwd) {
    const initialTokenPayload = { "client": "web", "version": "v1.0.0", "language": "en" };
    const initialToken = Buffer.from(JSON.stringify(initialTokenPayload)).toString('base64');
    const loginUrl = `${baseUrl}/api/v2/common/crosslogin`;
    const loginHeaders = { "Token": initialToken, "Content-Type": "application/json", "Accept": "application/json" };
    const loginPayload = { "account": account, "pwd": pwd, "is_local": false };

    console.log(`-> Tentando login em: ${baseUrl}...`);
    const loginResponse = await axios.post(loginUrl, loginPayload, { headers: loginHeaders, timeout: 10000 });
    const semsData = loginResponse.data;

    if (semsData.code !== 0 && semsData.code !== 1 && semsData.code !== 200) {
        throw new Error(`Login falhou em ${baseUrl}. Código: ${semsData.code} (${semsData.msg})`);
    }

    console.log(`✅ Login com sucesso em: ${baseUrl}`);
    const semsToken = Buffer.from(JSON.stringify(semsData.data)).toString('base64');
    
    // Retorna o servidor que funcionou e o token
    return { workingBaseUrl: baseUrl, semsToken: semsToken };
}


/**
 * Função auxiliar para buscar dados do INVERSOR (coluna única).
 * ESTA É UMA CHAMADA REAL.
 */
async function getGoodWeColumnData(workingBaseUrl, semsToken, invId, column, date) {
    const dataUrl = `${workingBaseUrl}/api/PowerStationMonitor/GetInverterDataByColumn`;
    const dataHeaders = { "Token": semsToken, "Content-Type": "application/json", "Accept": "*/*" };
    const dataPayload = { "date": date, "column": column, "id": invId };

    console.log(`[DIAGNÓSTICO] Buscando coluna REAL (Inversor): ${column} em ${workingBaseUrl}...`);
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
    await new Promise(resolve => setTimeout(resolve, 50)); 

    // Dados do seu último print (image.png)
    const mockData = {
        day_generation: 3.30,
        month_generation: 302.60,
        year_generation: 307.90,
        total_generation: 307.90,
        nominal_power: 6.00
    };

    console.log("[DIAGNÓSTICO] Sucesso: Dados da Estação SIMULADOS.");
    return { data: mockData }; 
}

/**
 * Função auxiliar para extrair o valor mais recente (ou o primeiro).
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
    res.status(200).json({ status: 'OK', message: 'API GoodWe está funcionando (Modo Híbrido + Login Robusto)' });
});

console.log('--- 6. Definindo Rota /api/dashboard ---');
app.post('/api/dashboard', async (req, res) => {
    const { account, pwd, invId, plantId } = req.body; 
    console.log(`[LOG] Recebida requisição para o dashboard: /api/dashboard (Modo Híbrido)`);

    if (!account || !pwd || !invId || !plantId) {
        return res.status(400).json({ message: 'Credenciais, ID do Inversor (invId) e ID da Planta (plantId) são necessários.' });
    }
    
    // --- 1. LÓGICA DE AUTENTICAÇÃO ROBUSTA (Versão 13) ---
    let loginResult = null;
    let lastError = null;

    for (const baseUrl of SEMS_SERVERS) {
        try {
            loginResult = await attemptLogin(baseUrl, account, pwd);
            if (loginResult) {
                break; // Se o login for bem-sucedido, sai do loop
            }
        } catch (error) {
            console.warn(error.message);
            lastError = error.message;
        }
    }

    // Se, após todas as tentativas, o loginResult ainda for nulo
    if (!loginResult) {
        console.error('-> Falha no Login GoodWe em TODOS os servidores.');
        return res.status(401).json({ 
            message: 'Falha no login com a API GoodWe. Verifique as credenciais ou a API pode estar a bloquear o IP do servidor.', 
            details: lastError 
        });
    }

    const { workingBaseUrl, semsToken } = loginResult;
        
    // --- 2. BUSCAR DADOS (ESTAÇÃO SIMULADA + INVERSOR REAL) ---
    try {
        const todayString = new Date().toISOString().split('T')[0] + " 00:00:00";
        
        const stationDataPromise = getMockStationData(plantId);
        const pacPromise = getGoodWeColumnData(workingBaseUrl, semsToken, invId, 'pac', todayString);
        const batteryPromise = getGoodWeColumnData(workingBaseUrl, semsToken, invId, 'Cbattery1', todayString);

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

        if (stationResult.status === 'fulfilled' && stationResult.value.data) {
            const stationData = stationResult.value.data;
            console.log("[DIAGNÓSTICO] Sucesso: Dados da Estação SIMULADOS recebidos:", stationData);
            geracaoDiaria = parseFloat(stationData.day_generation);
            geracaoMensal = parseFloat(stationData.month_generation);
            geracaoAnual = parseFloat(stationData.year_generation);
            geracaoTotal = parseFloat(stationData.total_generation);
            capacidadeInstalada = parseFloat(stationData.nominal_power);
        } else {
             console.error('❌ Erro CRÍTICO: Falha ao buscar dados SIMULADOS da Estação.');
        }

        const potenciaAtual = (pacResult.status === 'fulfilled') ? extractLatestValue(pacResult.value) : 0;
        const nivelBateria = (batteryResult.status === 'fulfilled') ? extractLatestValue(batteryResult.value) : 0;
        
        if (pacResult.status === 'rejected') console.warn('Aviso: Falha ao buscar coluna REAL "pac".', pacResult.reason.message);
        if (batteryResult.status === 'rejected') console.warn('Aviso: Falha ao buscar coluna REAL "Cbattery1".', batteryResult.reason.message);

        // --- 4. MONTAR O JSON DE RESPOSTA (SEMPRE SUCESSO) ---
        const responsePayload = {
            ok: true,
            data_status: "hybrid_mock_plant_real_inverter",
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
            last_updated: new Date().toISOString(),
            server_used: workingBaseUrl // Informa qual servidor funcionou
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
mongoose.connect(DB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
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

