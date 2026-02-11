import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { getDailyExchangeRate } from './exchangeRate.js';
import { 
    notifyDailyUpdate, 
    notifyDailyPrices, 
    notifyWarrantyExpiration 
} from '../telegram.js';

const prisma = new PrismaClient();

export const executeDailyUpdate = async () => {
  console.log("⏰ Starting Daily Price Update Routine...");

  try {
    const newRate = await getDailyExchangeRate();
    if (!newRate) return;

    const config = await prisma.system_configuration.findFirst();
    if (config) {
      await prisma.system_configuration.update({
        where: { id_config: config.id_config },
        data: { default_exchange_rate: newRate }
      });
    }

    const products = await prisma.products.findMany({ where: { active: true } });
    
    if (products.length > 0) {
        const updatePromises = products.map(product => {

          const cost = Number(product.purchase_price);
    
    // 1. Calculamos el precio base (Costo * 2 * Tasa)
    const rawSalePrice = cost * 2 * newRate;
    
    // 2. Aplicamos el redondeo a la centena más cercana
    // Ejemplo: 3450 -> 3500 | 3420 -> 3400 | 9960 -> 10000
    const roundedSalePrice = Math.round(rawSalePrice / 100) * 100;


            return prisma.products.update({
        where: { id_product: product.id_product },
        data: { sale_price: roundedSalePrice } // Guardamos el precio redondeado
    });

        });

        await prisma.$transaction(updatePromises);
        console.log(`✅ Prices updated for ${products.length} products.`);

        await notifyDailyUpdate(newRate, products.length);

        const sellers = await prisma.users.findMany({
            where: { role: 'seller', active: true, telegram_chat_id: { not: null } },
            include: { seller_products: { include: { product: true } } }
        });

        for (const seller of sellers) {
            if (seller.seller_products.length > 0) {
                await notifyDailyPrices(seller, newRate);
            }
        }
    }

  } catch (error) {
    console.error("❌ CRITICAL ERROR during daily update:", error);
  }
};

/**
 * Tarea 2: Chequeo de Garantías Vencidas
 */
export const checkExpiredWarranties = async () => {
    console.log("🛡️ Checking expired warranties...");
    try {
        const today = new Date();
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(today.getDate() - 7);

        const startOfDay = new Date(sevenDaysAgo.setHours(0, 0, 0, 0));
        const endOfDay = new Date(sevenDaysAgo.setHours(23, 59, 59, 999));

        const sales = await prisma.sales.findMany({
            where: {
                sale_date: {
                    gte: startOfDay,
                    lte: endOfDay
                }
            },
            include: {
                // 🔥 IMPORTANTE: Incluir Vendedor para notificarle
                seller: true,
                sale_products: {
                    include: { product: true }
                }
            }
        });

        for (const sale of sales) {
            const warrantyProducts = sale.sale_products
                .map(sp => sp.product)
                .filter(p => p.warranty === true);

            if (warrantyProducts.length > 0) {
                // Notificar a Admin y Vendedor
                await notifyWarrantyExpiration(sale, warrantyProducts);
                console.log(`✅ Warranty expired notification sent for Sale #${sale.id_sale}`);
            }
        }

    } catch (error) {
        console.error("❌ Error checking warranties:", error);
    }
};



export const initScheduler = () => {
  console.log("📅 Initializing Schedulers (Exchange Rate: Every 3 days)...");

  // 1. Chequeo de Tasa (Se revisa cada minuto, pero solo ejecuta cada 3 días)
  cron.schedule('* * * * *', async () => {
    try {
        const config = await prisma.system_configuration.findFirst();
        if (!config || !config.exchange_rate_sync_time) return;

        // 1. Obtener Fecha y Hora Actual en Cuba
        const now = new Date();
        const cubaDate = new Date(now.toLocaleString("en-US", { timeZone: "America/Havana" }));
        
        // Formato "HH:mm" (Ej: "08:00")
        const cubaTimeStr = cubaDate.toLocaleTimeString("en-US", { 
          hour12: false, 
          hour: '2-digit', 
          minute: '2-digit' 
        });

        // 2. Obtener Hora objetivo de la DB (Ej: "08:00")
        const dbDate = new Date(config.exchange_rate_sync_time);
        const targetTimeStr = dbDate.toISOString().substring(11, 16); 

        // 3. Lógica de "Cada 3 días"
        // Calculamos los días pasados desde el 1 de Enero de 2026
        const referenceDate = new Date('2026-01-01T00:00:00Z');
        const diffInMs = cubaDate.getTime() - referenceDate.getTime();
        const daysPassed = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

        // 4. Condición: Coincide la hora Y el día es múltiplo de 3
        if (cubaTimeStr === targetTimeStr && daysPassed % 3 === 0) {
             console.log(`⚡ Ciclo de 3 días cumplido (Día ${daysPassed}). Ejecutando actualización de tasa...`);
             await executeDailyUpdate();
        }

    } catch (error) {
        console.error("Scheduler Error:", error.message);
    }
  });

  // 2. Chequeo de Garantías (Diario a las 9 AM)
  cron.schedule('0 9 * * *', async () => {
      await checkExpiredWarranties();
  });

  console.log("✅ Scheduler services corriendo.");
};