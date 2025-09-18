const Alexa = require('ask-sdk-core');
const axios = require('axios');

// URL da sua API - use variável de ambiente
const SUA_API_URL = process.env.SUA_API_URL;

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'LaunchRequest';
    },
    handle(handlerInput) {
        const speechText = 'Bem-vindo ao sistema Goodwe! Posso verificar a geração de energia do seu inversor solar.';
        return handlerInput.responseBuilder
            .speak(speechText)
            .reprompt(speechText)
            .getResponse();
    }
};

const GetPowerGenerationIntentHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
            && handlerInput.requestEnvelope.request.intent.name === 'GetPowerGenerationIntent';
    },
    async handle(handlerInput) {
        try {
            console.log('🔗 Conectando com API Goodwe...');
            
            // 1. Login na sua API
            const loginResponse = await axios.post(
                'https://good-we-app.vercel.app/api/goodwe/sems-login',
                {
                    account: process.env.GOODWE_ACCOUNT,
                    pwd: process.env.GOODWE_PASSWORD
                },
                { timeout: 15000 }
            );

            if (!loginResponse.data.semsToken) {
                throw new Error('Token não recebido');
            }

            const semsToken = loginResponse.data.semsToken;

            // 2. Buscar dados de energia
            const dataResponse = await axios.post(
                'https://good-we-app.vercel.app/api/goodwe/data',
                {
                    semsToken: semsToken,
                    invId: process.env.INV_ID,
                    column: 'Pac',
                    date: new Date().toISOString()
                },
                { timeout: 15000 }
            );

            const powerData = dataResponse.data;
            const currentPower = powerData.data?.Pac || powerData.Pac || 0;
            
            const speechText = `Seu sistema Goodwe está gerando ${currentPower} watts no momento.`;
            
            return handlerInput.responseBuilder
                .speak(speechText)
                .withSimpleCard('Geração de Energia', speechText)
                .getResponse();

        } catch (error) {
            console.error('❌ Erro na Alexa Handler:', error.message);
            
            return handlerInput.responseBuilder
                .speak('Desculpe, não consegui conectar com o sistema Goodwe. Tente novamente em alguns instantes.')
                .getResponse();
        }
    }
};

const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        console.log('Error handled:', error.message);
        return handlerInput.responseBuilder
            .speak('Ocorreu um erro inesperado. Por favor, tente novamente.')
            .getResponse();
    }
};

exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        GetPowerGenerationIntentHandler
    )
    .addErrorHandlers(ErrorHandler)
    .lambda();