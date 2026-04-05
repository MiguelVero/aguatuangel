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
    console.log('📄 Archivo pedidos.json creado desde cero.');
}

// 4. Funciones de persistencia
function cargarPedidos() {
    try {
        const contenido = fs.readFileSync(pedidosFile, 'utf8');
        const parsed = JSON.parse(contenido);
        if (!Array.isArray(parsed)) {
            throw new Error('El contenido del archivo no es un array válido.');
        }
        return parsed;
    } catch (err) {
        console.error('⚠️  Error al cargar pedidos.json — se reinicia con lista vacía:', err.message);
        // Hacer backup del archivo corrupto antes de reiniciar
        const backupFile = pedidosFile + '.bak-' + Date.now();
        try {
            fs.copyFileSync(pedidosFile, backupFile);
            console.log(`💾 Backup del archivo corrupto guardado en: ${backupFile}`);
        } catch (backupErr) {
            console.error('⚠️  No se pudo crear el backup:', backupErr.message);
        }
        // Reiniciar con array vacío
        fs.writeFileSync(pedidosFile, '[]', 'utf8');
        return [];
    }
}

function guardarPedidos(pedidos) {
    // Backup automático antes de escribir
    try {
        if (fs.existsSync(pedidosFile)) {
            const backupFile = pedidosFile + '.bak';
            fs.copyFileSync(pedidosFile, backupFile);
        }
    } catch (backupErr) {
        console.error('⚠️  No se pudo crear el backup antes de guardar:', backupErr.message);
    }

    try {
        fs.writeFileSync(pedidosFile, JSON.stringify(pedidos, null, 2), 'utf8');
        console.log(`💾 pedidos.json actualizado correctamente (${pedidos.length} registros en total).`);
    } catch (err) {
        console.error('❌ Error crítico al guardar pedidos.json:', err.message);
        throw err; // Propagar el error para que la ruta lo maneje
    }
}

// Validar formato de teléfono (7 a 15 dígitos, puede incluir +, espacios o guiones)
function validarTelefono(telefono) {
    return /^[+\d][\d\s\-]{6,14}$/.test(telefono.trim());
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
    try {
        // --- Validar imagen ---
        if (!req.file) {
            console.warn('⚠️  Intento de pedido sin imagen adjunta.');
            return res.status(400).json({ error: 'No se recibió la imagen del voucher.' });
        }

        // --- Validar campos requeridos ---
        const { nombre, telefono, direccion, total, detalle } = req.body;

        if (!nombre || !telefono || !direccion || !total) {
            console.warn('⚠️  Pedido rechazado: faltan campos requeridos.', {
                nombre: !!nombre,
                telefono: !!telefono,
                direccion: !!direccion,
                total: !!total
            });
            return res.status(400).json({
                error: 'Faltan datos requeridos.',
                detalle: 'Los campos nombre, telefono, direccion y total son obligatorios.'
            });
        }

        // --- Validar que el nombre no esté vacío ---
        if (nombre.trim().length < 2) {
            console.warn(`⚠️  Pedido rechazado: nombre inválido ("${nombre}").`);
            return res.status(400).json({ error: 'El nombre del cliente no es válido.' });
        }

        // --- Validar formato de teléfono ---
        if (!validarTelefono(telefono)) {
            console.warn(`⚠️  Pedido rechazado: teléfono inválido ("${telefono}").`);
            return res.status(400).json({
                error: 'El número de teléfono no tiene un formato válido.',
                detalle: 'Debe contener entre 7 y 15 dígitos.'
            });
        }

        // --- Validar que el monto sea un número positivo ---
        const totalNum = parseFloat(total);
        if (isNaN(totalNum) || totalNum <= 0) {
            console.warn(`⚠️  Pedido rechazado: monto inválido ("${total}").`);
            return res.status(400).json({
                error: 'El monto total no es válido.',
                detalle: 'Debe ser un número mayor a 0.'
            });
        }

        // --- Construir el pedido ---
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers.host;
        const imageUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

        const txId = 'TX-' + Math.floor(Math.random() * 90000 + 10000);
        const timestamp = new Date().toISOString();
        const fechaHoy = timestamp.split('T')[0];

        const nuevoPedido = {
            id: txId,
            fecha: fechaHoy,
            timestamp: timestamp,
            cliente: nombre.trim(),
            telefono: telefono.trim(),
            direccion: direccion.trim(),
            detalle: (detalle || 'Pedido Web').trim(),
            total: totalNum.toFixed(2),
            voucher: imageUrl
        };

        // --- Persistir ---
        pedidos.push(nuevoPedido);
        guardarPedidos(pedidos);

        console.log(`✅ Pedido guardado: ${nuevoPedido.id} — ${nuevoPedido.cliente} — S/ ${nuevoPedido.total} — Total registros: ${pedidos.length}`);

        return res.status(201).json({
            success: true,
            mensaje: 'Pedido registrado correctamente.',
            pedido: nuevoPedido,
            link_imagen: imageUrl
        });

    } catch (err) {
        console.error('❌ Error inesperado al procesar el pedido:', err.message);
        return res.status(500).json({
            error: 'Error interno del servidor al guardar el pedido.',
            detalle: err.message
        });
    }
});

