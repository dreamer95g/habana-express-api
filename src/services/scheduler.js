import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { getDailyExchangeRate } from './exchangeRate.js';
import { notifyDailyUpdate, notifyDailyPrices } from '../telegram.js';

const prisma = new PrismaClient();

/**
 * Core Logic: Daily Price Update
 * 1. Fetch Rate. 2. Update Config. 3. Update Prices. 4. Notify.
 */
export const executeDailyUpdate = async () => {
  console.log("⏰ Starting Daily Price Update Routine...");

  try {
    // 1. Fetch Rate
    const newRate = await getDailyExchangeRate();
    if (!newRate) return;

    // 2. Update System Config
    const config = await prisma.system_configuration.findFirst();
    if (config) {
      await prisma.system_configuration.update({
        where: { id_config: config.id_config },
        data: { default_exchange_rate: newRate }
      });
    }

    // 3. Bulk Update Prices (Active Products)
    const products = await prisma.products.findMany({ where: { active: true } });
    
    if (products.length > 0) {
        const updatePromises = products.map(product => {
            const cost = Number(product.purchase_price);
            // Formula: Cost * 2 * Rate
            const newSalePrice = cost * 2 * newRate;
            return prisma.products.update({
                where: { id_product: product.id_product },
                data: { sale_price: newSalePrice }
            });
        });

        await prisma.$transaction(updatePromises);
        console.log(`✅ Prices updated for ${products.length} products.`);

        // 4. Notify Admin (Process Summary)
        await notifyDailyUpdate(newRate, products.length);

        // 5. Notify Sellers (Price List)
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
 * Scheduler Initialization
 * Checks every minute if current Havana time matches DB configuration.
 */
export const initScheduler = () => {
  console.log("📅 Initializing Dynamic Scheduler...");

  cron.schedule('* * * * *', async () => {
    try {
        const config = await prisma.system_configuration.findFirst();
        if (!config || !config.exchange_rate_sync_time) return;

        const now = new Date();
        const cubaTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Havana" }));
        
        // Config time is usually UTC in Prisma/DB, so we compare logic manually or via UTC match
        const targetTime = new Date(config.exchange_rate_sync_time);

        // Simple Hour/Minute matching
        const currentHour = cubaTime.getHours();
        const currentMinute = cubaTime.getMinutes();
        const targetHour = targetTime.getUTCHours(); 
        const targetMinute = targetTime.getUTCMinutes();

        if (currentHour === targetHour && currentMinute === targetMinute) {
             console.log(`⚡ It's ${currentHour}:${currentMinute} (Havana). Executing Daily Update...`);
             await executeDailyUpdate();
        }

    } catch (error) {
        console.error("Scheduler Error:", error.message);
    }
  });

  console.log("✅ Scheduler is running.");
};