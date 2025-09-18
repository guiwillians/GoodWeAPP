// alexa_handler.js
const axios = require('axios');
const Alexa = require('ask-sdk-core');

const SEMS_DATA_URL = 'https://good-we-app.vercel.app/api/goodwe/data';
const invId = '5010KETU229W6177'; // ID do inversor

// Use o semsToken que você acabou de obter
const semsToken = 'eyJ1aWQiOiJlMWMzNDE0Zi1jOWEzLTRlNGEtYjRhNi1hZmMzMGI2ODIwNTciLCJ0aW1lc3RhbXAiOjE3NTgxNjA1MDE1OTMsInRva2VuIjoiQkFDMjBDMzItQjVEMi00ODk0LUFFQ0ItRDk3OTk5ODdBREQ5IiwiY2xpZW50Ijoid2ViIiwidmVyc2lvbiI6IiIsImxhbmd1YWdlIjoiZW4ifQ=='; 

// Manipulador para a intenção de geração de energia
const GetPowerGenerationIntentHandler = {
    // ...
    async handle(handlerInput) {
        let speechText = 'Desculpe, não consegui obter os dados no momento.';
        
        try {
            // A chamada de login foi removida
            const response = await axios.post(SEMS_DATA_URL, {
                semsToken: semsToken,
                invId: invId,
                column: 'Pac',
                date: new Date().toISOString()
            });

                        // ... (restante do seu código)
                    } catch (error) {
                        console.error('Erro ao obter dados do inversor:', error);
                        // speechText já está definido como mensagem de erro padrão
                    }
            
                    return handlerInput.responseBuilder
                        .speak(speechText)
                        .getResponse();
                }
            };