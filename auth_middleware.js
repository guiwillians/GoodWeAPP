const jwt = require('jsonwebtoken');

// Em produção, esta chave deve ser uma variável de ambiente!
const JWT_SECRET = 'a-string-secret-at-least-256-bits-long'; 

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
        return res.status(401).json({ message: 'Token de autenticação não fornecido.' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Token inválido ou expirado.' });
        }
        req.user = user; 
        next();
    });
}

module.exports = authenticateToken;