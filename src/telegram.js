import { Telegraf } from 'telegraf';
import { PrismaClient } from '@prisma/client';
import { getMonthlyReport, getAnnualReport } from './services/finance.js';

const prisma = new PrismaClient();
let bot = null;
let isBotRunning = false; 

// --- 🛠️ FORMAT HELPERS ---
const formatNumber = (amount) => {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0
  }).format(amount);
};

const safeReply = async (chatId, message) => {
    if (!bot) return; 
    try {
        await bot.telegram.sendMessage(chatId, message, { parse_mode: 'HTML' });
    } catch (error) {
        console.error(`⚠️ Telegram Send Error (Chat: ${chatId}):`, error.message);
    }
};

// --- 🎮 COMMANDS SETUP ---
const setupCommands = () => {
    const helpMsg = `
👋 <b>Habana Express Bot</b>

📋 <b>Comandos Disponibles:</b>

📊 /monthly - Reporte del Mes
📈 /yearly - Reporte del Año
❓ /help - Ayuda
    `;

    bot.start((ctx) => ctx.reply(helpMsg, { parse_mode: 'HTML' }));
    bot.help((ctx) => ctx.reply(helpMsg, { parse_mode: 'HTML' }));

    bot.command('monthly', async (ctx) => {
        try {
            ctx.reply("⏳ <i>Generando reporte mensual...</i>", { parse_mode: 'HTML' });
            const data = await getMonthlyReport();
            const roi = data.investment > 0 ? ((data.netProfit / data.investment) * 100).toFixed(1) : 0;
            
            const msg = `
📅 <b>REPORTE MENSUAL</b> | ${data.month}/${data.year}
──────────────
💰 <b>Ingresos Totales</b>
<b>(USD)</b> ${formatNumber(data.income)}

📉 <b>Inversión y Gastos</b>
<b>(USD)</b> ${formatNumber(data.investment + data.returnLosses)}

✅ <b>GANANCIA NETA</b>
<b>(USD)</b> ${formatNumber(data.netProfit)}

📊 <b>ROI:</b> ${roi}%
            `;
            ctx.reply(msg, { parse_mode: 'HTML' });
        } catch (e) {
            console.error("Monthly Report Error:", e);
            ctx.reply("❌ Error generando reporte.");
        }
    });

    bot.command('yearly', async (ctx) => {
        try {
            ctx.reply("⏳ <i>Generando reporte anual...</i>", { parse_mode: 'HTML' });
            const data = await getAnnualReport();
            const roi = data.investment > 0 ? ((data.netProfit / data.investment) * 100).toFixed(1) : 0;

            const msg = `
📈 <b>REPORTE ANUAL</b> | ${data.year}
──────────────
💰 <b>Ingresos Acumulados</b>
<b>(USD)</b> ${formatNumber(data.income)}

📉 <b>Inversión Total</b>
<b>(USD)</b> ${formatNumber(data.investment + data.returnLosses)}

✅ <b>GANANCIA NETA</b>
<b>(USD)</b> ${formatNumber(data.netProfit)}

📊 <b>ROI Anual:</b> ${roi}%
            `;
            ctx.reply(msg, { parse_mode: 'HTML' });
        } catch (e) {
            console.error("Yearly Report Error:", e);
            ctx.reply("❌ Error generando reporte.");
        }
    });
};





// --- 🚀 INITIALIZATION ---
// export const initTelegramBot = async () => {
//   try {
//       const config = await prisma.system_configuration.findFirst();
//       if (!config || !config.telegram_bot_token) {
//         console.warn("⚠️ Telegram Bot Token not configured.");
//         return;
//       }

//       bot = new Telegraf(config.telegram_bot_token);
      
      
//       // Global Error Handler
//       bot.catch((err) => console.error(`❌ Telegram Runtime Error:`, err));
      
//       setupCommands();
      
//       // Active Flag ON immediately
//       isBotRunning = true; 

//       // Silent Launch in Background
//      await bot.launch("hola")
//     //   console.log("🤖 ✅ Bot connected to Telegram");
//         .then(async () => {
//             console.log("🤖 ✅ Bot connected to Telegram");
            
