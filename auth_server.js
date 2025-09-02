const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const app = express();
const port = 3000;

// Configuração do middleware para processar JSON
app.use(express.json());

// URI de conexão para o seu banco de dados local
const DB_URI = 'mongodb://localhost:27017/goodwe_app';

// Chave secreta para os tokens JWT. Mantenha-a segura e em variáveis de ambiente em produção!
const JWT_SECRET = 'your_super_secret_jwt_key';

// Conectar ao MongoDB
mongoose.connect(DB_URI)
    .then(() => console.log('Conectado ao MongoDB'))
    .catch(err => console.error('Erro de conexão ao MongoDB:', err));

// Esquema (Schema) para os usuários
const userSchema = new mongoose.Schema({
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    isVerified: { type: Boolean, default: false },
    verificationCode: { type: String },
    resetPasswordCode: { type: String },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Middleware para autenticar o token JWT em rotas protegidas
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Espera o formato "Bearer TOKEN"

    if (token == null) {
        return res.status(401).send('Token de autenticação não fornecido.');
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).send('Token de autenticação inválido.');
        }
        req.user = user;
        next();
    });
};

// ROTA DE REGISTRO
app.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Verifica se o usuário já existe
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).send('O e-mail já está em uso.');
        }

        // Gera o código de verificação
        const verificationCode = crypto.randomInt(1000, 9999).toString();
        
        // Criptografa a senha antes de salvar
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Cria e salva o novo usuário no MongoDB
        const newUser = new User({
            username,
            email,
            password: hashedPassword,
            verificationCode,
        });
        await newUser.save();
        
        // Simula o envio de e-mail (em produção, você usaria um serviço como o SendGrid)
        console.log(`CÓDIGO DE VERIFICAÇÃO PARA ${email}: ${verificationCode}`);

        res.status(201).json({ message: 'Usuário registrado com sucesso. Por favor, verifique seu e-mail.' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Erro no registro.');
    }
});

// ROTA DE VERIFICAÇÃO DE E-MAIL (2FA)
app.post('/verify-email', async (req, res) => {
    try {
        const { email, code } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).send('Usuário não encontrado.');
        }

        if (user.verificationCode === code) {
            // Marca o usuário como verificado e limpa o código
            user.isVerified = true;
            user.verificationCode = undefined;
            await user.save();

            // Gera um token JWT para o login automático
            const token = jwt.sign({ userId: user._id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
            
            res.status(200).json({ message: 'E-mail verificado com sucesso.', token });
        } else {
            res.status(400).send('Código de verificação inválido.');
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Erro na verificação do e-mail.');
    }
});

// ROTA DE LOGIN
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).send('E-mail ou senha incorretos.');
        }
        
        // Verifica se o usuário já verificou o e-mail
        if (!user.isVerified) {
            return res.status(403).send('Sua conta não foi verificada. Por favor, verifique seu e-mail para continuar.');
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).send('E-mail ou senha incorretos.');
        }

        // Gera o token JWT para o usuário logado
        const token = jwt.sign({ userId: user._id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });

        res.status(200).json({ message: 'Login bem-sucedido.', token });
    } catch (err) {
        console.error(err);
        res.status(500).send('Erro no login.');
    }
});

// ROTA DE ESQUECER SENHA
app.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).send('Nenhum usuário encontrado com este e-mail.');
        }
        
        // Gera um novo código para redefinir a senha
        const resetPasswordCode = crypto.randomInt(1000, 9999).toString();
        user.resetPasswordCode = resetPasswordCode;
        await user.save();

        // Simula o envio de e-mail com o código de redefinição
        console.log(`CÓDIGO DE REDEFINIÇÃO DE SENHA PARA ${email}: ${resetPasswordCode}`);
        
        res.status(200).json({ message: 'Código de redefinição de senha enviado para seu e-mail.' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Erro ao solicitar redefinição de senha.');
    }
});

// ROTA DE REDEFINIR SENHA
app.post('/reset-password', async (req, res) => {
    try {
        const { email, code, newPassword } = req.body;
        const user = await User.findOne({ email });

        if (!user || user.resetPasswordCode !== code) {
            return res.status(400).send('Código de redefinição inválido ou expirado.');
        }

        // Criptografa a nova senha e a salva
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        user.resetPasswordCode = undefined; // Limpa o código de redefinição
        await user.save();

        res.status(200).json({ message: 'Senha redefinida com sucesso.' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Erro ao redefinir a senha.');
    }
});

// Exemplo de uma rota protegida (requer um token válido)
app.get('/protected', authenticateToken, (req, res) => {
    res.status(200).json({ message: `Bem-vindo, ${req.user.email}! Você está autenticado.` });
});

app.listen(port, () => {
    console.log(`Servidor de autenticação rodando em http://localhost:${port}`);
});
