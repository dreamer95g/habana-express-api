import { resolvers } from './src/resolvers.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 🎭 Mock del Contexto (Simulamos ser un Storekeeper autenticado)
const mockContext = {
  user: {
    id_user: 1, // Asumiendo que existe un usuario ID 1
    role: 'storekeeper',
    name: 'Tester Storekeeper'
  }
};

const runTest = async () => {
  console.log("🧪 STARTING TEST: Create Product Logic (Auto SKU & Active Status)\n");
  
  let productA_ID = null;
  let productB_ID = null;

  try {
    // -----------------------------------------------------------------------
    // CASO DE PRUEBA A: Producto con Stock (Debe ser ACTIVE: TRUE)
    // -----------------------------------------------------------------------
    console.log("👉 TEST CASE A: Creating Product with Stock (10 units)...");
    
    const inputA = {
      name: "Test Product - With Stock",
      description: "Testing automatic activation",
      purchase_price: 100.00,
      sale_price: 200.00,
      stock: 10, // Tiene stock -> Debería activarse
      // sku: NO ENVIAMOS SKU (El sistema debe generarlo)
    };

    // Llamamos al resolver directamente
    const resultA = await resolvers.Mutation.createProduct(null, { input: inputA }, mockContext);
    productA_ID = resultA.id_product;

    console.log(`✅ Created Product ID: ${resultA.id_product}`);
    console.log(`📦 Generated SKU: ${resultA.sku}`);
    console.log(`🟢 Active Status: ${resultA.active}`);

    // Validaciones
    if (!resultA.sku.startsWith("HEX-2026-")) {
        console.error("❌ FAIL: SKU format is incorrect.");
    } else if (resultA.active !== true) {
        console.error("❌ FAIL: Product should be ACTIVE because stock > 0.");
    } else {
        console.log("🌟 PASS: Case A is correct.");
    }

    console.log("\n------------------------------------------------------\n");

    // -----------------------------------------------------------------------
    // CASO DE PRUEBA B: Producto sin Stock (Debe ser ACTIVE: FALSE)
    // -----------------------------------------------------------------------
    console.log("👉 TEST CASE B: Creating Product with ZERO Stock...");
    
    const inputB = {
      name: "Test Product - Zero Stock",
      description: "Testing automatic deactivation",
      purchase_price: 50.00,
      sale_price: 100.00,
      stock: 0, // No tiene stock -> Debería nacer inactivo
    };

    const resultB = await resolvers.Mutation.createProduct(null, { input: inputB }, mockContext);
    productB_ID = resultB.id_product;

    console.log(`✅ Created Product ID: ${resultB.id_product}`);
    console.log(`📦 Generated SKU: ${resultB.sku}`);
    console.log(`🔴 Active Status: ${resultB.active}`);

    // Validaciones
    if (!resultB.sku.startsWith("HEX-2026-")) {
        console.error("❌ FAIL: SKU format is incorrect.");
    } else if (resultB.active !== false) {
        console.error("❌ FAIL: Product should be INACTIVE because stock is 0.");
    } else {
        console.log("🌟 PASS: Case B is correct.");
    }

  } catch (error) {
    console.error("❌ CRITICAL ERROR IN TEST:", error);
  } finally {
    // 🧹 Limpieza: Borramos los productos de prueba para no ensuciar la BD
    console.log("\n🧹 Cleaning up test data...");
    if (productA_ID) await prisma.products.delete({ where: { id_product: productA_ID } });
    if (productB_ID) await prisma.products.delete({ where: { id_product: productB_ID } });
    console.log("✅ Cleanup done.");
  }
};

runTest();