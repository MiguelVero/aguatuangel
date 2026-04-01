const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());

// 1. Crear carpeta para guardar los vouchers automáticamente
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// 2. Permitir que las fotos se vean en internet
app.use('/uploads', express.static(uploadDir));

// 3. ¡EL TRUCO! Hacer que tu HTML se muestre al entrar a tu web de Railway
app.use(express.static('public')); 

// 4. Configurar cómo se guarda la foto
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, 'yape-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// 5. La ruta que recibe la foto desde tu HTML
app.post('/api/subir-voucher', upload.single('voucher'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No se recibió la imagen' });
    }
    
    // Generar el link público de la foto en tu propio servidor
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers.host;
    const imageUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

    res.json({ success: true, link_imagen: imageUrl });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor VENTAWEAGUA funcionando en puerto ${PORT}`));