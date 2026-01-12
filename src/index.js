import express from "express";
import { ApolloServer } from "apollo-server-express";
import { typeDefs } from "./schema.js";
import { resolvers } from "./resolvers.js";
import { getUserFromToken } from "./auth.js";
import { initTelegramBot } from "./telegram.js"; // ✨ IMPORT DEL BOT
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

dotenv.config();

// Configuración para __dirname en ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Asegurar que la carpeta uploads existe
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const app = express();

// 2. Configuración de Almacenamiento (Multer)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Carpeta destino
  },
  filename: (req, file, cb) => {
    // Generamos nombre único: fecha + nombre original
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

// Filtro para aceptar solo imágenes
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('⛔ Only image files are allowed.'), false);
  }
};

const upload = multer({ storage, fileFilter });

// 3. Hacer pública la carpeta uploads
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// 4. Endpoint REST para subir archivos
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file was uploaded.' });
    }

    const protocol = req.protocol;
    const host = req.get('host');
    const fileUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

    res.status(200).json({ 
      message: 'Image uploaded successfully.', 
      url: fileUrl 
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  // ✨ INICIAR EL BOT DE TELEGRAM
  try {
    await initTelegramBot();
  } catch (error) {
    console.error("⚠️ Failed to start Telegram Bot:", error.message);
  }

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

  app.listen({ port: process.env.PORT || 4000 }, () => {
    console.log(`🚀 Server ready at http://localhost:4000${server.graphqlPath}`);
    console.log(`📂 Upload endpoint ready at http://localhost:4000/api/upload`);
  });
}

startServer();