//             // ✨ NOTIFY ADMINS ON STARTUP
//             const startMsg = `
// 🟢 <b>SISTEMA EN LÍNEA</b>
// El servidor se ha reiniciado correctamente.

// 📋 <b>Comandos Disponibles:</b>

// 📊 /monthly - Reporte del Mes
// 📈 /yearly - Reporte del Año
// ❓ /help - Ayuda
//             `;
//             const admins = await prisma.users.findMany({ where: { role: 'admin', telegram_chat_id: { not: null } } });
//             admins.forEach(u => safeReply(u.telegram_chat_id, startMsg));
//         })
//         .catch((err) => {
//             console.error("❌ Telegram Connection Warning:", err.message);
//         });

//       // Graceful Stop
//       process.once('SIGINT', () => bot.stop('SIGINT'));
//       process.once('SIGTERM', () => bot.stop('SIGTERM'));

//   } catch (error) {
//       console.error("❌ Critical Error initializing Bot:", error.message);
//       isBotRunning = false;
//       bot = null;
//   }
// };


// export const initTelegramBot = async () => {
//   try {
//     const config = await prisma.system_configuration.findFirst();

//     if (!config || !config.telegram_bot_token) {
//       console.warn("⚠️ Telegram Bot Token not configured.");
//       return;
//     }

//     bot = new Telegraf(config.telegram_bot_token);

//     bot.catch((err) => console.error("❌ Telegram Runtime Error:", err));

//     setupCommands();

//     console.log("⏳ Iniciando bot de Telegram...");

//     // 🔥 ESTA ES LA CLAVE: usar await
//     await bot.launch();

//     console.log("🤖 Bot conectado a Telegram");
//     isBotRunning = true;

//     // 📢 Mensaje inicial a admins
//     const startMsg = `
// 🟢 <b>SISTEMA EN LÍNEA</b>
// El servidor se ha reiniciado correctamente.

// 📋 <b>Comandos Disponibles:</b>

// 📊 /monthly - Reporte del Mes
// 📈 /yearly - Reporte del Año
// ❓ /help - Ayuda
//     `;

//     const admins = await prisma.users.findMany({
//       where: { role: 'admin', telegram_chat_id: { not: null } }
//     });

//     for (const u of admins) {
//       await safeReply(u.telegram_chat_id, startMsg);
//     }

//     process.once('SIGINT', () => bot.stop('SIGINT'));
//     process.once('SIGTERM', () => bot.stop('SIGTERM'));

//   } catch (error) {
//     console.error("❌ Critical Error initializing Bot:", error.message);
//     isBotRunning = false;
//     bot = null;
//   }
// };


// export const initTelegramBot = async () => {
//   try {
//     const config = await prisma.system_configuration.findFirst();

//     if (!config || !config.telegram_bot_token) {
//       console.warn("⚠️ Telegram Bot Token not configured.");
//       return;
//     }

//     bot = new Telegraf(config.telegram_bot_token);

//     bot.catch((err) => console.error("❌ Telegram Runtime Error:", err));

//     setupCommands();

//     console.log("⏳ Iniciando bot de Telegram...");

//     // 🚀 Lanzar el bot SIN bloquear el event loop
//     bot.launch()
//       .then(async () => {
//         console.log("🤖 Bot conectado a Telegram");

//         const startMsg = `
// 🟢 <b>SISTEMA EN LÍNEA</b>
// El servidor se ha reiniciado correctamente.

// 📋 <b>Comandos Disponibles:</b>

// 📊 /monthly - Reporte del Mes
// 📈 /yearly - Reporte del Año
// ❓ /help - Ayuda
//         `;

//         const admins = await prisma.users.findMany({
//           where: { role: 'admin', telegram_chat_id: { not: null } }
//         });

//         for (const u of admins) {
//           await safeReply(u.telegram_chat_id, startMsg);
//         }
//       })
//       .catch((err) => {
//         console.error("❌ Error iniciando bot:", err.message);
//       });

//     // 🛑 Cierre elegante
//     process.once('SIGINT', () => bot.stop('SIGINT'));
//     process.once('SIGTERM', () => bot.stop('SIGTERM'));

