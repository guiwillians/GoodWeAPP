// alexa_handler.js
const axios = require('axios');
const Alexa = require('ask-sdk-core');

const SEMS_LOGIN_URL = 'https://good-we-app.vercel.app/api/goodwe/sems-login';
const SEMS_DATA_URL = 'https://good-we-app.vercel.app/api/goodwe/data';
const SEMS_ACCOUNT = 'demo@goodwe.com'; // Use a conta da GoodWe para login
const SEMS_PWD = 'GoodweSems123!@#';

// Função para obter um novo semsToken
async function getSemsToken() {
    const loginPayload = {
        account: SEMS_ACCOUNT,
        pwd: SEMS_PWD
    };
    const response = await axios.post(SEMS_LOGIN_URL, loginPayload);
    return response.data.semsToken;
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
            // 1. Obter um novo semsToken para a sessão
            const semsToken = await getSemsToken();
            const invId = '5010KETU229W6177'; // ID do inversor
            
            // 2. Usar o novo token para obter os dados de Pac
            const response = await axios.post(SEMS_DATA_URL, {
                semsToken: semsToken,
                invId: invId,
                column: 'Pac',
                date: new Date().toISOString()
            });

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