// 9. La ruta que el Panel de Administrador lee para armar la tabla
app.get('/api/pedidos', (req, res) => {
    try {
        // Releer desde disco para garantizar datos frescos
        const pedidosActuales = cargarPedidos();
        pedidos = pedidosActuales; // Sincronizar memoria
        console.log(`📋 Panel admin solicitó pedidos — ${pedidosActuales.length} registros enviados.`);
        res.json(pedidosActuales);
    } catch (err) {
        console.error('❌ Error al leer pedidos para el panel admin:', err.message);
        res.status(500).json({ error: 'No se pudieron cargar los pedidos.' });
    }
});

// 10. GET /api/estadisticas — Estadísticas completas de ventas
app.get('/api/estadisticas', (req, res) => {
    try {
        const pedidosActuales = cargarPedidos();
        pedidos = pedidosActuales;

        const fechaHoy = new Date().toISOString().split('T')[0];

        const totalPedidos = pedidosActuales.length;
        const totalVentas = pedidosActuales.reduce((sum, p) => sum + parseFloat(p.total || 0), 0);

        const pedidosHoyArr = pedidosActuales.filter(p => p.fecha === fechaHoy);
        const pedidosHoy = pedidosHoyArr.length;
        const ventasHoy = pedidosHoyArr.reduce((sum, p) => sum + parseFloat(p.total || 0), 0);

        const promedioPorPedido = totalPedidos > 0 ? totalVentas / totalPedidos : 0;

        // Clientes más activos
        const mapaClientes = {};
        pedidosActuales.forEach(p => {
            const nombre = p.cliente || 'Desconocido';
            if (!mapaClientes[nombre]) {
                mapaClientes[nombre] = { nombre, pedidos: 0, total: 0 };
            }
            mapaClientes[nombre].pedidos++;
            mapaClientes[nombre].total += parseFloat(p.total || 0);
        });
        const clientesMasActivos = Object.values(mapaClientes)
            .sort((a, b) => b.pedidos - a.pedidos || b.total - a.total)
            .slice(0, 5)
            .map(c => ({ ...c, total: parseFloat(c.total.toFixed(2)) }));

        // Último pedido (el más reciente por timestamp o fecha)
        const ultimoPedido = pedidosActuales.length > 0
            ? (function () {
                const sorted = [...pedidosActuales].sort((a, b) => {
                    const ta = a.timestamp || a.fecha || '';
                    const tb = b.timestamp || b.fecha || '';
                    return tb.localeCompare(ta);
                });
                const u = sorted[0];
                return {
                    id: u.id,
                    cliente: u.cliente,
                    fecha: u.fecha,
                    total: u.total
                };
            })()
            : null;

        console.log(`📊 Estadísticas solicitadas — ${totalPedidos} pedidos, S/ ${totalVentas.toFixed(2)} total.`);

        res.json({
            totalPedidos,
            totalVentas: parseFloat(totalVentas.toFixed(2)),
            ventasHoy: parseFloat(ventasHoy.toFixed(2)),
            pedidosHoy,
            promedioPorPedido: parseFloat(promedioPorPedido.toFixed(2)),
            clientesMasActivos,
            ultimoPedido
        });
    } catch (err) {
        console.error('❌ Error al calcular estadísticas:', err.message);
        res.status(500).json({ error: 'No se pudieron calcular las estadísticas.' });
    }
});

