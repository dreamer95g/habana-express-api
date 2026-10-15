import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Helper: Redondeo estándar a entero (sin decimales)
// Ej: 10.4 -> 10, 10.5 -> 11
const roundInt = (val) => Math.round(Number(val));

/**
 * Lógica central de cálculo financiero
 */
// src/services/finance.js

export const calculateProfitInPeriod = async (startDate, endDate) => {
  const config = await prisma.system_configuration.findFirst();
  const commissionPct = config ? Number(config.seller_commission_percentage) : 0;

  const shipments = await prisma.shipments.findMany({ where: { shipment_date: { gte: startDate, lte: endDate } } });
  const sales = await prisma.sales.findMany({ where: { sale_date: { gte: startDate, lte: endDate }, status: 'COMPLETED' } });
  const returns = await prisma.returns.findMany({ where: { return_date: { gte: startDate, lte: endDate } } });
  const expenses = await prisma.expenses.findMany({ where: { date: { gte: startDate, lte: endDate } } });

  // 1. INVERSIÓN
  let totalInvestmentUSD = 0;
  shipments.forEach(ship => {
    const rate = Number(ship.exchange_rate) || 1;
    totalInvestmentUSD += Number(ship.shipping_cost_usd) + Number(ship.merchandise_cost_usd) + (Number(ship.customs_fee_cup) / rate);
  });

  // 2. VENTAS Y COMISIONES (Aplicando el redondeo EXACTO a la centena por cada venta)
  let totalSalesUSD = 0;
  let totalCommissionsUSD = 0;

  sales.forEach(sale => {
    const rate = Number(sale.exchange_rate) || 1;
    const saleCup = Number(sale.total_cup);
    
    totalSalesUSD += (saleCup / rate);

    // Replicar la regla exacta del bot de Telegram
    const rawCommCUP = saleCup * (commissionPct / 100);
    const commCUP = Math.round(rawCommCUP / 100) * 100;
    
    totalCommissionsUSD += (commCUP / rate);
  });

  // 3. MERMAS Y GASTOS (OPEX)
  let returnLossesUSD = 0;
  returns.forEach(ret => { returnLossesUSD += Number(ret.loss_usd); });
  
  let totalExpensesUSD = 0;
  expenses.forEach(exp => { totalExpensesUSD += Number(exp.amount_usd); });

  // 4. UTILIDAD REAL
  const realProfit = totalSalesUSD - (totalInvestmentUSD + totalCommissionsUSD + returnLossesUSD + totalExpensesUSD);

  return {
    income: roundInt(totalSalesUSD) || 0,
    investment: roundInt(totalInvestmentUSD) || 0,
    profit: realProfit > 0 ? roundInt(realProfit) : 0, 
    netProfit: roundInt(realProfit) || 0 
  };
};

/**
 * Reporte Mensual
 */
export const getMonthlyReport = async () => {
  // 1. Obtenemos la fecha actual "traducida" a la hora de Cuba
  const cubaTime = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Havana"}));
  
  const year = cubaTime.getFullYear();
  const month = cubaTime.getMonth();

  // 2. Definimos el inicio del mes: Día 1 a las 00:00:00 (Hora Cuba)
  const startOfMonth = new Date(year, month, 1, 0, 0, 0);
  
  // 3. Definimos el final del mes: Último día a las 23:59:59 (Hora Cuba)
  // Usamos month + 1 y día 0 para obtener el último día del mes actual
  const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);

  // 4. Pasamos el rango exacto al calculador
  const data = await calculateProfitInPeriod(startOfMonth, endOfMonth);
  
  return {
    period: "Mensual",
    month: month + 1,
    year: year,
    ...data
  };
};

/**
 * Reporte Anual Completo
 * Genera el balance de los 12 meses del año actual
 */
