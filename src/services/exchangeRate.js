import axios from "axios";

const API_URL = "https://www.cambiocup.com/api";

export const getDailyExchangeRate = async () => {
  try {
    console.log("🔄 Fetching Exchange Rate from API...");

    const { data } = await axios.get(API_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json"
      },
      timeout: 8000
    });

    // Validamos que exista la estructura esperada
    const latest = data.cupHistory?.[0]?.value;

    if (!latest) {
      throw new Error("API did not return valid data in cupHistory[0].value");
    }

    // 👇 CAMBIO AQUÍ: Usamos Math.ceil para forzar siempre hacia arriba
    // Regla: 441 -> 450, 449 -> 450, 450 -> 450
    const finalRate = Math.ceil(latest / 10) * 10;

    console.log(`✅ Tasa Original: ${latest} | 📈 Tasa Ajustada (Techo): ${finalRate}`);

    return finalRate;

  } catch (error) {
    console.error("❌ Error fetching exchange rate:", error.message);
    return null; // Retornamos null para manejar el error en el Cron Job
  }
};