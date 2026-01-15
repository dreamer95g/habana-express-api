import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
  // Se calcula sobre el total de ventas brutas
  const totalCommissionsUSD = totalIncomeUSD * (commissionPct / 100);


  // Ganancia Operativa = Ingresos - (Inversión + Pérdidas + Comisiones)
  const operatingProfit = totalIncomeUSD - (totalInvestmentUSD + returnLossesUSD + totalCommissionsUSD);

  
  const netProfit = operatingProfit;

  return {
    income: totalIncomeUSD,
    investment: totalInvestmentUSD,
    returnLosses: returnLossesUSD,
    commissions: totalCommissionsUSD,
    netProfit: netProfit
  };
};

/**
 * Reporte Mensual (Objeto completo para Bot y API)
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
 * Reporte Anual (Objeto completo para Bot y API)
 */
export const getAnnualReport = async () => {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  
  // 1. Totales Globales (Para el reporte de texto)
  const globalData = await calculateProfitInPeriod(startOfYear, now);

  // 2. Desglose para Gráficos (Para la API)
  const breakdown = [];
  for (let i = 0; i < 12; i++) {
    const start = new Date(now.getFullYear(), i, 1);
    const end = new Date(now.getFullYear(), i + 1, 0, 23, 59, 59);
    if (start > now) break;

    const monthData = await calculateProfitInPeriod(start, end);
    
    // ROI simple para gráfico
    let roi = 0;
    if (monthData.investment > 0) {
      roi = (monthData.netProfit / monthData.investment) * 100;
    }

    breakdown.push({
      month: i + 1,
      investment: monthData.investment,
      profit: monthData.netProfit,
      roiPercentage: parseFloat(roi.toFixed(2))
    });
  }

  return {
    period: "Anual",
    year: now.getFullYear(),
    // Datos planos para el Bot
    ...globalData, 
    // Array para el Frontend
    breakdown: breakdown,
    totalNetProfit: globalData.netProfit // Compatibilidad con schema
  };
};