import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Helper: Redondeo estándar a entero (sin decimales)
// Ej: 10.4 -> 10, 10.5 -> 11
const roundInt = (val) => Math.round(Number(val));

/**
 * Lógica central de cálculo financiero
 */
// src/services/finance.js

const calculateProfitInPeriod = async (startDate, endDate) => {
  const config = await prisma.system_configuration.findFirst();
  const commissionPct = config ? Number(config.seller_commission_percentage) : 0;

  // 1. Obtener Envíos (Inversión Total del mes)
  const shipments = await prisma.shipments.findMany({
    where: { shipment_date: { gte: startDate, lte: endDate } },
  });

  // 2. Obtener Ventas (Ingreso Total del mes)
  const sales = await prisma.sales.findMany({
    where: { 
      sale_date: { gte: startDate, lte: endDate },
      status: 'COMPLETED' 
    }
  });

  // 3. Obtener Devoluciones (Pérdidas del mes)
  const returns = await prisma.returns.findMany({
    where: { return_date: { gte: startDate, lte: endDate } },
  });

  // --- CÁLCULO DE INVERSIÓN ---
  let totalInvestmentUSD = 0;
  shipments.forEach(ship => {
    const shipping = Number(ship.shipping_cost_usd);
    const merch = Number(ship.merchandise_cost_usd);
    const customsCup = Number(ship.customs_fee_cup);
    const rate = Number(ship.exchange_rate);
    const customsUsd = rate > 0 ? customsCup / rate : 0;
    
    totalInvestmentUSD += (shipping + merch + customsUsd);
  });

  // --- CÁLCULO DE GANANCIA ---
  let totalSalesUSD = 0;
  sales.forEach(sale => {
    const rate = Number(sale.exchange_rate);
    const totalCup = Number(sale.total_cup);
    totalSalesUSD += (rate > 0 ? totalCup / rate : 0);
  });

  const totalCommissionsUSD = totalSalesUSD * (commissionPct / 100);
  
  let returnLossesUSD = 0;
  returns.forEach(ret => {
    returnLossesUSD += Number(ret.loss_usd);
  });

  // GANANCIA = Ventas - Comisiones - Devoluciones
  const gain = totalSalesUSD - totalCommissionsUSD - returnLossesUSD;

  return {
    income: roundInt(totalSalesUSD),
    investment: roundInt(totalInvestmentUSD), // Flete + Mercancía + Aduana
    profit: gain > 0 ? roundInt(gain) : 0,    // Ventas - Comisiones - Devoluciones (Nunca negativo)
    netProfit: roundInt(totalSalesUSD - totalInvestmentUSD) // Flujo de caja neto para reporte
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
  
  const globalData = await calculateProfitInPeriod(startOfYear, now);

  const breakdown = [];
  for (let i = 0; i < 12; i++) {
    const start = new Date(now.getFullYear(), i, 1);
    const end = new Date(now.getFullYear(), i + 1, 0, 23, 59, 59);
    if (start > now) break;

    const monthData = await calculateProfitInPeriod(start, end);
    
    // --- NUEVA LÓGICA DE ROI POSITIVO ---
    // ROI = (Ganancia de Ventas / Inversión de Envíos) * 100
    let roi = 0;
    if (monthData.investment > 0) {
      roi = (monthData.profit / monthData.investment) * 100;
    } else if (monthData.profit > 0) {
      // Si hubo ventas pero no hubo inversión ese mes, el retorno es 100% o más
      roi = 100; 
    }

    breakdown.push({
      month: i + 1,
      investment: monthData.investment,
      profit: monthData.profit, // Esta ya viene limpia (Ventas - Comisiones - Devoluciones)
      roiPercentage: Math.max(0, parseFloat(roi.toFixed(2))) // Nunca menor a 0
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