import { getDailyExchangeRate } from './src/services/exchangeRate.js';

const probar = async () => {
    console.log("⏳ Probando conexión con API...");
    const tasa = await getDailyExchangeRate();
    console.log("Resultado final en el test:", tasa);
};

probar();