// 11. GET /api/exportar-csv — Exportar pedidos en formato CSV descargable
app.get('/api/exportar-csv', (req, res) => {
    try {
        const pedidosActuales = cargarPedidos();
        pedidos = pedidosActuales;

        const headers = ['ID', 'Fecha', 'Cliente', 'Teléfono', 'Dirección', 'Detalle', 'Monto', 'Estado'];

        const escaparCSV = (valor) => {
            const str = String(valor === undefined || valor === null ? '' : valor);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        const filas = pedidosActuales.map(p => [
            escaparCSV(p.id),
            escaparCSV(p.fecha),
            escaparCSV(p.cliente),
            escaparCSV(p.telefono),
            escaparCSV(p.direccion),
            escaparCSV(p.detalle),
            escaparCSV(p.total),
            escaparCSV('Yape Recibido')
        ].join(','));

        const csv = [headers.join(','), ...filas].join('\n');
        const fechaArchivo = new Date().toISOString().split('T')[0];
        const nombreArchivo = `ventaweagua-pedidos-${fechaArchivo}.csv`;

        console.log(`📤 Exportación CSV solicitada — ${pedidosActuales.length} registros exportados.`);

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
        res.send('\uFEFF' + csv); // BOM para compatibilidad con Excel
    } catch (err) {
        console.error('❌ Error al exportar CSV:', err.message);
        res.status(500).json({ error: 'No se pudo generar el archivo CSV.' });
    }
});

// 12. POST /api/limpiar-datos — Limpiar todos los pedidos (solo admin con contraseña)
app.post('/api/limpiar-datos', (req, res) => {
    try {
        const { password, confirmar } = req.body;

        if (!password || password !== 'admin123') {
            console.warn('⚠️  Intento de limpieza con contraseña incorrecta.');
            return res.status(401).json({ error: 'Contraseña incorrecta.' });
        }

        if (confirmar !== true) {
            return res.status(400).json({ error: 'Debes confirmar la operación enviando confirmar: true.' });
        }

        const pedidosActuales = cargarPedidos();
        const totalAntes = pedidosActuales.length;

        // Backup con timestamp antes de limpiar
        const backupFile = pedidosFile + '.backup-' + new Date().toISOString().replace(/[:.]/g, '-');
        try {
            fs.writeFileSync(backupFile, JSON.stringify(pedidosActuales, null, 2), 'utf8');
            console.log(`💾 Backup creado antes de limpiar: ${backupFile}`);
        } catch (backupErr) {
            console.error('⚠️  No se pudo crear el backup:', backupErr.message);
        }

        // Limpiar datos
        pedidos = [];
        fs.writeFileSync(pedidosFile, '[]', 'utf8');

        console.log(`🗑️  Datos limpiados por admin — ${totalAntes} registros eliminados. Backup guardado.`);

        res.json({
            success: true,
            mensaje: `Datos limpiados correctamente. Se eliminaron ${totalAntes} registros.`,
            backupCreado: true,
            registrosEliminados: totalAntes
        });
    } catch (err) {
        console.error('❌ Error al limpiar datos:', err.message);
        res.status(500).json({ error: 'No se pudieron limpiar los datos.', detalle: err.message });
    }
});

// 13. RUTEO FINAL: Redireccionamiento correcto a tus HTML
app.get('*', (req, res) => {
    if (req.path.includes('admin.html')) {
        res.sendFile(path.join(publicDir, 'admin.html'));
    } else {
        res.sendFile(path.join(publicDir, 'index.html'));
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor VENTAWEAGUA funcionando en puerto ${PORT}`));
