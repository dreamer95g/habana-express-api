import express from "express";
import { ApolloServer } from "apollo-server-express";
import { typeDefs } from "./schema.js";
import { resolvers } from "./resolvers.js";
import { getUserFromToken } from "./auth.js";
import { initTelegramBot } from "./telegram.js"; 
import { initScheduler } from "./services/scheduler.js"; 
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import cors from 'cors';
import { v2 as cloudinary } from 'cloudinary'; 

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------
// 1️⃣ CONFIGURACIÓN DE CLOUDINARY (DIRECTA PARA EVITAR ERRORES)
// ---------------------------------------------------------
cloudinary.config({
  cloud_name: 'ddnqbgqfn',
  api_key: '714472522733682',
  api_secret: 'S1cBDX5f9_Ox5ncFVl4slpgKTZk'
});



// Debug para ver si cargó (aparecerá en la terminal negra)
console.log("✅ Configuración de Cloudinary cargada manualmente.");

// Crear carpeta uploads temporal si no existe para evitar error 500 por carpeta faltante
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
  console.log("📁 Carpeta 'uploads/' creada.");
}

const app = express();

// 🔥 CORS: Siempre al principio
app.use(cors()); 

// ---------------------------------------------------------
// 2️⃣ CONFIGURACIÓN MULTER (Almacenamiento Temporal)
// ---------------------------------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => { 
    cb(null, 'uploads/'); 
  },
  filename: (req, file, cb) => {
    // Limpiamos el nombre del archivo para evitar caracteres raros
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9.]/g, "_");
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'img-' + uniqueSuffix + '-' + cleanName);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('⛔ Solo se permiten archivos de imagen.'), false);
  }
};

const upload = multer({ storage, fileFilter });

// ---------------------------------------------------------
// 3️⃣ ENDPOINT DE SUBIDA (Debuggeado)
// ---------------------------------------------------------
app.post('/api/upload', upload.single('file'), async (req, res) => {
  console.log("📥 Recibiendo petición de subida...");

  try {
    if (!req.file) {
      console.error("❌ Error: No llegó ningún archivo (req.file es undefined)");
      return res.status(400).json({ error: 'No se subió ningún archivo.' });
    }

    console.log(`📁 Archivo recibido localmente: ${req.file.path}`);
    console.log("☁️  Intentando subir a Cloudinary...");


    // ⚠️ PARCHE DE HORA: Sumamos 2 horas (7200 segundos) para corregir el retraso de tu PC
    const timestampFuturo = Math.round((new Date().getTime() / 1000)) + 7200;

    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "habana_express_store", 
      use_filename: true,
      unique_filename: false,
      timestamp: timestampFuturo // <--- Forzamos la hora
    });

    // // Subir a Cloudinary para VPS
    // const result = await cloudinary.uploader.upload(req.file.path, {
    //   folder: "habana_express_store", 
    //   use_filename: true,
    //   unique_filename: false,
    // });

    console.log("✅ Éxito en Cloudinary! URL:", result.secure_url);

    // Eliminar archivo local
    try {
      fs.unlinkSync(req.file.path);
    } catch (e) {
      console.warn("⚠️ No se pudo borrar el archivo temporal (no es crítico):", e.message);
    }

    // Responder al Frontend
    res.status(200).json({ 
      message: 'Imagen subida exitosamente.', 
      url: result.secure_url 
    });

  } catch (error) {
    console.error("❌ ERROR CRÍTICO EN /api/upload:", error);
    
    // Intentar limpieza
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch(e) {}
    }

    // Devolver el error real al frontend para que lo veas en la consola del navegador
    res.status(500).json({ 
      error: 'Error interno del servidor', 
      details: error.message 
    });
  }
});

// ---------------------------------------------------------
// 4️⃣ INICIO DEL SERVIDOR
// ---------------------------------------------------------
async function startServer() {
  
  // Init Scheduler
  initScheduler();

  // Apollo Server
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: ({ req }) => {
      const token = req.headers.authorization || '';
      const user = getUserFromToken(token);
      return { user };
    },
  });

  await server.start();
  server.applyMiddleware({ app });

  const PORT = process.env.PORT || 4000;
  app.listen({ port: PORT }, () => {
    console.log(`🚀 Server ready at http://localhost:${PORT}${server.graphqlPath}`);
    console.log(`☁️  Cloudinary Upload ready at http://localhost:${PORT}/api/upload`);
    
    initTelegramBot();
  });
}

startServer();