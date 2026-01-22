import { Telegraf } from 'telegraf';
import { PrismaClient } from '@prisma/client';
import { getMonthlyReport, getAnnualReport } from './services/finance.js';

const prisma = new PrismaClient();
let bot = null;

// --- 🛠️ FORMAT HELPERS (Estilo Ejecutivo) ---

const formatCurrency = (amount, currency = 'USD') => {
  const val = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2
  }).format(amount);
  return `<code>${val}</code>`; // Envoltorio code para Telegram
};

const formatNumber = (amount) => {
  return `<code>${new Intl.NumberFormat('en-US').format(amount)}</code>`;
};

const formatDate = (dateString) => {
  if (!dateString) return '<code>N/A</code>';
  const date = new Date(dateString);
  const str = date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
  return `<code>${str}</code>`;
};

const formatDateTime = (dateString) => {
    if (!dateString) return '<code>N/A</code>';
    const date = new Date(dateString);
    const str = date.toLocaleString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    });
    return `<code>${str}</code>`;
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
        console.error(`⚠️ Telegram Send Error (Chat: ${chatId}):`, error.message);
    }
};

// --- 🎮 COMANDOS Y SEGURIDAD ---
const setupCommands = () => {
    
    // COMANDO START: Lógica inteligente según rol
    bot.start(async (ctx) => {
        const chatId = ctx.chat.id.toString();
        
        // Buscamos quién es este usuario en la DB
        const user = await prisma.users.findFirst({
            where: { telegram_chat_id: chatId }
        });

        // 🅰️ CASO ADMIN: Menú completo
        if (user && user.role === 'admin') {
            const adminMsg = `
👋 <b>Hola Admin ${user.name}</b>

🛠️ <b>PANEL DE CONTROL:</b>
📊 /monthly - Reporte Mensual
📈 /yearly - Reporte Anual
❓ /help - Ayuda
            `;
            return ctx.reply(adminMsg, { parse_mode: 'HTML' });
        }

        // 🅱️ CASO VENDEDOR O DESCONOCIDO: Solo mostrar ID
        // Esto es útil para que el vendedor copie este ID y te lo pase para registrarlo
        const publicMsg = `
👋 <b>Bienvenido a Habana Express</b>

🤖 <b>IDENTIFICACIÓN:</b>
Para vincular tu cuenta, envía este código al administrador:

🆔 <code>${chatId}</code>

<i>Esperando autorización...</i>
        `;
        return ctx.reply(publicMsg, { parse_mode: 'HTML' });
    });

    bot.help((ctx) => ctx.reply("Contacte al administrador para soporte.", { parse_mode: 'HTML' }));

    // 🔒 MIDDLEWARE DE SEGURIDAD PARA REPORTES
    // Función auxiliar para verificar si es admin antes de ejecutar
    const verifyAdmin = async (ctx, next) => {
        const chatId = ctx.chat.id.toString();
        const user = await prisma.users.findFirst({ where: { telegram_chat_id: chatId } });

        if (user && user.role === 'admin') {
            return next();
        } else {
            return ctx.reply("⛔ <b>Acceso Denegado:</b> Comando solo para Administradores.", { parse_mode: 'HTML' });
        }
    };

    // 1. REPORTE MENSUAL (Protegido)
    bot.command('monthly', async (ctx) => {
        verifyAdmin(ctx, async () => {
            try {
                ctx.reply("⏳ <i>Calculando cierre mensual...</i>", { parse_mode: 'HTML' });
                const data = await getMonthlyReport();
                const roi = data.investment > 0 ? ((data.netProfit / data.investment) * 100).toFixed(1) : "0.0";
                
                const msg = `
📊 <b>CIERRE MENSUAL</b> | ${data.month}/${data.year}
🏢 <b>Habana Express Store</b>
${separator}
💰 <b>INGRESOS (Ventas):</b>
${formatCurrency(data.income)}

📉 <b>EGRESOS (Costo + Envíos):</b>
${formatCurrency(data.investment + data.returnLosses)}

💎 <b>GANANCIA NETA:</b>
${formatCurrency(data.netProfit)}

📈 <b>ROI DEL MES:</b> <code>${roi}%</code>
                `;
                ctx.reply(msg, { parse_mode: 'HTML' });
            } catch (e) {
                console.error("Monthly Error:", e);
                ctx.reply("❌ Error generando reporte.");
            }
        });
    });

    // 2. REPORTE ANUAL (Protegido)
    bot.command('yearly', async (ctx) => {
        verifyAdmin(ctx, async () => {
            try {
                ctx.reply("⏳ <i>Calculando cierre anual...</i>", { parse_mode: 'HTML' });
                const data = await getAnnualReport();
                const roi = data.investment > 0 ? ((data.netProfit / data.investment) * 100).toFixed(1) : "0.0";

                const msg = `
📈 <b>CIERRE ANUAL</b> | ${data.year}
🏢 <b>Resumen Global</b>
${separator}
💰 <b>INGRESOS ACUMULADOS:</b>
${formatCurrency(data.income)}

📉 <b>INVERSIÓN TOTAL:</b>
${formatCurrency(data.investment + data.returnLosses)}

🏆 <b>GANANCIA NETA TOTAL:</b>
${formatCurrency(data.netProfit)}

📊 <b>ROI PROMEDIO:</b> <code>${roi}%</code>
                `;
                ctx.reply(msg, { parse_mode: 'HTML' });
            } catch (e) {
                console.error("Yearly Error:", e);
                ctx.reply("❌ Error generando reporte.");
            }
        });
    });
};

