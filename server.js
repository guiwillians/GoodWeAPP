const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors()); // permite que o Flutter acesse
app.use(express.json()); // para receber JSON no body

// Rota de teste
app.get("/api/hello", (req, res) => {
  res.json({ message: "Olá do Node.js 🚀" });
});

// Exemplo: rota que recebe dados do Flutter
app.post("/api/data", (req, res) => {
  const { name } = req.body;
  res.json({ reply: `Oi, ${name}, recebi seus dados!` });
});

app.listen(3000, () => {
  console.log("Servidor rodando em http://localhost:3000");
});
