import { PrismaClient } from '@prisma/client';
import { hashPassword, comparePassword, createToken } from './auth.js';
import { getMonthlyReport, getAnnualReport, calculateTopSellers } from './services/finance.js';
import { notifySale, notifyReturn, notifyStockDepletion } from './telegram.js';

const prisma = new PrismaClient();

/* 🛡️ --- SECURITY GUARDS --- 🛡️ */

const requireAuth = (user) => {
  if (!user) throw new Error('⛔ Authorization required.');
};

// 1. Admin Only
const requireAdmin = (user) => {
  requireAuth(user);
  if (user.role !== 'admin') {
    throw new Error('⛔ Access Denied: Admin role required.');
  }
};

// 2. Storekeeper or Admin (Admin is allowed)
const requireStorekeeper = (user) => {
  requireAuth(user);
  if (user.role === 'admin') return; // ✅ Admin Bypass
  if (user.role !== 'storekeeper') {
    throw new Error('⛔ Access Denied: Storekeeper role required.');
  }
};

// 3. Seller or Admin (Admin is allowed)
const requireSeller = (user) => {
  requireAuth(user);
  if (user.role === 'admin') return; // ✅ Admin Bypass
  if (user.role !== 'seller') {
    throw new Error('⛔ Access Denied: Seller role required.');
  }
};

/* 🚀 --- RESOLVERS --- 🚀 */