// --- 🚀 INITIALIZATION ---
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

    bot.launch({
      dropPendingUpdates: true,
      polling: { timeout: 30, limit: 100 }
    });

    console.log("🤖 Telegram bot running 🚀");

    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));

  } catch (error) {
    console.error("❌ Critical Error initializing Bot:", error.message);
  }
};


// --- 🔔 NOTIFICACIONES DEL SISTEMA ---

// 1. NUEVA VENTA (Con Diezmo)
export const notifySale = async (sale) => {
  if (!bot) return;

  try {
      const config = await prisma.system_configuration.findFirst();
      const commissionPct = config ? Number(config.seller_commission_percentage) : 0;

      // Cálculos Básicos
      const exchangeRate = Number(sale.exchange_rate);
      const totalCUP = Number(sale.total_cup);
      const totalUSD = exchangeRate > 0 ? totalCUP / exchangeRate : 0;

      let itemsList = "";
      let totalProductCostUSD = 0;
      const warrantyItems = []; 

      sale.sale_products.forEach(item => {
          const product = item.product;
          itemsList += `▫️ <b>${item.quantity}x</b> ${product.name}\n`;
          totalProductCostUSD += (Number(product.purchase_price) * item.quantity);

          if (product.warranty === true) {
              warrantyItems.push({
                  name: product.name,
                  sku: product.sku || 'S/N',
                  quantity: item.quantity
              });
          }
      });

      // 1. Cálculos de Ganancia
      const commissionUSD = totalUSD * (commissionPct / 100);
      const netProfitUSD = totalUSD - totalProductCostUSD - commissionUSD;

      // 🔴 CORRECCIÓN AQUÍ: Calculamos ROI (Ganancia / Costo) en vez de Margen (Ganancia / Venta)
      const roiPercentage = totalProductCostUSD > 0 
          ? (netProfitUSD / totalProductCostUSD) * 100 
          : 0;

      // Valores para el Vendedor
      const commissionCUP = commissionUSD * exchangeRate;
      const cashToDeliverCUP = totalCUP - commissionCUP;

      // ⛪ CÁLCULO DEL DIEZMO (10% de la Ganancia Neta)
      const titheUSD = Math.max(0, netProfitUSD * 0.10);
      const titheCUP = titheUSD * exchangeRate;

      // 🅰️ MENSAJE ADMIN (Financiero Actualizado)
      const adminMsg = `
💸 <b>NUEVA VENTA CONFIRMADA</b>
🆔 <b>Ticket:</b> <code>#SALE-${sale.id_sale}</code>
${separator}
👤 <b>Vendedor:</b> ${sale.seller.name}
📱 <b>Cliente:</b> <code>${sale.buyer_phone}</code>

🛒 <b>CARRITO:</b>
${itemsList}${separator}
💵 <b>BALANCE FINANCIERO:</b>
🟢 <b>Ingreso Total:</b> ${formatCurrency(totalUSD)}
🔴 <b>Costo Merc.:</b> ${formatCurrency(totalProductCostUSD)}
🤝 <b>Comisión:</b>     ${formatCurrency(commissionUSD)}

🚀 <b>GANANCIA NETA:</b> ${formatCurrency(netProfitUSD)}
📈 <b>Rentabilidad:</b>  <code>${roiPercentage.toFixed(1)}%</code>
⛪ <b>DIEZMO (10%):</b>  ${formatCurrency(titheCUP, 'CUP')}
💱 <b>Tasa Aplicada:</b> <code>${exchangeRate}</code>
      `;

      const admins = await prisma.users.findMany({ where: { role: 'admin', telegram_chat_id: { not: null } } });
      for (const admin of admins) {
          await safeReply(admin.telegram_chat_id, adminMsg);
      }

      // 🅱️ MENSAJE VENDEDOR (Motivacional - Igual que antes)
      const sellerMsg = `
💸 <b>¡EXCELENTE VENTA, ${sale.seller.name.toUpperCase()}!</b>
📅 ${formatDateTime(sale.sale_date)}
${separator}
📦 <b>Has vendido:</b>
${itemsList}${separator}
💼 <b>CAJA (A Entregar):</b>
${formatCurrency(cashToDeliverCUP, 'CUP')}

💰 <b>TU COMISIÓN:</b>
${formatCurrency(commissionCUP, 'CUP')} 🎉

🚀 <i>¡Sigue así!</i>
      `;

      if (sale.seller && sale.seller.telegram_chat_id) {
          await safeReply(sale.seller.telegram_chat_id, sellerMsg);
      }

      // 🅾️ GARANTÍA (Igual que antes)
      if (warrantyItems.length > 0) {
          const saleDate = new Date(sale.sale_date);
          const expirationDate = addDays(saleDate, 7);
          let warrantyList = "";
          warrantyItems.forEach(p => {
              warrantyList += `📦 <b>${p.name}</b>\n🔢 SKU: <code>${p.sku}</code>\n`;
          });
          const warrantyMsg = `
📃 <b>CERTIFICADO DE GARANTÍA</b>
🆔 <b>Ticket:</b> <code>#SALE-${sale.id_sale}</code>
${separator}
📅 <b>Emisión:</b> ${formatDate(saleDate)}
⚠️ <b>VENCE:</b> ${formatDate(expirationDate)} (7 Días)
📱 <b>Cliente:</b> <code>${sale.buyer_phone}</code>
${separator}
<b>PRODUCTOS CUBIERTOS:</b>
${warrantyList}
${separator}
ℹ️ <i>Cubre defectos de fábrica. No humedad ni golpes.</i>
          `;
          for (const admin of admins) { await safeReply(admin.telegram_chat_id, warrantyMsg); }
          if (sale.seller && sale.seller.telegram_chat_id) { await safeReply(sale.seller.telegram_chat_id, warrantyMsg); }
      }

  } catch (error) { 
      console.error("Notify Sale Error:", error.message); 
  }
};
// 2. GARANTÍA VENCIDA
export const notifyWarrantyExpiration = async (sale, products) => {
    if (!bot) return;

    try {
        let productList = "";
        products.forEach(p => {
             productList += `📦 ${p.name}\n   SKU: <code>${p.sku}</code>\n`;
        });

        // Mensaje para Admin
        const msgAdmin = `
🕒 <b>GARANTÍA VENCIDA</b> (7 Días)
🆔 <b>Ticket:</b> <code>#SALE-${sale.id_sale}</code>
${separator}
📱 <b>Cliente:</b> <code>${sale.buyer_phone}</code>
📅 <b>Venta:</b> ${formatDate(sale.sale_date)}

<b>PRODUCTOS SIN COBERTURA:</b>
${productList}
✅ <b>Estado:</b> Caso Cerrado.
        `;

        // Mensaje para Vendedor
        const msgSeller = `
🕒 <b>AVISO: GARANTÍA EXPIRADA</b>
El cliente <code>${sale.buyer_phone}</code> ya no tiene cobertura.
${separator}
<b>PRODUCTOS:</b>
${productList}
🚫 <i>No aceptar devoluciones de este ticket.</i>
        `;

        const admins = await prisma.users.findMany({ where: { role: 'admin', telegram_chat_id: { not: null } } });
        admins.forEach(u => safeReply(u.telegram_chat_id, msgAdmin));

        if (sale.seller && sale.seller.telegram_chat_id) {
            await safeReply(sale.seller.telegram_chat_id, msgSeller);
        }

    } catch (e) { console.error("Warranty Exp Error:", e); }
};

