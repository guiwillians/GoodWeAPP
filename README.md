⚡ GoodWe App: Hub de Automação e Monitoramento de Energia
1. Visão Geral do Projeto (GoodWe App)
O GoodWe App é uma solução de backend modular desenvolvida para integrar sistemas de energia renovável (inversores GoodWe) com automação residencial (dispositivos Tuya). O objetivo é fornecer uma API unificada para que um aplicativo frontend (FlutterFlow) possa monitorar a geração solar, obter o status da bateria e enviar comandos inteligentes para tomadas ou lâmpadas, tudo através de um único ponto de acesso seguro.

Item	Status da Implementação
Integração GoodWe	Completa (Login, Dados, MongoDB)
Integração Tuya	Completa (Login e Listagem de Dispositivos)
Autenticação	JWT para proteção de todas as rotas de API
Frontend	Pronto para integração com FlutterFlow

Exportar para as Planilhas
2. Arquitetura e Fluxo de Dados
O sistema segue uma arquitetura modular baseada em serverless functions para desacoplamento e escalabilidade.

Diagrama de Blocos (Descrição)
Cliente (FlutterFlow) ➡️ Servidor Node.js (Render) ➡️ APIs Externas

Cliente (FlutterFlow) faz POST /auth/login e recebe um Token JWT.

Cliente envia requisição para rotas protegidas (ex: /api/goodwe/data) com o Token JWT.

Servidor Node.js (Backend) valida o JWT.

O servidor faz uma chamada externa (Login) para a API do SEMS Portal para obter o semsToken ou para a API da Tuya para enviar comandos.

3. Justificativa Técnica e Alinhamento com a Disciplina (Critério 2)
Escolha Técnica	Justificativa	Contribuição para a Sprint
Frontend (FlutterFlow)	Plataforma Low-Code que utiliza Dart/Flutter, permitindo o consumo fácil de APIs REST para construir um app multiplataforma de forma rápida.	Prototipagem: Demonstração funcional ágil da sinergia na interface móvel.
Backend (Node.js/Express)	Ideal para lidar com múltiplos I/O-bound (requisições HTTP rápidas para GoodWe e Tuya) de forma não-bloqueante.	Eficiência: Garante respostas rápidas para o aplicativo em FlutterFlow.
Integração Tuya Oficial (SDK/HMAC)	Demonstra a capacidade de integrar APIs que usam segurança avançada (assinatura HMAC e timestamp).	Automação Inteligente: Prova o controle de dispositivos IoT com segurança.
MongoDB (Mongoose)	Banco de dados NoSQL flexível, adequado para armazenar séries temporais e dados heterogêneos do inversor.	Flexibilidade: Permite a modelagem de dados sem rigidez de schema.

Exportar para as Planilhas
4. Resultados Funcionais e Testes (Critério 1)
O sistema deve ser demonstrado na nuvem (Render/Vercel) seguindo o fluxo de autenticação.

A. Sucesso na Conexão entre o Backend e o Cloud
Endpoint	Descrição	Status Esperado
POST /auth/login	Obtém o token JWT. (Passo 1 da autenticação)	200 OK (JWT Token Retornado)
GET /api/tuya/devices	Obtém lista de dispositivos (Teste da API Tuya).	200 OK (Lista de dispositivos Tuya)

Exportar para as Planilhas
B. Demonstração de Sinergia (Video)
A demonstração no vídeo deve mostrar:

Chamada à API GoodWe para obter a potencia_ac (Geração atual).

Lógica de automação simples (implícita no código).

Chamada POST /api/tuya/commands para ligar/desligar um dispositivo virtual.

5. Instruções de Execução
Instalar e Configurar: npm install e variáveis de ambiente no Render.

Executar: Acesso via URL do Render.

Vídeo Demonstração:
[LINK DO SEU VÍDEO NO YOUTUBE (MODO NÃO LISTADO) AQUI]