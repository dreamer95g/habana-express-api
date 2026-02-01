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

// export const initScheduler = () => {
//   console.log("📅 Initializing Schedulers...");

//   // 1. Chequeo de Tasa (Minuto a minuto)
//   cron.schedule('* * * * *', async () => {
//     try {
//         const config = await prisma.system_configuration.findFirst();
//         if (!config || !config.exchange_rate_sync_time) return;

//         const now = new Date();
//         const cubaTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Havana" }));
        
//         const targetTime = new Date(config.exchange_rate_sync_time);

//         if (cubaTime.getHours() === targetTime.getUTCHours() && 
//             cubaTime.getMinutes() === targetTime.getUTCMinutes()) {
//              console.log(`⚡ Executing Daily Price Update...`);
//              await executeDailyUpdate();
//         }

//     } catch (error) {
//         console.error("Scheduler Error:", error.message);
//     }
//   });

//   // 2. Chequeo de Garantías (Diario a las 9 AM)
//   cron.schedule('0 9 * * *', async () => {
//       await checkExpiredWarranties();
//   });

//   console.log("✅ Scheduler services are running.");
// };


export const initScheduler = () => {
  console.log("📅 Initializing Schedulers...");

  // 1. Chequeo de Tasa (Minuto a minuto)
  cron.schedule('* * * * *', async () => {
    try {
        const config = await prisma.system_configuration.findFirst();
        if (!config || !config.exchange_rate_sync_time) return;

        // 1. Obtener Hora Actual en Cuba en formato "HH:mm"
        const now = new Date();
        const cubaTimeStr = now.toLocaleTimeString("en-US", { 
          timeZone: "America/Havana", 
          hour12: false, 
          hour: '2-digit', 
          minute: '2-digit' 
        });

        // 2. Obtener Hora de la DB y convertirla a "HH:mm"
        // Prisma devuelve el objeto Date, usamos toISOString para sacar solo la hora
        const dbDate = new Date(config.exchange_rate_sync_time);
        const targetTimeStr = dbDate.toISOString().substring(11, 16); 

        // 3. Comparar directamente los textos (Ej: "08:00" === "08:00")
        if (cubaTimeStr === targetTimeStr) {
             console.log(`⚡ Hora coincidente (${cubaTimeStr}). Ejecutando Actualización Diaria...`);
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

  console.log("✅ Scheduler services are running.");
};