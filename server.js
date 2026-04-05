const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 1. Ubicar la carpeta 'public' de forma absoluta
const publicDir = path.join(__dirname, 'public');

// 2. Crear carpeta uploads dentro de public de forma segura
const uploadDir = path.join(publicDir, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// 3. Crear carpeta data y archivo pedidos.json si no existen
const dataDir = path.join(publicDir, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}
const pedidosFile = path.join(dataDir, 'pedidos.json');
if (!fs.existsSync(pedidosFile)) {
    fs.writeFileSync(pedidosFile, '[]', 'utf8');
}

// 4. Funciones de persistencia
function cargarPedidos() {
    try {
        const contenido = fs.readFileSync(pedidosFile, 'utf8');
        return JSON.parse(contenido);
    } catch (err) {
        console.error('Error al cargar pedidos.json, se inicia con lista vacía:', err.message);
        return [];
    }
}

function guardarPedidos(pedidos) {
    try {
        fs.writeFileSync(pedidosFile, JSON.stringify(pedidos, null, 2), 'utf8');
    } catch (err) {
        console.error('Error al guardar pedidos.json:', err.message);
    }
}

// 5. Cargar pedidos persistidos al iniciar el servidor
let pedidos = cargarPedidos();
console.log(`📦 Pedidos cargados desde disco: ${pedidos.length}`);

// 6. Permitir que la web y las fotos se vean en internet
app.use(express.static(publicDir));

// 7. Configurar cómo se guarda la foto
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, 'yape-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// 8. La ruta que recibe la foto y TODOS los datos del cliente
app.post('/api/subir-voucher', upload.single('voucher'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No se recibió la imagen' });
    }

    // Generar el link público de la foto en tu propio servidor
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers.host;
    const imageUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

    const txId = "TX-" + Math.floor(Math.random() * 90000 + 10000);
    const fechaHoy = new Date().toISOString().split('T')[0];

    // Guardar los datos completos que vienen del index.html
    const nuevoPedido = {
        id: txId,
        fecha: fechaHoy,
        cliente: req.body.nombre || "Sin Nombre",
        telefono: req.body.telefono || "Sin Número",
        direccion: req.body.direccion || "Sin Dirección",
        detalle: req.body.detalle || "Pedido Web",
        total: req.body.total || "0.00",
        voucher: imageUrl
    };

    pedidos.push(nuevoPedido);
    guardarPedidos(pedidos);

    res.json({ success: true, link_imagen: imageUrl });
});

// 9. La ruta que el Panel de Administrador lee para armar la tabla
app.get('/api/pedidos', (req, res) => {
    res.json(pedidos);
});

// 10. RUTEO FINAL: Redireccionamiento correcto a tus HTML
app.get('*', (req, res) => {
    if (req.path.includes('admin.html')) {
        res.sendFile(path.join(publicDir, 'admin.html'));
    } else {
        res.sendFile(path.join(publicDir, 'index.html'));
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor VENTAWEAGUA funcionando en puerto ${PORT}`));