export const getAnnualReport = async () => {
  try {
    // 1. Forzamos la zona horaria de Cuba para no depender de la hora del VPS
    const cubaTime = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Havana" }));
    const currentYear = cubaTime.getFullYear();

    // 2. Rango global del año (Enero 1 a Diciembre 31)
    const startOfYear = new Date(currentYear, 0, 1, 0, 0, 0);
    const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59);

    // 3. Obtenemos el balance global del año llamando a la función de periodo
    const globalData = await calculateProfitInPeriod(startOfYear, endOfYear);

    const breakdown = [];

    // 4. Ciclo para generar los 12 meses
    for (let i = 0; i < 12; i++) {
      // Definimos inicio y fin de cada mes (Hora Cuba)
      const startOfMonth = new Date(currentYear, i, 1, 0, 0, 0);
      const endOfMonth = new Date(currentYear, i + 1, 0, 23, 59, 59);

      // Si el mes es futuro, enviamos datos en cero
      if (startOfMonth > cubaTime) {
        breakdown.push({
          month: i + 1,
          investment: 0,
          income: 0,     // <--- Necesario para el gráfico
          profit: 0,
          roiPercentage: 0
        });
        continue;
      }

      // Calculamos los datos del mes específico
      const monthData = await calculateProfitInPeriod(startOfMonth, endOfMonth);

      // Lógica de ROI para el mes
      let roi = 0;
      if (monthData.investment > 0) {
        // ROI Real = (Utilidad Neta / Inversión) * 100
        roi = (monthData.netProfit / monthData.investment) * 100;
      } else if (monthData.netProfit > 0) {
        // Si vendiste sin invertir este mes, es recuperación (100%)
        roi = 100;
      }

      // Insertamos en el desglose
      breakdown.push({
        month: i + 1,
        investment: monthData.investment || 0,
        income: monthData.income || 0,      // <--- ESTA ES LA LÍNEA AZUL DE TU GRÁFICO
        profit: monthData.profit || 0,      // Para el gráfico de barras (mínimo 0)
        roiPercentage: parseFloat(roi.toFixed(2)) || 0
      });
    }

    // 5. Retornamos el objeto exacto que pide el Schema de GraphQL
    return {
      year: currentYear,
      totalNetProfit: globalData.netProfit || 0, // Campo obligatorio
      income: globalData.income || 0,
      investment: globalData.investment || 0,
      profit: globalData.profit || 0,
      breakdown: breakdown
    };

  } catch (error) {
    console.error("❌ Error en getAnnualReport:", error);
    // En caso de error crítico, devolvemos estructura vacía para no romper el front
    return {
      year: new Date().getFullYear(),
      totalNetProfit: 0,
      breakdown: []
    };
  }
};
export const calculateTopSellers = async (period) => {
  const now = new Date();
  let startDate;

  if (period === 'month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    startDate = new Date(now.getFullYear(), 0, 1);
  }

  const sales = await prisma.sales.findMany({
    where: { sale_date: { gte: startDate } },
    include: { seller: true, sale_products: true }
  });

  const sellerStats = {};

  sales.forEach(sale => {
    const sellerId = sale.id_seller;
    const rate = Number(sale.exchange_rate);
    const cup = Number(sale.total_cup);
    const usdAmount = rate > 0 ? cup / rate : 0;
    
    const itemsCount = sale.sale_products.reduce((acc, item) => acc + item.quantity, 0);

    if (!sellerStats[sellerId]) {
      sellerStats[sellerId] = {
        id_user: sellerId,
        name: sale.seller.name,
        photo_url: sale.seller.photo_url,
        total_sales_usd: 0,
        items_sold: 0
      };
    }

    sellerStats[sellerId].total_sales_usd += usdAmount;
    sellerStats[sellerId].items_sold += itemsCount;
  });

  const ranking = Object.values(sellerStats)
    .sort((a, b) => b.total_sales_usd - a.total_sales_usd)
    .map(seller => ({
        ...seller,
        // 🔥 Redondeamos el total vendido aquí
        total_sales_usd: roundInt(seller.total_sales_usd)
    }));

  return ranking;
};