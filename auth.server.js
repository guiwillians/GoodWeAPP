const express = require('express');
const axios = require('axios');
const app = express();
const port = 3001; // Usamos uma porta diferente para este serviço

// Middleware para permitir requisições de outras origens (CORS)
const cors = require('cors');
app.use(cors());

// URL da API da GoodWe
// IMPORTANTE: Em um cenário real, você provavelmente usaria uma chave de API ou token de acesso
// para acessar os dados dos dispositivos. Esta URL parece ser pública apenas para um dispositivo
// específico.
const GOODWE_API_URL = 'https://www.semsportal.com/powerstation/PowerStatusSnMin/deaa8eb0-3f71-4b34-9680-09ab855fbc6c';

// Rota para buscar os dados da powerstation
app.get('/api/goodwe/data', async (req, res) => {
    try {
        const response = await axios.get(GOODWE_API_URL);

        // A resposta da API pode vir em um formato HTML ou JSON.
        // É importante inspecionar a resposta real da API para entender a estrutura
        // e extrair os dados corretos. Neste exemplo, vamos apenas retornar a resposta.
        const apiData = response.data;
        
        // Em um cenário real, você faria algo como:
        // const energiaGeradaHoje = apiData.energia_total_dia;
        // const energiaEmTempoReal = apiData.producao_instantanea;
        
        res.status(200).json(apiData);
    } catch (error) {
        // Tratamento de erro
        console.error('Erro ao buscar dados da API da GoodWe:', error.message);
        if (error.response) {
            // A requisição foi feita e o servidor respondeu com um código de status diferente de 2xx
            res.status(error.response.status).json({ message: 'Erro na API da GoodWe', details: error.response.data });
        } else if (error.request) {
            // A requisição foi feita, mas não houve resposta
            res.status(503).json({ message: 'Não foi possível conectar à API da GoodWe. Serviço indisponível.' });
        } else {
            // Algum erro na configuração da requisição
            res.status(500).json({ message: 'Erro interno ao processar a requisição.' });
        }
    }
});

app.listen(port, () => {
    console.log(`Serviço de integração da GoodWe rodando em http://localhost:${port}`);
});
