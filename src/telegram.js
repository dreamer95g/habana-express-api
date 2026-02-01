import { Telegraf } from 'telegraf';
import { PrismaClient } from '@prisma/client';
import { getMonthlyReport, getAnnualReport } from './services/finance.js';

const prisma = new PrismaClient();
let bot = null;

// --- 🛠️ HELPERS DE FORMATO ---
const formatCurrency = (amount, currency = 'USD') => {
  const val = new Intl.NumberFormat('en-US', {
    style: 'currency', currency, minimumFractionDigits: 2
  }).format(amount);
  return `<code>${val}</code>`;
};

const formatDate = (dateString) => {
  const date = new Date(Number(dateString) || dateString);
  return `<code>${date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}</code>`;
};

const formatDateTime = (dateString) => {
    const date = new Date(Number(dateString) || dateString);
    return `<code>${date.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</code>`;
  };

const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const separator = "──────────────";

const safeReply = async (chatId, message) => {
    if (!bot || !chatId) return; 
    try {
        await bot.telegram.sendMessage(chatId, message, { parse_mode: 'HTML' });
    } catch (error) {
        console.error(`⚠️ Telegram Error (Chat: ${chatId}):`, error.message);
    }
};

// --- 🎮 COMANDOS ---
const setupCommands = async () => {
    try {
        await bot.telegram.setMyCommands([{ command: 'start', description: 'Reiniciar' }], { scope: { type: 'default' } });
        const admins = await prisma.users.findMany({ where: { role: 'admin', telegram_chat_id: { not: null } } });
        for (const admin of admins) {
            await bot.telegram.setMyCommands([
                { command: 'start', description: 'Panel' },
                { command: 'monthly', description: 'Mes' },
                { command: 'yearly', description: 'Año' },
            ], { scope: { type: 'chat', chat_id: admin.telegram_chat_id } });
        }
    } catch (e) { console.error("Menu Error:", e); }

    bot.start(async (ctx) => {
        const chatId = ctx.chat.id.toString();
        const user = await prisma.users.findFirst({ where: { telegram_chat_id: chatId } });
        if (user?.role === 'admin') return ctx.reply(`<b>Admin ${user.name}</b>`, { parse_mode: 'HTML' });
        if (user?.role === 'seller') return ctx.reply(`👋 <b>Vendedor ${user.name} activo.</b>`, { parse_mode: 'HTML' });
        return ctx.reply(`👋 <b>Bienvenido</b>\nTu ID: <code>${chatId}</code>`, { parse_mode: 'HTML' });
    });

    const verifyAdmin = async (ctx, next) => {
        const user = await prisma.users.findFirst({ where: { telegram_chat_id: ctx.chat.id.toString(), role: 'admin' } });
        if (user) return next();
    };

    // 1. REPORTE MENSUAL
bot.command('monthly', verifyAdmin, async (ctx) => {
    try {
        const d = await getMonthlyReport();
        const roi = d.roiPercentage || 0;
        const net = d.netProfit || 0; // Balance real (Ventas - Todo)
        
        const statusIcon = net >= 0 ? "🟢" : "🔴";
        const trendIcon = roi >= 30 ? "🚀" : (roi > 0 ? "📈" : "📉");

        const message = `
📊 <b>RESUMEN MENSUAL</b>
${separator}
💰 <b>VENTAS:</b> ${formatCurrency(d.income)}
📦 <b>INVERSIÓN:</b> ${formatCurrency(d.investment)}
${separator}
💵 <b>UTILIDAD NETA:</b> ${formatCurrency(d.profit)}
💹 <b>BALANCE REAL:</b> ${formatCurrency(net)}
${trendIcon} <b>ROI:</b> <code>${roi}%</code>

${statusIcon} <b>ESTADO:</b> ${net >= 0 ? 'EN GANANCIA' : 'RECUPERANDO INVERSIÓN'}
`;
        ctx.reply(message, { parse_mode: 'HTML' });
    } catch (e) {
        ctx.reply("❌ Error generando reporte mensual.");
    }
});

// 2. REPORTE ANUAL
bot.command('yearly', verifyAdmin, async (ctx) => {
    try {
        const d = await getAnnualReport();
        const roi = ((d.totalNetProfit / d.investment) * 100).toFixed(1);
        
        const message = `
📈 <b>BALANCE ANUAL ${d.year}</b>
${separator}
🛒 <b>VENTAS TOTALES:</b> ${formatCurrency(d.income)}
✈ <b>INVERSIÓN TOTAL:</b> ${formatCurrency(d.investment)}
${separator}
💰 <b>UTILIDAD NETA:</b> ${formatCurrency(d.totalNetProfit)}
📊 <b>ROI ANUAL:</b> <code>${roi}%</code>

`;
        ctx.reply(message, { parse_mode: 'HTML' });
    } catch (e) {
        ctx.reply("❌ Error generando reporte anual.");
    }
});
};

