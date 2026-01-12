import { Telegraf } from 'telegraf';
import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { getMonthlyReport, getAnnualReport } from './services/finance.js';

const prisma = new PrismaClient();
let bot = null;

// --- 🛠️ HELPERS DE FORMATO ---

const formatUSD = (amount) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

const formatCUP = (amountUSD, exchangeRate) => {
  const total = Number(amountUSD) * Number(exchangeRate);
  return new Intl.NumberFormat('es-CU', { style: 'currency', currency: 'CUP' }).format(total);
};

// Generador del Reporte Financiero (Mensual/Anual)
const generateFinancialTextReport = (title, data, exchangeRate) => {
  // Calculamos ROI
  let roi = 0;
  // Inversión Total = (Envío + Mercancía + Aranceles) + (Pérdidas por devolución)
  const totalInvestmentLosses = Number(data.investment) + Number(data.returnLosses);
  
  if (totalInvestmentLosses > 0) {
    roi = (data.netProfit / totalInvestmentLosses) * 100;
  }

  return `
🗓️ *${title.toUpperCase()}*
──────────────
📉 *Costo de Inversión*
(Envío + Mercancía + Devoluciones)
*${formatUSD(totalInvestmentLosses)}*

💵 *Ingresos por Ventas*
*${formatUSD(data.income)}*
~${formatCUP(data.income, exchangeRate)}

🤝 *Pagos a los Vendedores*
*${formatUSD(data.commissions)}*
~${formatCUP(data.commissions, exchangeRate)}

🟢 *Ganancia Real*
*${formatUSD(data.netProfit)}*
~${formatCUP(data.netProfit, exchangeRate)}

📊 *ROI:* ${roi.toFixed(1)}%
  `;
};

// --- 🤖 INICIALIZACIÓN DEL BOT ---

export const initTelegramBot = async () => {
  const config = await prisma.system_configuration.findFirst();
  
  if (!config || !config.telegram_bot_token) {
    console.warn("⚠️ Telegram Bot Token not found in DB. Bot disabled.");
    return;
  }

  bot = new Telegraf(config.telegram_bot_token);

  // 1. Manejo Global de Errores (Anti-Crash)
  bot.catch((err, ctx) => {
    console.error(`❌ Telegram Error for ${ctx.updateType}`, err);
    try {
        ctx.reply("⚠️ Ocurrió un error interno en el bot. Intenta más tarde.");
    } catch (e) {} // Si falla el reply, no hacemos nada
  });

  // 2. Middleware de Seguridad (RBAC)
  bot.use(async (ctx, next) => {
    if (!ctx.chat) return next();
    
    // Permitir /start sin auth para obtener el ID
    if (ctx.message && ctx.message.text === '/start') return next();

    try {
        const user = await prisma.users.findFirst({ where: { telegram_chat_id: String(ctx.chat.id) } });
        if (!user) {
        return ctx.reply(`⛔ No tienes acceso. Tu ID es: \`${ctx.chat.id}\``, { parse_mode: 'Markdown' });
        }
        ctx.user = user; // Guardamos usuario en contexto
        return next();
    } catch (error) {
        console.error("Auth DB Error:", error);
        return ctx.reply("⚠️ Error de conexión.");
    }
  });

  // 3. COMANDOS BÁSICOS
  const sendMenu = (ctx) => {
    const msg = `
👋 *Habana Express Bot*

Sistema operativo y conectado.

*Comandos Disponibles:*
📊 \`/monthly\` - Reporte del Mes
📈 \`/yearly\` - Reporte del Año
❓ \`/help\` - Ver este menú

🆔 *Tu ID:* \`${ctx.chat.id}\`
    `;
    ctx.reply(msg, { parse_mode: 'Markdown' });
  };

  bot.start((ctx) => sendMenu(ctx));
  bot.help((ctx) => sendMenu(ctx));

  // 4. COMANDO: /monthly
  bot.command('monthly', async (ctx) => {
    if (ctx.user.role !== 'admin') return ctx.reply("🔒 Comando solo para Administradores.");
    
    try {
      ctx.reply("⏳ Generando reporte mensual...");
      const data = await getMonthlyReport();
      const config = await prisma.system_configuration.findFirst();
      const text = generateFinancialTextReport(`FEBRERO ${data.year}`, data, config.default_exchange_rate); // Ojo: data.month lo puedes formatear a nombre
      ctx.reply(text, { parse_mode: 'Markdown' });
    } catch (e) {
      console.error(e);
      ctx.reply("❌ Error generando reporte mensual.");
    }
  });

  // 5. COMANDO: /yearly
  bot.command('yearly', async (ctx) => {
    if (ctx.user.role !== 'admin') return ctx.reply("🔒 Comando solo para Administradores.");

    try {
      ctx.reply("⏳ Generando reporte anual...");
      const data = await getAnnualReport();
      const config = await prisma.system_configuration.findFirst();
      const text = generateFinancialTextReport(`RESUMEN AÑO ${data.year}`, data, config.default_exchange_rate);
      ctx.reply(text, { parse_mode: 'Markdown' });
    } catch (e) {
      console.error(e);
      ctx.reply("❌ Error generando reporte anual.");
    }
  });

  // 6. MANEJO DE COMANDOS DESCONOCIDOS (Catch-All)
  bot.on('text', (ctx) => {
    // Si no entró en los comandos anteriores, cae aquí
    const msg = `
🤷‍♂️ *No entendí eso*

Intenta usar uno de estos comandos:
📊 \`/monthly\` - Reporte del Mes
📈 \`/yearly\` - Reporte del Año
❓ \`/help\` - Ayuda
    `;
    ctx.reply(msg, { parse_mode: 'Markdown' });
  });

  // 7. CRON JOBS (Reportes Automáticos)
  scheduleAutomaticReports();

  bot.launch();
  console.log("🤖 Telegram Bot Started!");
  
  // Graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
};