//   } catch (error) {
//     console.error("❌ Critical Error initializing Bot:", error.message);
//   }
// };

export const initTelegramBot = async () => {
  try {
    const config = await prisma.system_configuration.findFirst();

    if (!config || !config.telegram_bot_token) {
      console.warn("⚠️ Telegram Bot Token not configured.");
      return;
    }

    bot = new Telegraf(config.telegram_bot_token, {
      telegram: { apiRoot: "https://api.telegram.org" },
      handlerTimeout: 30000
    });

    bot.catch((err) => console.error("❌ Telegram Runtime Error:", err));

    setupCommands();

    //console.log("⏳ Iniciando bot de Telegram...");

    // 🚀 Lanzar sin await y forzando polling puro
    bot.launch({
      dropPendingUpdates: true,
      polling: {
        timeout: 30,
        limit: 100
      }
    });

    console.log("🤖 Telegram bot running 🚀");

    // Mensaje inicial
    const initMsg = `
🤖 <b> Habana Express Bot 🚀 </b>
    `;

    const strHelp = `
📋 <b>Comandos Disponibles:</b>
📊 /monthly - Reporte del Mes
📈 /yearly - Reporte del Año
❓ /help - Ayuda`

    const admins = await prisma.users.findMany({
      where: { role: 'admin', telegram_chat_id: { not: null } }
    });

    for (const u of admins) {
      await safeReply(u.telegram_chat_id, initMsg);
      await safeReply(u.telegram_chat_id, strHelp);
    }

    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));

  } catch (error) {
    console.error("❌ Critical Error initializing Bot:", error.message);
  }
};




// --- 🔔 NOTIFICATIONS ---

// 1. NOTIFY NEW SALE
export const notifySale = async (sale) => {
  if (!bot) return;

  try {
      const config = await prisma.system_configuration.findFirst();
      const commissionPct = Number(config.seller_commission_percentage);
      const exchangeRate = Number(sale.exchange_rate);
      
      const totalSaleUSD = Number(sale.total_cup) / exchangeRate;
      let totalProductCostUSD = 0;
      let productList = "";
      
      sale.sale_products.forEach(item => {
          totalProductCostUSD += (Number(item.product.purchase_price) * item.quantity);
          productList += `📦 ${item.product.name} (x${item.quantity})\n`;
      });

      const commissionUSD = totalSaleUSD * (commissionPct / 100);
      const netProfitUSD = totalSaleUSD - totalProductCostUSD - commissionUSD;

      const totalSaleCUP = Number(sale.total_cup);
      const netProfitCUP = netProfitUSD * exchangeRate;
      const commissionCUP = commissionUSD * exchangeRate;

      const adminMsg = `
💵 <b>NUEVA VENTA</b> | ${sale.seller.name}
──────────────
${productList}
💰 <b>Ingreso Total</b>
<b>(CUP)</b> ${formatNumber(totalSaleCUP)}
<b>(USD)</b> ${formatNumber(totalSaleUSD)}

❇️ <b>Ganancia Neta</b>
<b>(CUP)</b> ${formatNumber(netProfitCUP)}
<b>(USD)</b> ${formatNumber(netProfitUSD)}
      `;

      const sellerMsg = `
💵 <b>VENTA REGISTRADA</b>
──────────────
${productList}
💸 <b>Tu Comisión:</b>
<b>(CUP)</b> +${formatNumber(commissionCUP)}

🔥 <i>¡Seguimos sumando!</i>
      `;

      const admins = await prisma.users.findMany({ where: { role: 'admin', telegram_chat_id: { not: null } } });
      admins.forEach(u => safeReply(u.telegram_chat_id, adminMsg));
      
      if (sale.seller.telegram_chat_id) {
          safeReply(sale.seller.telegram_chat_id, sellerMsg);
      }

  } catch (error) { console.error("Notify Sale Error:", error.message); }
};