// --- 🚀 INICIO ---
export const initTelegramBot = async () => {
    try {
        const config = await prisma.system_configuration.findFirst();
        if (!config?.telegram_bot_token) return;
        bot = new Telegraf(config.telegram_bot_token);
        await setupCommands();
        bot.launch({ dropPendingUpdates: true });
        console.log("🤖 Bot ready");
    } catch (e) { console.error("Error:", e); }
};

// --- 🔔 NOTIFICACIONES DEL SISTEMA ---

// 1. NOTIFICACIÓN DE VENTAS (ADMIN & SELLER)
export const notifySale = async (sale) => {
  if (!bot) return;
  try {
      const config = await prisma.system_configuration.findFirst();
      const commPct = config ? Number(config.seller_commission_percentage) : 0;
      
      const rate = Number(sale.exchange_rate);
      const totalCUP = Number(sale.total_cup);
      const totalUSD = totalCUP / rate;

      let items = "";
      let costUSD = 0;
      const warranties = [];

      sale.sale_products.forEach(sp => {
          items += `▫️ <b>${sp.quantity}x</b> ${sp.product.name}\n`;
          costUSD += (Number(sp.product.purchase_price) * sp.quantity);
          if (sp.product.warranty) warranties.push(sp.product);
      });

      const commUSD = totalUSD * (commPct / 100);
      const commCUP = commUSD * rate;
      const netUSD = totalUSD - costUSD - commUSD;
      const titheCUP = (netUSD * 0.10) * rate;
      
      // Dinero que el vendedor debe entregarte (Venta Total - Su Comisión)
      const cashToDeliverCUP = totalCUP - commCUP;

      // 🅰️ MENSAJE PARA EL ADMIN
      const adminMsg = `
💸 <b>NUEVA VENTA CONFIRMADA</b>
🆔 <b>Ticket:</b> <code>#SALE-${sale.id_sale}</code>
${separator}
👤 <b>Vendedor:</b> ${sale.seller.name}
📱 <b>Cliente:</b> <code>${sale.buyer_phone}</code>

🛒 <b>PRODUCTOS:</b>
${items}${separator}
💵 <b>OPERACIÓN (CUP):</b>
💰 <b>Total Venta:</b> ${formatCurrency(totalCUP, 'CUP')}
🤝 <b>Comisión:</b>    -${formatCurrency(commCUP, 'CUP')}
📥 <b>COBRAR A VENDEDOR:</b> <b>${formatCurrency(cashToDeliverCUP, 'CUP')}</b>

📊 <b>BALANCE (USD):</b>
🟢 <b>Ingreso:</b> ${formatCurrency(totalUSD)}
🔴 <b>Costo:</b>   ${formatCurrency(costUSD)}
🚀 <b>NETO:</b>    ${formatCurrency(netUSD)}
📈 <b>ROI:</b>     <code>${((netUSD/costUSD)*100).toFixed(1)}%</code>
⛪ <b>DIEZMO:</b>   ${formatCurrency(titheCUP, 'CUP')}
`;

      const admins = await prisma.users.findMany({ where: { role: 'admin', telegram_chat_id: { not: null } } });
      admins.forEach(a => safeReply(a.telegram_chat_id, adminMsg));

      // 🅱️ MENSAJE PARA EL VENDEDOR
      const sellerMsg = `
💸 <b>¡VENTA EXITOSA, ${sale.seller.name.toUpperCase()}!</b>
${separator}
${items}${separator}
💰 <b>TU COMISIÓN:</b> ${formatCurrency(commCUP, 'CUP')}
💵 <b>ENTREGAR A CAJA:</b> <b>${formatCurrency(cashToDeliverCUP, 'CUP')}</b>

🚀 <i>¡Buen trabajo! Reporta el efectivo al cerrar.</i>
`;
      if (sale.seller?.telegram_chat_id) safeReply(sale.seller.telegram_chat_id, sellerMsg);

      // 🅾️ CERTIFICADO DE GARANTÍA (Si aplica)
      if (warranties.length > 0) {
          let wTxt = "";
          warranties.forEach(w => wTxt += `📦 <b>${w.name}</b>\n🔢 SKU: <code>${w.sku || 'N/A'}</code>\n`);
          
          const wMsg = `
📃 <b>CERTIFICADO DE GARANTÍA</b>
🆔 <b>Ticket:</b> <code>#SALE-${sale.id_sale}</code>
${separator}
📅 <b>Vence:</b> ${formatDate(addDays(new Date(), 7))}
👤 <b>Vendedor:</b> ${sale.seller.name}
📱 <b>Cliente:</b> <code>${sale.buyer_phone}</code>
${separator}
<b>PRODUCTOS CUBIERTOS:</b>
${wTxt}${separator}
ℹ️ <i>Cubre defectos de fábrica. No humedad ni golpes.</i>
`;

          admins.forEach(a => safeReply(a.telegram_chat_id, wMsg));
          if (sale.seller?.telegram_chat_id) safeReply(sale.seller.telegram_chat_id, wMsg);
      }
  } catch (e) { console.error("Error en notifySale:", e); }
};

