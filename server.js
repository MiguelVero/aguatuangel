const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// 1. Ubicar la carpeta 'public' de forma absoluta
const publicDir = path.join(__dirname, 'public');

// 2. Crear carpeta uploads dentro de public de forma segura
const uploadDir = path.join(publicDir, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// 3. Permitir que la web y las fotos se vean en internet
app.use(express.static(publicDir));

// 🔥 NUEVO: 4. Base de datos temporal para guardar las ventas
let pedidos = [];

// 5. Configurar cómo se guarda la foto
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, 'yape-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// 6. La ruta que recibe la foto desde tu HTML (index.html)
app.post('/api/subir-voucher', upload.single('voucher'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No se recibió la imagen' });
    }
    
    // Generar el link público de la foto en tu propio servidor
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers.host;
    const imageUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

    // 🔥 NUEVO: Guardar los datos de la compra para el Panel de Administrador
    const txId = "TX-" + Math.floor(Math.random() * 90000 + 10000); // Crea un ID único
    const fechaHoy = new Date().toISOString().split('T')[0]; // Saca la fecha actual

    pedidos.push({
        id: txId,
        fecha: fechaHoy,
        detalle: req.body.detalle || "Pedido Web",
        total: req.body.total || "0.00",
        voucher: imageUrl
    });

    res.json({ success: true, link_imagen: imageUrl });
});

// 🔥 NUEVO: 7. La ruta que el Panel de Administrador lee para armar la tabla
app.get('/api/pedidos', (req, res) => {
    res.json(pedidos);
});

// 8. RUTEO FINAL: Si el cliente entra a la web principal, forzar que lea el index.html
app.get('*', (req, res) => {
    // Evitamos que bloquee si intentan entrar directamente a admin.html
    if (req.path.includes('admin.html')) {
        res.sendFile(path.join(publicDir, 'admin.html'));
    } else {
        res.sendFile(path.join(publicDir, 'index.html'));
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor VENTAWEAGUA funcionando en puerto ${PORT}`));