// 2. NOTIFY STOCK DEPLETION (Strict Financial Calculation)
export const notifyStockDepletion = async (product) => {
  if (!bot) return;
  try {
    const config = await prisma.system_configuration.findFirst();
    const commissionPct = config ? Number(config.seller_commission_percentage) : 0;

    const salesHistory = await prisma.sale_products.findMany({
        where: { id_product: product.id_product },
        include: { sale: true }
    });

    let totalQuantitySold = 0;
    
    // Calculate Total Quantity
    salesHistory.forEach(item => {
        totalQuantitySold += item.quantity;
    });

    // 1. Total Investment (Costo real de la mercancía)
    const purchasePrice = Number(product.purchase_price);
    const totalInvestmentUSD = purchasePrice * totalQuantitySold;

    // 2. Revenue Calculation (Pricing Rule: Cost * 2)
    // Assumption: Sales were made following the rule.
    const totalRevenueUSD = totalInvestmentUSD * 2;

    // 3. Commissions Paid
    const totalCommissionsUSD = totalRevenueUSD * (commissionPct / 100);

    // 4. Net Profit
    const netProfitUSD = totalRevenueUSD - totalInvestmentUSD - totalCommissionsUSD;

    const msg = `
📉 <b>STOCK AGOTADO</b>
Se vendieron todos los <b>${product.name}</b>

📊 <b>Resumen del Lote:</b>

📦 <b>Unidades Vendidas:</b> ${totalQuantitySold}

💰 <b>Costo de Inversión</b>
<b>(USD)</b> ${formatNumber(totalInvestmentUSD)}
<i>(${totalQuantitySold} unid. x $${formatNumber(purchasePrice)} costo)</i>

✅ <b>Ganancia Neta</b>
<b>(USD)</b> ${formatNumber(netProfitUSD)}
<i>(Descontando comisiones)</i>
    `;

    const admins = await prisma.users.findMany({ where: { role: 'admin', telegram_chat_id: { not: null } } });
    admins.forEach(u => safeReply(u.telegram_chat_id, msg));

  } catch (error) { console.error("Notify Stock Error:", error.message); }
};

// 3. NOTIFY DAILY UPDATE (ADMIN)
export const notifyDailyUpdate = async (newRate, productsCount) => {
    if (!bot) return;
    try {
        const msg = `
🤖 <b>Sincronización Diaria Completada</b>

✅ <b>Nueva Tasa:</b> ${newRate} CUP
📊 <b>Productos actualizados:</b> ${productsCount}
📨 <b>Vendedores notificados.</b>
        `;
        const admins = await prisma.users.findMany({ where: { role: 'admin', telegram_chat_id: { not: null } } });
        admins.forEach(u => safeReply(u.telegram_chat_id, msg));
    } catch (e) { console.error(e); }
};

// 4. NOTIFY DAILY PRICES (SELLER)
export const notifyDailyPrices = async (seller, newRate) => {
    if (!bot || !seller.telegram_chat_id) return;
    try {
        let msg = `
🌅 <b>Buenos días, ${seller.name}</b>

💱 <b>Tasa del día:</b> ${newRate} CUP
📋 <b>Tus Productos Actualizados:</b>
`;
        seller.seller_products.forEach(sp => {
            const priceNow = Number(sp.product.purchase_price) * 2 * newRate;
            msg += `
📦 <b>${sp.product.name}</b>
<b>(CUP)</b> ${formatNumber(priceNow)}
🎒 Stock: ${sp.quantity}
`;
        });
        msg += `\n🚀 <i>¡Éxito en las ventas de hoy!</i>`;
        safeReply(seller.telegram_chat_id, msg);
    } catch (e) { console.error(e); }
};

// 5. NOTIFY RETURN
export const notifyReturn = async (returnData) => {
    if (!bot) return;
    try {
        const msg = `
❌ <b>DEVOLUCIÓN</b>
────────────────────
📦 <b>Producto:</b> ${returnData.product.name}
🔢 <b>Cant:</b> ${returnData.quantity}
📝 <b>Motivo:</b> ${returnData.reason || 'No especificado'}

📉 <b>Pérdida:</b>
<b>(USD)</b> -${formatNumber(returnData.loss_usd)}

        `;
        const recipients = await prisma.users.findMany({
          where: { role: { in: ['admin'] }, telegram_chat_id: { not: null } }
        });
        recipients.forEach(u => safeReply(u.telegram_chat_id, msg));
    } catch (e) { console.error(e); }
};