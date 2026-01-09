// src/auth.js
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const APP_SECRET = process.env.JWT_SECRET || "fallback_secret_dev";

// 1. Encriptar contraseña (para cuando creas usuario)
export const hashPassword = (password) => {
  return bcrypt.hash(password, 10);
};

// 2. Comparar contraseña (para el login)
export const comparePassword = (password, hash) => {
  return bcrypt.compare(password, hash);
};

// 3. Crear Token (darle la llave al usuario)
export const createToken = (user) => {
  return jwt.sign({ userId: user.id_user, role: user.role }, APP_SECRET, {
    expiresIn: '7d', // El token dura 7 días
  });
};

// 4. Verificar Token (revisar la llave en cada petición)
export const getUserFromToken = (token) => {
  if (token) {
    try {
      // El token suele venir como "Bearer eyJhbGci..."
      const tokenValue = token.replace('Bearer ', '');
      const verified = jwt.verify(tokenValue, APP_SECRET);
      return verified; // Devuelve { userId: 1, role: 'admin' }
    } catch (error) {
      return null;
    }
  }
  return null;
};