// 3. STOCK AGOTADO (Con Análisis de Lote)
export const notifyStockDepletion = async (product) => {
  if (!bot) return;
  try {
    const config = await prisma.system_configuration.findFirst();
    const commissionPct = config ? Number(config.seller_commission_percentage) : 0;

    // Buscar historial de ventas para calcular rentabilidad real del lote
    const salesHistory = await prisma.sale_products.findMany({
        where: { id_product: product.id_product },
        include: { sale: true } // Necesario para saber tasa histórica si quisieras afinar
    });

    let totalQuantitySold = 0;
    salesHistory.forEach(item => { totalQuantitySold += item.quantity; });

    const purchasePrice = Number(product.purchase_price);
    const totalInvestmentUSD = purchasePrice * totalQuantitySold;
    
    // Estimación x2 (Precio venta estándar)
    const totalRevenueUSD = totalInvestmentUSD * 2; 
    const totalCommissionsUSD = totalRevenueUSD * (commissionPct / 100);
    const netProfitUSD = totalRevenueUSD - totalInvestmentUSD - totalCommissionsUSD;

    const msg = `
⚡ <b>STOCK AGOTADO</b>
📦 <b>Producto:</b> ${product.name}
${separator}
🏁 <b>RESUMEN DEL LOTE:</b>
🔢 <b>Unidades Vendidas:</b> <code>${totalQuantitySold}</code>
📉 <b>Inversión Total:</b> ${formatCurrency(totalInvestmentUSD)}

🏆 <b>GANANCIA ESTIMADA:</b>
${formatCurrency(netProfitUSD)}

⚠️ <i>Producto desactivado del catálogo automáticamente.</i>
    `;

    const admins = await prisma.users.findMany({ where: { role: 'admin', telegram_chat_id: { not: null } } });
    admins.forEach(u => safeReply(u.telegram_chat_id, msg));

  } catch (error) { console.error("Notify Stock Error:", error.message); }
};

