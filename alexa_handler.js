// alexa_handler.js
const axios = require('axios');
const Alexa = require('ask-sdk-core');

// Manipulador para a intenção de geração de energia
const GetPowerGenerationIntentHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
            && handlerInput.requestEnvelope.request.intent.name === 'GetPowerGenerationIntent';
    },
    async handle(handlerInput) {
        let speechText = 'Desculpe, não consegui obter os dados no momento.';

        try {
            // Em um sistema real, o semsToken e o invId seriam armazenados
            const semsToken = 'eyJ1aWQiOiJlMWMzNDE0Zi1jOWEzLTRlNGEtYjRhNi1hZmMzMGI2ODIwNTciLCJ0aW1lc3RhbXAiOjE3NTgwNjk2ODg5NjcsInRva2VuIjoiQkFDMjBDMzItQjVEMi00ODk0LUFFQ0ItRDk3OTk5ODdBREQ5IiwiY2xpZW50Ijoid2ViIiwidmVyc2lvbiI6IiIsImxhbmd1YWdlIjoiZW4ifQ=='; // Cole aqui o semsToken que você obteve no Postman
            const invId = '5010KETU229W6177'; // Cole aqui o ID do seu inversor

            const response = await axios.post('https://good-we-app.vercel.app/api/goodwe/data', {
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

// Exporta o skillBuilder para ser usado no arquivo principal
module.exports = skillBuilder;