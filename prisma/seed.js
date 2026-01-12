import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs'; // Asegúrate de tenerlo instalado: npm install bcryptjs

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando Seed (Semilla de Datos)...');

  // 1. LIMPIEZA: Borrar datos antiguos (Orden específico por llaves foráneas)
  await prisma.returns.deleteMany();
  await prisma.sale_products.deleteMany();
  await prisma.sales.deleteMany();
  await prisma.seller_products.deleteMany();
  await prisma.product_categories.deleteMany();
  await prisma.products.deleteMany();
  await prisma.categories.deleteMany();
  await prisma.shipments.deleteMany();
  await prisma.users.deleteMany();
  await prisma.system_configuration.deleteMany();

  console.log('🧹 Base de datos limpiada.');

  // 2. HASHEAR PASSWORD (Usaremos '123456' para todos)
  const passwordHash = await bcrypt.hash('123456', 10);

  // 3. CONFIGURACIÓN DEL SISTEMA
  // Fecha para reporte: 8:00 AM
  const reportTime = new Date();
  reportTime.setHours(8, 0, 0, 0);

  await prisma.system_configuration.create({
    data: {
      company_name: "Habana Express Store",
      company_phone: "+53 50000000",
      company_email: "contacto@habanaexpress.com",
      description: "Tienda de importación y retail.",
      seller_commission_percentage: 10.00, // 10%
      default_exchange_rate: 520.00,       // Tasa 520
      telegram_bot_token: "8584827308:AAFL5AN7Made0xCe2uz2_0GwWRhBNvIaaqI", // Tu Token Real
      
      // Configuración de Reportes
      monthly_report_day: 20,
      monthly_report_time: reportTime,
      annual_report_day: 20, // Diciembre se valida por código, aquí guardamos el día
      annual_report_time: reportTime,
    }
  });
  console.log('⚙️ Configuración creada.');

  // 4. USUARIOS
  const admin = await prisma.users.create({
    data: {
      name: "Super Admin",
      phone: "50000001", // Login Admin
      email: "admin@test.com",
      password_hash: passwordHash,
      role: "admin",
      telegram_chat_id: "888319060", // TU CHAT ID REAL
      active: true
    }
  });

  const seller = await prisma.users.create({
    data: {
      name: "Vendedor Estrella",
      phone: "50000002", // Login Seller
      email: "seller@test.com",
      password_hash: passwordHash,
      role: "seller",
      telegram_chat_id: "123456789", // Fake ID
      active: true
    }
  });

  const storekeeper = await prisma.users.create({
    data: {
      name: "Jefe de Almacén",
      phone: "50000003", // Login Storekeeper
      email: "store@test.com",
      password_hash: passwordHash,
      role: "storekeeper",
      telegram_chat_id: "987654321", // Fake ID
      active: true
    }
  });
  console.log('👥 Usuarios creados (Admin, Seller, Storekeeper).');

  // 5. CATEGORÍAS
  const catElec = await prisma.categories.create({ data: { name: "Electrónica" } });
  const catHome = await prisma.categories.create({ data: { name: "Hogar" } });

  // 6. ENVÍO (INVERSIÓN INICIAL)
  // Simulamos que trajimos mercancía para vender
  await prisma.shipments.create({
    data: {
      agency_name: "Aerovaradero",
      shipment_date: new Date(), // Fecha de hoy
      shipping_cost_usd: 150.00,
      merchandise_cost_usd: 1200.00, // Costo de los productos abajo
      customs_fee_cup: 5000.00,      // Aranceles
      exchange_rate: 520.00,
      notes: "Envío inicial de prueba"
    }
  });
  console.log('✈️ Envío de inversión creado.');

  // 7. PRODUCTOS
  // Prod 1: iPhone 13 (Costo $400)
  const product1 = await prisma.products.create({
    data: {
      name: "iPhone 13 Refurbished",
      description: "128GB, Batería 100%",
      purchase_price: 400.00, 
      sale_price: 900.00,    // Venta en USD (referencial)
      stock: 5,              // Stock inicial
      sku: "IPH13-128",
      active: true,
      warranty: true,
      product_categories: { create: { id_category: catElec.id_category } }
    }
  });

  // Prod 2: AirFryer (Costo $50)
  const product2 = await prisma.products.create({
    data: {
      name: "AirFryer Xiaomi 4L",
      description: "Freidora de aire inteligente",
      purchase_price: 50.00,
      sale_price: 120.00,
      stock: 10,
      sku: "AF-XIAOMI",
      active: true,
      warranty: false,
      product_categories: { create: { id_category: catHome.id_category } }
    }
  });

  // 8. ASIGNAR PRODUCTO AL VENDEDOR
  await prisma.seller_products.create({
    data: {
      id_seller: seller.id_user,
      id_product: product1.id_product,
      quantity: 2 // Le damos 2 iPhones para vender
    }
  });

  // 9. VENTA (Simulación)
  // El vendedor vende 1 iPhone.
  // Cálculo: $900 USD * 520 Tasa = 468,000 CUP
  const sale = await prisma.sales.create({
    data: {
      id_seller: seller.id_user,
      sale_date: new Date(),
      exchange_rate: 520.00,
      total_cup: 468000.00, // $900 USD
      buyer_phone: "5355555555",
      payment_method: "cash",
      notes: "Venta de prueba seed",
      sale_products: {
        create: {
          id_product: product1.id_product,
          quantity: 1
        }
      }
    }
  });

  // Actualizar stock tras venta (manual en seed)
  await prisma.products.update({
    where: { id_product: product1.id_product },
    data: { stock: 4 } // Eran 5, vendió 1
  });
  console.log('💰 Venta registrada.');

  // 10. DEVOLUCIÓN (Simulación)
  // Alguien devuelve una AirFryer de una venta anterior hipotética
  // Primero creamos la venta de la AirFryer
  const saleReturn = await prisma.sales.create({
    data: {
      id_seller: seller.id_user,
      sale_date: new Date(),
      exchange_rate: 520.00,
      total_cup: 62400.00, // $120 * 520
      buyer_phone: "5359999999",
      payment_method: "transfer",
      sale_products: { create: { id_product: product2.id_product, quantity: 1 } }
    }
  });

  // Ahora registramos la devolución
  await prisma.returns.create({
    data: {
      id_sale: saleReturn.id_sale,
      id_product: product2.id_product,
      quantity: 1,
      loss_usd: 10.00, // Se perdió $10 en transporte/mensajería
      reason: "Producto con golpe de fábrica", // Usando el nuevo campo
      return_date: new Date()
    }
  });
  console.log('🔄 Devolución registrada.');

  console.log('✅ SEED COMPLETADO EXITOSAMENTE.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });