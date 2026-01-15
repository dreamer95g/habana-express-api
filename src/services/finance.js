import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Helper: Redondeo estándar a entero (sin decimales)
// Ej: 10.4 -> 10, 10.5 -> 11
const roundInt = (val) => Math.round(Number(val));

/**
 * Lógica central de cálculo financiero
 */
const calculateProfitInPeriod = async (startDate, endDate) => {
  // 1. Obtener Configuración (para % de comisión)
  const config = await prisma.system_configuration.findFirst();
  const commissionPct = config ? Number(config.seller_commission_percentage) : 0;

  // 2. Consultas a BD
  const sales = await prisma.sales.findMany({
    where: { sale_date: { gte: startDate, lte: endDate } },
  });

  const shipments = await prisma.shipments.findMany({
    where: { shipment_date: { gte: startDate, lte: endDate } },
  });

  const returns = await prisma.returns.findMany({
    where: { return_date: { gte: startDate, lte: endDate } },
  });

  // 3. --- INGRESOS (INCOME) ---
  let totalIncomeUSD = 0;
  sales.forEach(sale => {
    const rate = Number(sale.exchange_rate);
    const cup = Number(sale.total_cup);
    if (rate > 0) totalIncomeUSD += cup / rate;
  });

  // 4. --- COSTOS DE INVERSIÓN (INVESTMENT) ---
  let totalInvestmentUSD = 0;
  shipments.forEach(ship => {
    const shipping = Number(ship.shipping_cost_usd);
    const merch = Number(ship.merchandise_cost_usd);
    const customsCup = Number(ship.customs_fee_cup);
    const rate = Number(ship.exchange_rate);
    const customsUsd = rate > 0 ? customsCup / rate : 0;

    totalInvestmentUSD += (shipping + merch + customsUsd);
  });

  // 5. --- PÉRDIDAS OPERATIVAS (RETURNS) ---
  let returnLossesUSD = 0;
  returns.forEach(ret => {
    returnLossesUSD += Number(ret.loss_usd);
  });

  // 6. --- COMISIONES VENDEDORES ---
  const totalCommissionsUSD = totalIncomeUSD * (commissionPct / 100);

  // 7. --- GANANCIA NETA (Sin Diezmo) ---
  const netProfit = totalIncomeUSD - (totalInvestmentUSD + returnLossesUSD + totalCommissionsUSD);

  // 🔥 RETORNAMOS VALORES REDONDEADOS A ENTEROS
  return {
    income: roundInt(totalIncomeUSD),
    investment: roundInt(totalInvestmentUSD),
    returnLosses: roundInt(returnLossesUSD),
    commissions: roundInt(totalCommissionsUSD),
    netProfit: roundInt(netProfit)
  };
};

/**
 * Reporte Mensual
 */
export const getMonthlyReport = async () => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  
  const data = await calculateProfitInPeriod(startOfMonth, now);
  
  return {
    period: "Mensual",
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    ...data
  };
};

/**
 * Reporte Anual
 */
export const getAnnualReport = async () => {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  
  // 1. Totales Globales (Redondeados)
  const globalData = await calculateProfitInPeriod(startOfYear, now);

  // 2. Desglose para Gráficos
  const breakdown = [];
  for (let i = 0; i < 12; i++) {
    const start = new Date(now.getFullYear(), i, 1);
    const end = new Date(now.getFullYear(), i + 1, 0, 23, 59, 59);
    if (start > now) break;

    const monthData = await calculateProfitInPeriod(start, end);
    
    // ROI se deja con 2 decimales porque es un porcentaje (ej: 12.5%)
    let roi = 0;
    if (monthData.investment > 0) {
      roi = (monthData.netProfit / monthData.investment) * 100;
    }

    breakdown.push({
      month: i + 1,
      investment: monthData.investment, // Ya viene redondeado
      profit: monthData.netProfit,      // Ya viene redondeado
      roiPercentage: parseFloat(roi.toFixed(2)) // Mantenemos decimales solo en ROI
    });
  }

  return {
    period: "Anual",
    year: now.getFullYear(),
    ...globalData, 
    breakdown: breakdown,
    totalNetProfit: globalData.netProfit
  };
};

/**
 * Ranking de Mejores Vendedores
 */
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