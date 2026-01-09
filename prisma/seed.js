// prisma/seed.js
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/auth.js'; // Usamos tu función de encriptar

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando sembrado de datos (Seeding)...');

  // 1. Crear Configuración del Sistema
  const config = await prisma.system_configuration.create({
    data: {
      company_name: 'Habana Express Market',
      seller_commission_percentage: 10.0,
      default_exchange_rate: 320.0,
      telegram_bot_token: '8351700683:AAF-vH0GooIZ_9sd_wIrOTM6KfkjzQDPI48',
      active: true,
    },
  });
  console.log('✅ Configuración creada.');

  // 2. Crear Super Admin
  // Encriptamos la contraseña "admin123"
  const passwordEncrypted = await hashPassword('admin123');

  const admin = await prisma.users.create({
    data: {
      name: 'Super Admin',
      email: 'admin@habanaexpress.com',
      password_hash: passwordEncrypted, // Se guarda segura
      role: 'admin',
      active: true,
      telegram_chat_id: '000000',
    },
  });
  console.log(`✅ Usuario Admin creado: ${admin.email} (Password: admin123)`);

  // 3. (Opcional) Crear una categoría inicial
  await prisma.categories.create({
    data: { name: 'General' }
  });
  console.log('✅ Categoría "General" creada.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });