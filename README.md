GoodWe APP - Backend
Este é o repositório do back-end do aplicativo GoodWe, projetado para integrar com a API do SEMS Portal da GoodWe e com assistentes de voz como Alexa e Google Assistant. O projeto utiliza Node.js, Express e MongoDB para gerenciar a autenticação de usuários, coletar e persistir dados de inversores e servir como a base para futuras integrações de IoT.

A arquitetura do projeto é baseada em microserviços, com cada componente lidando com uma responsabilidade específica para garantir modularidade e escalabilidade.

Tecnologias Principais
Node.js: Plataforma de execução do lado do servidor.

Express: Framework web para construção da API REST.

MongoDB: Banco de dados NoSQL para armazenamento flexível de dados de usuários e equipamentos.

Mongoose: Modelagem de objetos para MongoDB no Node.js.

Axios: Cliente HTTP para comunicação com APIs externas (GoodWe, Alexa, Google Assistant).

bcryptjs: Biblioteca para criptografia segura de senhas.

jsonwebtoken (JWT): Para autenticação e controle de acesso via tokens.

Git: Sistema de controle de versão.

Estrutura do Projeto
O projeto é dividido em dois serviços principais:

Serviço de Autenticação (auth_server.js):

Gerencia o registro, login e autenticação de usuários.

Lida com a verificação de e-mail e recuperação de senha.

Criptografa senhas e emite tokens JWT.

Serviço de Integração GoodWe (goodwe_api_integration.js):

Responsável por toda a comunicação com a API do SEMS Portal.

Faz o crosslogin e usa o token de sessão para buscar dados dos inversores.

Salva os dados coletados no MongoDB.

Protegido por um middleware de autenticação (auth_middleware.js).

Como Configurar e Rodar o Projeto
Siga estes passos para configurar e rodar o back-end em seu ambiente local.

Pré-requisitos
Node.js: Versão 14 ou superior.

MongoDB Community Server: Certifique-se de que o serviço do MongoDB está instalado e rodando na porta padrão (27017).

Git: Para clonar o repositório.

Instalação
Clone este repositório para o seu computador:

git clone [https://github.com/guiwillians/GoodWeAPP.git](https://github.com/guiwillians/GoodWeAPP.git)
cd GoodWeAPP

Instale as dependências do Node.js:

npm install

Configuração do Ambiente
O projeto usa variáveis de ambiente para a chave secreta JWT. No seu ambiente local, você pode definir essa variável de forma simples.

export JWT_SECRET='sua_chave_secreta_aqui'

Rodando os Serviços
Você precisará rodar os dois serviços em terminais separados.

Rodar o Serviço de Autenticação:

node auth_server.js

Este servidor rodará na porta 3000.

Rodar o Serviço de Integração:

node goodwe_api_integration.js

Este servidor rodará na porta 3001.

Uso da API
Com os servidores rodando, você pode usar ferramentas como Postman ou Insomnia para testar as rotas da API.

Registro de Usuário: POST para http://localhost:3000/register

body: { "username": "seu_usuario", "email": "seu@email.com", "password": "sua_senha" }

Login de Usuário: POST para http://localhost:3000/login

body: { "email": "seu@email.com", "password": "sua_senha" }

A resposta conterá um token JWT que deve ser usado para autenticação em outras rotas.

Buscar Dados da GoodWe: POST para http://localhost:3001/api/goodwe/data

headers: Authorization: Bearer <SEU_TOKEN_JWT>

body: { "semsToken": "<TOKEN_DA_API_GOODWE>", "invId": "ID_INVERSOR", "column": "coluna", "date": "YYYY-MM-DD HH:MM:SS" }