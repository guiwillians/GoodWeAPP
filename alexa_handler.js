// alexa_handler.js

const Alexa = require('ask-sdk-core');
const axios = require('axios');

// Importa suas variáveis de ambiente aqui
const SUA_API_URL = process.env.SUA_API_URL;
const GOODWE_ACCOUNT = process.env.GOODWE_ACCOUNT;
const GOODWE_PASSWORD = process.env.GOODWE_PASSWORD;
const INV_ID = process.env.INV_ID;

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'LaunchRequest';
    },
    handle(handlerInput) {
        const speechText = 'Bem-vindo ao sistema Goodwe! Como posso ajudar?';
        return handlerInput.responseBuilder
            .speak(speechText)
            .getResponse();
    }
};

const GetPowerGenerationIntentHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
            && handlerInput.requestEnvelope.request.intent.name === 'GetPowerGenerationIntent';
    },
    async handle(handlerInput) {
        let speechText = 'Desculpe, não consegui obter os dados no momento.';
        try {
            const semsToken = await axios.post(
                `${SUA_API_URL}/api/goodwe/sems-login`,
                { account: GOODWE_ACCOUNT, pwd: GOODWE_PASSWORD }
            ).then(res => res.data.semsToken);

            const dataResponse = await axios.post(
                `${SUA_API_URL}/api/goodwe/data`,
                { semsToken: semsToken, invId: INV_ID, column: 'Pac', date: new Date().toISOString() }
            );

            const powerData = dataResponse.data;
            const currentPower = powerData.data?.Pac || powerData.Pac || 0;
            
            speechText = `Seu sistema Goodwe está gerando ${currentPower} watts no momento.`;
            
            return handlerInput.responseBuilder
                .speak(speechText)
                .getResponse();
        } catch (error) {
            console.error('Erro na Alexa Handler:', error.message);
            return handlerInput.responseBuilder
                .speak('Desculpe, não consegui conectar com o sistema Goodwe. Tente novamente em alguns instantes.')
                .getResponse();
        }
    }
};

exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(LaunchRequestHandler, GetPowerGenerationIntentHandler)
    .lambda();