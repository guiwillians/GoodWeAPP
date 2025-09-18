// alexa_handler.js
const axios = require('axios');
const Alexa = require('ask-sdk-core');

const SEMS_BASE_URL = 'https://eu.semsportal.com';
const SEMS_ACCOUNT = 'demo@goodwe.com';
const SEMS_PWD = 'GoodweSems123!@#';
const invId = '5010KETU229W6177'; // ID do inversor

// Função para obter um novo semsToken diretamente da API da GoodWe
async function getSemsToken() {
    const initialTokenPayload = { "uid": "", "timestamp": 0, "token": "", "client": "web", "version": "", "language": "en" };
    const initialToken = Buffer.from(JSON.stringify(initialTokenPayload)).toString('base64');
    
    const loginUrl = `${SEMS_BASE_URL}/api/v2/common/crosslogin`;
    const headers = { "Token": initialToken, "Content-Type": "application/json", "Accept": "*/*" };
    const payload = { "account": SEMS_ACCOUNT, "pwd": SEMS_PWD, "agreement_agreement": 0, "is_local": false };
    
    const response = await axios.post(loginUrl, payload, { headers: headers, timeout: 20000 });
    const semsData = response.data;
    
    if (semsData.code === 0 || semsData.code === 1 || semsData.code === 200) {
        return Buffer.from(JSON.stringify(semsData.data)).toString('base64');
    }
    throw new Error('Falha no login com a API GoodWe.');
}

// Manipulador para a intenção de geração de energia
const GetPowerGenerationIntentHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
            && handlerInput.requestEnvelope.request.intent.name === 'GetPowerGenerationIntent';
    },
    async handle(handlerInput) {
        let speechText = 'Desculpe, não consegui obter os dados no momento.';

        try {
            const semsToken = await getSemsToken();
            
            const dataUrl = `${SEMS_BASE_URL}/api/PowerStationMonitor/GetInverterDataByColumn`;
            const headers = { "Token": semsToken, "Content-Type": "application/json", "Accept": "*/*" };
            const payload = { "date": new Date().toISOString(), "column": "Pac", "id": invId };

            const response = await axios.post(dataUrl, payload, { headers: headers, timeout: 20000 });
            
            const apiData = response.data;

            if (apiData.data.column1 && apiData.data.column1.length > 0) {
                const latestValue = apiData.data.column1[apiData.data.column1.length - 1].column;
                speechText = `A sua geração de energia atual é de ${latestValue} watts.`;
            } else {
                speechText = 'Não foi possível encontrar dados de geração para o momento.';
            }

        } catch (error) {
            console.error('Erro ao buscar dados para Alexa:', error);
            speechText = 'Houve um erro ao tentar conectar com a sua usina solar.';
        }

        return handlerInput.responseBuilder
            .speak(speechText)
            .getResponse();
    }
};

// Manipulador para quando o usuário abre a skill
const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'LaunchRequest';
    },
    handle(handlerInput) {
        const speechText = 'Bem-vindo ao GoodWe Assistant. Você pode perguntar sobre a sua geração de hoje.';
        return handlerInput.responseBuilder
            .speak(speechText)
            .reprompt(speechText)
            .getResponse();
    }
};

const skillBuilder = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        GetPowerGenerationIntentHandler
    );

module.exports = skillBuilder;