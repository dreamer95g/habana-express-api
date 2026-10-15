// src/services/exchangeRate.js
import axios from "axios";

const CAMBIOCUP_API_URL = "https://www.cambiocup.com/api";

let cachedRates = null;
let lastFetchTime = 0;

export const getElToqueRates = async () => {
  const now = Date.now();
  if (cachedRates && now - lastFetchTime < 5 * 60 * 1000) {
    return cachedRates;
  }

  let usdt = 0;

  try {
    const { data } = await axios.get(CAMBIOCUP_API_URL, { timeout: 7000 });
    const rates = data?.rates || data;
    
    usdt = Number(
      rates?.USDT?.value || 
      rates?.USDT_TRC20?.value || 
      rates?.usdt || 
      data?.usdtHistory?.[0]?.value || 
      data?.cryptoHistory?.[0]?.value || 
      0
    );

    // Respaldo estructural de Cambiocup
    if (!usdt && data?.cupHistory?.[0]?.value) {
      usdt = Number(data.cupHistory[0].value);
    }
  } catch (err) {
    console.warn("Fallo API Cambiocup:", err.message);
  }

  usdt = Math.round(Number(usdt) || 0);

  console.log(`🔍 [TASA USDT EXTRAÍDA] USDT: ${usdt}`);

  cachedRates = { usdt };
  lastFetchTime = now;
  
  return cachedRates;
};

export const getDailyExchangeRate = async () => {
  const rates = await getElToqueRates();
  
  if (!rates || !rates.usdt || rates.usdt === 0) return null;
  
  return Math.ceil(rates.usdt / 10) * 10;
};