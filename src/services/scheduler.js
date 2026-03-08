// src/services/scheduler.js
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
  console.log("⏰ Iniciando rutina de actualización de precios (Hora Cuba)...");

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
            const roundedSalePrice = Math.round(rawSalePrice / 100) * 100;

            return prisma.products.update({
                where: { id_product: product.id_product },
                data: { sale_price: roundedSalePrice }
            });
        });

        await prisma.$transaction(updatePromises);
        console.log(`✅ Precios actualizados para ${products.length} productos.`);

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
    console.error("❌ ERROR CRÍTICO durante actualización de tasa:", error);
  }
};

/**
 * Tarea 2: Chequeo de Garantías Vencidas
 */
export const checkExpiredWarranties = async () => {
    console.log("🛡️ Chequeando garantías vencidas...");
    try {
        // Obtenemos la fecha actual forzada a Cuba para que el VPS en Europa no afecte
        const cubaTimeStr = new Date().toLocaleString("en-US", { timeZone: "America/Havana" });
        const todayCuba = new Date(cubaTimeStr);
        
        // Restamos 7 días
        const sevenDaysAgo = new Date(todayCuba);
        sevenDaysAgo.setDate(todayCuba.getDate() - 7);

        // Definimos inicio y fin del día
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
                await notifyWarrantyExpiration(sale, warrantyProducts);
                console.log(`✅ Notificación de garantía enviada para Venta #${sale.id_sale}`);
            }
        }

    } catch (error) {
        console.error("❌ Error chequeando garantías:", error);
    }
};

export const initScheduler = () => {
  console.log("📅 Inicializando Tareas (Tasa: Cada 5 días | Zona Horaria: Cuba)...");

  // 1. Chequeo de Tasa (Se revisa cada minuto, se ejecuta cada 5 días a la hora exacta)
  cron.schedule('* * * * *', async () => {
    try {
        const config = await prisma.system_configuration.findFirst();
        if (!config || !config.exchange_rate_sync_time) return;

        // 1. Obtener la hora actual exacta en Cuba (Formato HH:mm)
        const now = new Date();
        const cubaTimeStr = now.toLocaleTimeString("en-US", { 
          timeZone: "America/Havana", 
          hour12: false, 
          hour: '2-digit', 
          minute: '2-digit' 
        });

        // 2. Extraer la hora de la base de datos FORZÁNDOLA a la zona de Cuba.
        // (Esto arregla el error del VPS en Moldavia)
        const dbDate = new Date(config.exchange_rate_sync_time);
        const targetTimeStr = dbDate.toLocaleTimeString("en-US", { 
          timeZone: "America/Havana", 
          hour12: false, 
          hour: '2-digit', 
          minute: '2-digit' 
        });

        // 3. Calcular los días que han pasado usando la fecha de Cuba
        const cubaDateOnly = new Date(now.toLocaleString("en-US", { timeZone: "America/Havana" }));
        cubaDateOnly.setHours(0, 0, 0, 0); // Solo queremos los días enteros
        
        const referenceDate = new Date('2026-01-01T00:00:00Z');
        const diffInMs = cubaDateOnly.getTime() - referenceDate.getTime();
        const daysPassed = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

        // 4. Condición: Coincide la hora de Cuba Y el día es múltiplo de 5
        if (cubaTimeStr === targetTimeStr && daysPassed % 5 === 0) {
             console.log(`⚡ Ciclo de 5 días cumplido (Día ${daysPassed}). Hora Cuba: ${cubaTimeStr}. Actualizando...`);
             await executeDailyUpdate();
        }

    } catch (error) {
        console.error("Scheduler Error:", error.message);
    }
  });

  // 2. Chequeo de Garantías (Diario a las 9:00 AM)
  // Le pasamos el parámetro de "timezone" a node-cron para que el VPS no se confunda
  cron.schedule('0 9 * * *', async () => {
      await checkExpiredWarranties();
  }, {
      scheduled: true,
      timezone: "America/Havana" // ¡Esto asegura que se ejecute a las 9 AM de Cuba, no de Europa!
  });

  console.log("✅ Scheduler services corriendo.");
};