// 4. SINCRONIZACIÓN DIARIA (ADMIN)
export const notifyDailyUpdate = async (newRate, productsCount) => {
    if (!bot) return;
    try {
        const msg = `
🌐 <b>SINCRONIZACIÓN DIARIA</b>
📅 ${formatDateTime(new Date())}
${separator}
🇺🇸 <b>TASA DE CAMBIO:</b>
<code>1 USD = ${newRate} CUP</code>

🏷️ <b>CATÁLOGO ACTUALIZADO:</b>
✅ <b>${productsCount}</b> Productos recalcularon su precio en CUP.
        `;
        const admins = await prisma.users.findMany({ where: { role: 'admin', telegram_chat_id: { not: null } } });
        admins.forEach(u => safeReply(u.telegram_chat_id, msg));
    } catch (e) { console.error(e); }
};

// 5. LISTA DE PRECIOS DIARIA (VENDEDOR)
export const notifyDailyPrices = async (seller, newRate) => {
    if (!bot || !seller.telegram_chat_id) return;
    try {
        let msg = `
👋 <b> Hola </b> <b> ${seller.name} </b>
💲 <b>LISTA DE PRECIOS DE HOY:</b>
🗓️ <b>Fecha:</b> ${formatDate(new Date())}
💵 <b>Tasa Base:</b> <code>${newRate} CUP</code>
${separator}
<pre>
PRODUCTO         | STOCK | PRECIO CUP
-----------------|-------|-----------
`;
        seller.seller_products.forEach(sp => {
            const priceNow = Number(sp.product.purchase_price) * 2 * newRate;
            // Truncar nombre a 16 chars
            const shortName = sp.product.name.substring(0, 16).padEnd(16, ' ');
            const stock = sp.quantity.toString().padStart(5, ' ');
            // Formatear precio sin decimales y con comas
            const priceStr = new Intl.NumberFormat('en-US').format(priceNow);
            const price = priceStr.padStart(10, ' ');
            
            msg += `${shortName} | ${stock} | ${price}\n`;
        });
        msg += `</pre>
${separator}
💡 <i>Precios válidos hasta la próxima actualización.</i>`;
        
        safeReply(seller.telegram_chat_id, msg);
    } catch (e) { console.error(e); }
};

// 6. DEVOLUCIÓN (COMPLETA Y DETALLADA)
export const notifyReturn = async (returnData, returnToStock) => {
    if (!bot) return;
    try {
        const saleDate = formatDate(returnData.sale.sale_date);
        const sellerName = returnData.sale.seller ? returnData.sale.seller.name : "Desconocido";
        const sku = returnData.product.sku || "Sin SKU";
        
       
        const destinationText = returnToStock 
            ? "✅ <b>Regresa al Stock</b> (Disponible)" 
            : "🗑️ <b>Desechado / Merma</b> (Pérdida Total)";

        const msg = `
🔙 <b>REPORTE DE DEVOLUCIÓN</b>
🎫 <b>Ticket:</b> <code>#SALE-${returnData.sale.id_sale}</code>
${separator}
📅 <b>Venta Original:</b> ${saleDate}
👤 <b>Vendedor: </b> ${sellerName}
📱 <b>Cliente: </b> <code>${returnData.sale.buyer_phone}</code>

📦 <b>PRODUCTO DEVUELTO:</b>
<b>${returnData.quantity}x</b> ${returnData.product.name}
🔢 <b>SKU:</b> <code>${sku}</code>

📝 <b>MOTIVO:</b>
<i>"${returnData.reason || 'No especificado'}"</i>
${separator}
📉 <b>IMPACTO Y DESTINO:</b>
💸 <b>Pérdida:</b> -${formatCurrency(returnData.loss_usd)}
${destinationText}
        `;

        // Notificar solo a Admins
        const recipients = await prisma.users.findMany({
          where: { role: 'admin', telegram_chat_id: { not: null } }
        });

        for (const u of recipients) {
            await safeReply(u.telegram_chat_id, msg);
        }

    } catch (e) { console.error("Notify Return Error:", e); }
};