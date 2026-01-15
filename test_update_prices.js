import { executeDailyUpdate } from './src/services/scheduler.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const runTest = async () => {
    console.log("🧪 STARTING MANUAL TEST: Price Update Logic\n");

    // 1. Ver estado ANTES de la actualización
    const productBefore = await prisma.products.findFirst({ where: { active: true } });
    const configBefore = await prisma.system_configuration.findFirst();

    if (!productBefore) {
        console.error("❌ No active products found in DB to test.");
        return;
    }

    console.log("--- BEFORE UPDATE ---");
    console.log(`💵 Current System Rate: ${configBefore.default_exchange_rate}`);
    console.log(`📦 Product: ${productBefore.name}`);
    console.log(`💰 Cost (USD): $${productBefore.purchase_price}`);
    console.log(`🏷️ Current Sale Price (CUP): $${productBefore.sale_price}`);
    console.log("---------------------\n");

    // 2. EJECUTAR LA LÓGICA (Simulando las 8 AM)
    await executeDailyUpdate();

    console.log("\n---------------------");
    
    // 3. Ver estado DESPUÉS de la actualización
    const productAfter = await prisma.products.findUnique({ where: { id_product: productBefore.id_product } });
    const configAfter = await prisma.system_configuration.findFirst();

    console.log("--- AFTER UPDATE ---");
    console.log(`💵 New System Rate: ${configAfter.default_exchange_rate}`);
    console.log(`📦 Product: ${productAfter.name}`);
    console.log(`🏷️ New Sale Price (CUP): $${productAfter.sale_price}`);
    
    // Verificación manual de la fórmula
    const expectedPrice = Number(productAfter.purchase_price) * 2 * Number(configAfter.default_exchange_rate);
    console.log(`🧮 Calculated Check (Cost * 2 * Rate): ${expectedPrice}`);
    
    if (Math.abs(Number(productAfter.sale_price) - expectedPrice) < 0.1) {
        console.log("✅ TEST PASSED: Math is correct.");
    } else {
        console.log("❌ TEST FAILED: Math discrepancy.");
    }
    console.log("---------------------");
};

runTest();