// --- 🔔 FUNCIONES DE NOTIFICACIÓN (Exportadas) ---

export const notifySale = async (sale) => {
  if (!bot) return;

  try {
      // Obtener Configuración para cálculos
      const config = await prisma.system_configuration.findFirst();
      const commissionPct = Number(config.seller_commission_percentage);
      const exchangeRate = Number(sale.exchange_rate); // Usar tasa de la venta
      
      // Cálculos para Admin (Ganancia Real Estimada de esta venta)
      const totalSaleUSD = Number(sale.total_cup) / exchangeRate;
      
      // 1. Costo de los productos vendidos
      let totalProductCostUSD = 0;
      sale.sale_products.forEach(item => {
          totalProductCostUSD += (Number(item.product.purchase_price) * item.quantity);
      });

      // 2. Comisión pagada
      const commissionPaid = totalSaleUSD * (commissionPct / 100);

      // 3. Ganancia Operativa
      const grossMargin = totalSaleUSD - totalProductCostUSD - commissionPaid;

      // 4. Diezmo (10% de lo operativo)
      const tithe = grossMargin > 0 ? grossMargin * 0.10 : 0;

      // 5. Ganancia Real
      const realProfit = grossMargin - tithe;


      // --- A. NOTIFICAR AL ADMIN ---
      const admins = await prisma.users.findMany({ where: { role: 'admin', telegram_chat_id: { not: null } } });
      
      const adminMsg = `
🔔 *Nueva Venta*
👤 *Vendedor:* ${sale.seller.name}

💵 *Ingreso:*
*${formatUSD(totalSaleUSD)}*
${new Intl.NumberFormat('es-CU', { style: 'currency', currency: 'CUP' }).format(Number(sale.total_cup))}

✅ *Ganancia Real:* *${formatUSD(realProfit)}*
_(Después de costos, comisión y diezmo)_
      `;
      
      admins.forEach(admin => {
        bot.telegram.sendMessage(admin.telegram_chat_id, adminMsg, { parse_mode: 'Markdown' }).catch(e => console.error("Error sending to admin", e));
      });

      // --- B. NOTIFICAR AL SELLER ---
      if (sale.seller.telegram_chat_id) {
        // Construimos la lista de productos
        const productList = sale.sale_products.map(p => `📦 ${p.product.name} (x${p.quantity})`).join('\n');

        const sellerMsg = `
💸 *Comisión Recibida*

${productList}
💰 *Ganancia:* *+${formatUSD(commissionPaid)}*

_¡Sigue así!_ 🚀
        `;
        bot.telegram.sendMessage(sale.seller.telegram_chat_id, sellerMsg, { parse_mode: 'Markdown' }).catch(e => console.error("Error sending to seller", e));
      }

  } catch (error) {
      console.error("⚠️ Error notificando venta:", error);
  }
};

export const notifyReturn = async (returnData) => {
  if (!bot) return;

  try {
      // Buscar ADMINS y STOREKEEPERS
      const recipients = await prisma.users.findMany({
        where: {
            OR: [
                { role: 'admin' },
                { role: 'storekeeper' }
            ],
            telegram_chat_id: { not: null }
        }
      });

      const msg = `
↩️ *Alerta de Devolución*
📦 *Producto:* ${returnData.product.name}
📝 *Motivo:* ${returnData.reason || 'No especificado'}

📉 *Pérdida:* -${formatUSD(returnData.loss_usd)}
🔄 _Inventario actualizado._
      `;

      recipients.forEach(user => {
        bot.telegram.sendMessage(user.telegram_chat_id, msg, { parse_mode: 'Markdown' }).catch(e => console.error("Error sending return alert", e));
      });

  } catch (error) {
    console.error("⚠️ Error notificando devolución:", error);
  }
};

// --- 📅 CRON JOB INTERNO ---
const scheduleAutomaticReports = async () => {
    // Revisar cada hora (minuto 0)
    cron.schedule('0 * * * *', async () => {
        try {
            const config = await prisma.system_configuration.findFirst();
            if (!config) return;

            const now = new Date();
            const currentDay = now.getDate();
            const currentHour = now.getHours();

            // Reporte Mensual
            if (config.monthly_report_day === currentDay) {
                 const reportTime = new Date(config.monthly_report_time);
                 if (reportTime.getUTCHours() === currentHour) {
                     const admins = await prisma.users.findMany({ where: { role: 'admin', telegram_chat_id: { not: null } } });
                     const data = await getMonthlyReport();
                     const text = generateFinancialTextReport(`REPORTE AUTOMÁTICO: ${data.month}/${data.year}`, data, config.default_exchange_rate);
                     
                     admins.forEach(admin => bot.telegram.sendMessage(admin.telegram_chat_id, text, { parse_mode: 'Markdown' }).catch(e => console.error(e)));
                 }
            }

            // Reporte Anual (Diciembre)
            if (config.annual_report_day === currentDay && (now.getMonth() + 1) === 12) {
                const reportTime = new Date(config.annual_report_time);
                if (reportTime.getUTCHours() === currentHour) {
                    const admins = await prisma.users.findMany({ where: { role: 'admin', telegram_chat_id: { not: null } } });
                    const data = await getAnnualReport();
                    const text = generateFinancialTextReport(`REPORTE AUTOMÁTICO: AÑO ${data.year}`, data, config.default_exchange_rate);
                    
                    admins.forEach(admin => bot.telegram.sendMessage(admin.telegram_chat_id, text, { parse_mode: 'Markdown' }).catch(e => console.error(e)));
                }
            }
        } catch (error) {
            console.error("Error in Cron Job:", error);
        }
    });
};