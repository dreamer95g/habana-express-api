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
import cors from 'cors'; // <--- IMPORTANTE

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Crear carpeta uploads si no existe
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const app = express();

// 🔥 CORRECCIÓN: CORS DEBE IR AQUÍ, AL PRINCIPIO DE TODO
app.use(cors()); 

// --- MULTER CONFIG ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => { cb(null, 'uploads/'); },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('⛔ Only image files are allowed.'), false);
  }
};

const upload = multer({ storage, fileFilter });

// Servir archivos estáticos
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Endpoint de subida
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const protocol = req.protocol;
    const host = req.get('host');
    // Construir URL completa
    const fileUrl = `${protocol}://${host}/uploads/${req.file.filename}`;
    res.status(200).json({ message: 'Image uploaded.', url: fileUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- SERVER START ---
async function startServer() {
  
  // 1. Init Cron Jobs
  initScheduler();

  // 2. Apollo Server
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

  // 3. Start Express
  app.listen({ port: process.env.PORT || 4000 }, () => {
    console.log(`🚀 Server ready at http://localhost:4000${server.graphqlPath}`);
    console.log(`📂 Upload endpoint ready at http://localhost:4000/api/upload`);
    
    // 4. Init Telegram
    initTelegramBot();
  });
}

startServer();