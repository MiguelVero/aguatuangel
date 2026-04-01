const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

// ¡ESTO ES CLAVE! Permite que tu HTML (Live Server o Nube) se conecte sin errores CORS
app.use(cors()); 

// Carpeta donde se guardarán las fotos
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Convertimos la carpeta 'uploads' en pública para poder ver las fotos con un link
app.use('/uploads', express.static(uploadDir));

// Configuración para guardar la imagen con un nombre único
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, 'yape-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// RUTA MAGICA: Recibe la foto y devuelve el enlace
app.post('/api/subir-voucher', upload.single('voucher'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No enviaste ninguna imagen' });
    }
    
    // Generar el link público de la imagen usando el dominio de Railway
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers.host;
    const imageUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

    res.json({ success: true, link_imagen: imageUrl });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor Aguaviña listo en puerto ${PORT}`));