// 2. GARANTÍA VENCIDA
export const notifyWarrantyExpiration = async (sale, products) => {
    if (!bot) return;
    let list = "";
    products.forEach(p => list += `📦 ${p.name}\n`);
    const msg = `🕒 <b>GARANTÍA VENCIDA</b>\n🆔 <code>#SALE-${sale.id_sale}</code>\n${separator}\n📱 Cliente: <code>${sale.buyer_phone}</code>\n${list}🚫 <b>Sin cobertura a partir de hoy.</b>`;
    const admins = await prisma.users.findMany({ where: { role: 'admin', telegram_chat_id: { not: null } } });
    admins.forEach(u => safeReply(u.telegram_chat_id, msg));
};

// 3. STOCK AGOTADO
export const notifyStockDepletion = async (product) => {
    if (!bot) return;
    const msg = `⚡ <b>STOCK AGOTADO</b>\n📦 <b>Producto:</b> ${product.name}\n${separator}\n⚠️ El producto ha sido desactivado del catálogo automáticamente por falta de existencia.`;
    const admins = await prisma.users.findMany({ where: { role: 'admin', telegram_chat_id: { not: null } } });
    admins.forEach(u => safeReply(u.telegram_chat_id, msg));
};

// 4. SINCRONIZACIÓN DIARIA (ADMIN)
export const notifyDailyUpdate = async (newRate, productsCount) => {
    if (!bot) return;
    const msg = `🌐 <b>SINCRONIZACIÓN</b>\n${separator}\n🇺🇸 Tasa: <b>${newRate} CUP</b>\n✅ <b>${productsCount}</b> productos actualizados.`;
    const admins = await prisma.users.findMany({ where: { role: 'admin', telegram_chat_id: { not: null } } });
    admins.forEach(u => safeReply(u.telegram_chat_id, msg));
};

// 5. LISTA DE PRECIOS DIARIA (VENDEDOR)
export const notifyDailyPrices = async (seller, newRate) => {
    if (!bot || !seller.telegram_chat_id) return;
    let msg = `📢 <b>PRECIOS ACTUALIZADOS</b>\n🗓️ ${formatDate(new Date())}\n💱 Tasa: <b>${newRate} CUP</b>\n${separator}\n`;
    msg += `<i>Hola ${seller.name.split(' ')[0]}, aquí tus precios de hoy:</i>\n\n`;
    
    seller.seller_products.forEach(sp => {
             
         // Aplicamos el mismo redondeo para que el mensaje del bot coincida con la DB
         const p = sp.product.sale_price;

        msg += `📦 <b>${sp.product.name.toUpperCase()}</b>\n🏷️ <b>${new Intl.NumberFormat('en-US').format(p)} CUP</b>\n📊 Stock: <code>${sp.quantity}</code>\n───────────────────\n`;
       });
    safeReply(seller.telegram_chat_id, msg);
};

// 6. DEVOLUCIÓN
export const notifyReturn = async (ret, returnToStock) => {
    if (!bot) return;
    const msg = `🔙 <b>DEVOLUCIÓN</b>\n🎫 <code>#SALE-${ret.sale.id_sale}</code>\n${separator}\n👤 Vendedor: ${ret.sale.seller.name}\n📦 ${ret.quantity}x ${ret.product.name}\n📝 Motivo: ${ret.reason || 'N/A'}\n📉 Pérdida: -${formatCurrency(ret.loss_usd)}\n${returnToStock ? '✅ Al Stock' : '🗑️ Merma'}`;
    const admins = await prisma.users.findMany({ where: { role: 'admin', telegram_chat_id: { not: null } } });
    admins.forEach(u => safeReply(u.telegram_chat_id, msg));
};