export const resolvers = {
  Query: {
    // --- USERS ---
    users: (_, __, { user }) => {
      requireAdmin(user);
      return prisma.users.findMany({ include: { seller_products: true, sales: true } });
    },
    user: (_, { id_user }, { user }) => {
      requireAdmin(user);
      return prisma.users.findUnique({ where: { id_user }, include: { seller_products: true, sales: true } });
    },

    // --- PRODUCTS ---
    products: (_, __, { user }) => {
      requireAuth(user);
      // Todos los usuarios autenticados pueden ver productos activos
      return prisma.products.findMany({ 
        where: { active: true }, 
        include: { 
            product_categories: { include: { category: true } }, 
            sale_products: true, 
            seller_products: true 
        } 
      });
    },
    product: (_, { id_product }, { user }) => {
      requireAuth(user);
      return prisma.products.findUnique({ 
          where: { id_product }, 
          include: { 
              product_categories: { include: { category: true } }, 
              seller_products: true 
          } 
      });
    },

    // --- CATEGORIES ---
    categories: (_, __, { user }) => {
      requireAuth(user);
      return prisma.categories.findMany({ include: { product_categories: true } });
    },

    // --- SALES & RETURNS ---
    sales: (_, __, { user }) => {
      requireStorekeeper(user); // Admin también accede aquí por el Bypass
      return prisma.sales.findMany({ include: { sale_products: { include: { product: true } }, seller: true } });
    },
    sale: (_, { id_sale }, { user }) => {
      requireAuth(user); 
      // Permitimos acceso general autenticado, el frontend debe filtrar si es necesario
      return prisma.sales.findUnique({ where: { id_sale }, include: { sale_products: { include: { product: true } }, seller: true } });
    },
    returns: (_, __, { user }) => {
      requireStorekeeper(user); 
      return prisma.returns.findMany({ include: { product: true, sale: true } });
    },

    // --- LOGISTICS & INVENTORY ---
    shipments: (_, __, { user }) => {
      requireStorekeeper(user);
      return prisma.shipments.findMany();
    },
    sellerProducts: (_, { sellerId }, { user }) => {
      requireAuth(user);
      // Lógica: Si soy Admin/Storekeeper uso el ID solicitado. Si soy Seller, forzamos mi propio ID.
      let targetId = (user.role === 'admin' || user.role === 'storekeeper') ? sellerId : user.id_user;
      
      return prisma.seller_products.findMany({
        where: { id_seller: targetId },
        include: { seller: true, product: true },
      });
    },

    // --- CONFIG & REPORTS ---
    systemConfiguration: (_, __, { user }) => {
      requireAuth(user); 
      return prisma.system_configuration.findMany();
    },
    monthlyReport: async (_, __, { user }) => {
      requireAdmin(user);
      return await getMonthlyReport();
    },
    annualReport: async (_, __, { user }) => {
      requireAdmin(user);
      return await getAnnualReport();
    },
    topSellers: async (_, { period }, { user }) => {
      requireAuth(user); // Admin y Vendedores pueden ver el ranking
      return await calculateTopSellers(period);
    },
  },

  Mutation: {
    // --- AUTH ---
    login: async (_, { phone, password }) => {
      const user = await prisma.users.findUnique({ where: { phone } });
      if (!user) throw new Error('User not found');
      
      const valid = await comparePassword(password, user.password_hash);
      if (!valid) throw new Error('Invalid password');
      
      if (!user.active) throw new Error('Account is deactivated');
      
      return { token: createToken(user), user };
    },

    createUser: async (_, { input }, { user }) => {
      requireAdmin(user);
      const hashedPassword = await hashPassword(input.password_hash);
      return prisma.users.create({ data: { ...input, password_hash: hashedPassword } });
    },

    // --- CONFIGURATION ---
    updateSystemConfiguration: async (_, { id_config, input }, { user }) => {
      requireAdmin(user);
      return prisma.system_configuration.update({ where: { id_config }, data: input });
    },

    // --- PRODUCTS MANAGEMENT ---
    createCategory: (_, { name }, { user }) => {
       requireStorekeeper(user);
       return prisma.categories.create({ data: { name } });
    },

    createProduct: (_, { input }, { user }) => {
      requireStorekeeper(user); 
      
      const { categoryIds, ...productData } = input;
      
      // Auto SKU Generation
      let finalSku = productData.sku;
      if (!finalSku) {
         const year = new Date().getFullYear();
         const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
         finalSku = `HEX-${year}-${randomSuffix}`;
      }

      // Lógica: Si entra stock inicial > 0, se activa automáticamente
      const isActive = productData.stock > 0 ? true : (productData.active ?? false);

      return prisma.products.create({ 
          data: { 
              ...productData, 
              sku: finalSku, 
              active: isActive,
              product_categories: {
                create: categoryIds 
                  ? categoryIds.map(id => ({
                      category: { connect: { id_category: id } }
                    })) 
                  : []
              }
          },
          include: { 
            product_categories: { include: { category: true } } 
          }
      });
    },

    updateProduct: async (_, { id_product, input }, { user }) => {
      requireStorekeeper(user); 
      
      const { categoryIds, ...dataToUpdate } = input;

      // Lógica Reactiva de Stock
      if (dataToUpdate.stock !== undefined) {
        if (dataToUpdate.stock > 0) {
          dataToUpdate.active = true;
        } else if (dataToUpdate.stock === 0) {
           dataToUpdate.active = false;
        }
      }

      // Actualización con manejo de relaciones
      const prismaUpdateArgs = {
        where: { id_product },
        data: {
            ...dataToUpdate,
            ...(categoryIds && {
                product_categories: {
                    deleteMany: {}, // Borramos relaciones anteriores
                    create: categoryIds.map(id => ({
                        category: { connect: { id_category: id } }
                    }))
                }
            })
        },
        include: {
            product_categories: { include: { category: true } }
        }
      };

      return prisma.products.update(prismaUpdateArgs);
    },

    deleteProduct: async (_, { id_product }, { user }) => {
      requireStorekeeper(user); 
      try {
        return await prisma.products.delete({ where: { id_product } });
      } catch (error) {
        throw new Error("Cannot delete product with dependencies. Try deactivating it.");
      }
    },

    assignProductToSeller: async (_, { sellerId, productId, quantity }, { user }) => {
      requireStorekeeper(user); 
      // Verificamos si ya existe asignación
      const existing = await prisma.seller_products.findFirst({ where: { id_seller: sellerId, id_product: productId } });
      
      if (existing) {
        return prisma.seller_products.update({
          where: { id_seller_product: existing.id_seller_product },
          data: { quantity: { increment: quantity } },
          include: { seller: true, product: true }
        });
      } else {
        return prisma.seller_products.create({
          data: { id_seller: sellerId, id_product: productId, quantity },
          include: { seller: true, product: true },
        });
      }
    },

    // --- SALES LOGIC ---
    createSale: async (_, { sellerId, exchange_rate, total_cup, buyer_phone, payment_method, notes, items }, { user }) => {
      requireSeller(user); // Pasa Admin y Seller

      // Validación de Identidad: El Admin puede vender por cualquiera. El Seller solo por sí mismo.
      if (user.role !== 'admin') {
        if (user.id_user !== sellerId) {
           throw new Error('Forbidden: Cannot sell for another user.');
        }
      }

      // 1. Validación de Stock Global
      for (const item of items) {
        const product = await prisma.products.findUnique({ where: { id_product: item.productId } });
        if (!product) throw new Error(`Product ID ${item.productId} not found`);
        if (product.stock < item.quantity) {
          throw new Error(`Insufficient stock for: ${product.name}. Available: ${product.stock}`);
        }
      }

      // 2. Crear Cabecera de Venta
      const sale = await prisma.sales.create({
        data: { id_seller: sellerId, exchange_rate, total_cup, buyer_phone, payment_method, notes },
      });

      // 3. Procesar Items y Actualizar Inventario
      for (const { productId, quantity } of items) {
        await prisma.sale_products.create({
          data: { id_sale: sale.id_sale, id_product: productId, quantity },
        });

        // Decrementar Stock Global
        const updatedProduct = await prisma.products.update({
          where: { id_product: productId },
          data: { stock: { decrement: quantity } },
        });

        // ✨ Verificar Agotamiento (Depletion)
        if (updatedProduct.stock <= 0) {
          await prisma.products.update({
            where: { id_product: productId },
            data: { active: false }
          });
          // Notificación asíncrona a Telegram
          notifyStockDepletion(updatedProduct).catch(e => console.error(e));
        }

        // Decrementar Stock Asignado al Vendedor (Si existe)
        const assigned = await prisma.seller_products.findFirst({
          where: { id_seller: sellerId, id_product: productId },
        });
        if (assigned) {
          await prisma.seller_products.update({
            where: { id_seller_product: assigned.id_seller_product },
            data: { quantity: { decrement: quantity } },
          });
        }
      }

      // 4. Retornar Datos y Notificar
      const saleResult = await prisma.sales.findUnique({
        where: { id_sale: sale.id_sale },
        include: { sale_products: { include: { product: true } }, seller: true },
      });

      try {
         await notifySale(saleResult);
      } catch (e) {
        console.error("Telegram Error (Sale):", e.message); 
      }

      return saleResult;
    },

    // --- RETURNS LOGIC ---
    createReturn: async (_, args, { user }) => {
       requireStorekeeper(user); 
       const { saleId, productId, quantity, loss_usd, reason } = args;
       
       // Registrar Devolución
       const ret = await prisma.returns.create({
         data: { id_sale: saleId, id_product: productId, quantity, loss_usd, reason },
         include: { product: true, sale: true }
       });
       
       // Restaurar Stock Global
       const prod = await prisma.products.update({
         where: { id_product: productId },
         data: { stock: { increment: quantity } }
       });

       // Reactivar producto si estaba oculto
       if (!prod.active && prod.stock > 0) {
         await prisma.products.update({ where: { id_product: productId }, data: { active: true } });
       }

       // Notificar a Telegram
       try {
         await notifyReturn(ret);
       } catch (e) {
          console.error("Telegram Error (Return):", e.message);
       }

       return ret;
    },

    // --- LOGISTICS ---
    createShipment: (_, args, { user }) => { 
      requireAdmin(user); // Solo Admin puede gestionar costos de importación
      return prisma.shipments.create({ data: args }); 
    },
  },

  // Field Resolvers (Resolución de campos anidados)
  SaleProduct: { 
    product: (parent) => parent.product || prisma.products.findUnique({ where: { id_product: parent.id_product } }) 
  },
  Return: { 
    product: (parent) => parent.product || prisma.products.findUnique({ where: { id_product: parent.id_product } }), 
    sale: (parent) => parent.sale || prisma.sales.findUnique({ where: { id_sale: parent.id_sale } }) 
  },
  SellerProduct: { 
    product: (parent) => parent.product || prisma.products.findUnique({ where: { id_product: parent.id_product } }), 
    seller: (parent) => parent.seller || prisma.users.findUnique({ where: { id_user: parent.id_seller } }) 
  }
};