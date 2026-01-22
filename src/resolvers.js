// src/resolvers.js
import { PrismaClient } from '@prisma/client';
import { hashPassword, comparePassword, createToken } from './auth.js';
import { getMonthlyReport, getAnnualReport, calculateTopSellers } from './services/finance.js';
import { notifySale, notifyReturn, notifyStockDepletion } from './telegram.js';
import { executeDailyUpdate } from './services/scheduler.js'; 

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
  if (user.role === 'admin') return; 
  if (user.role !== 'storekeeper') {
    throw new Error('⛔ Access Denied: Storekeeper role required.');
  }
};

// 3. Seller or Admin (Admin is allowed)
const requireSeller = (user) => {
  requireAuth(user);
  if (user.role === 'admin') return; 
  if (user.role !== 'seller') {
    throw new Error('⛔ Access Denied: Seller role required.');
  }
};

/* 🚀 --- RESOLVERS --- 🚀 */

export const resolvers = {
  Query: {
    // --- USERS ---
    users: (_, __, { user }) => {
      requireStorekeeper(user); 
      return prisma.users.findMany({ include: { seller_products: true, sales: true } });
    },
    user: (_, { id_user }, { user }) => {
      requireAdmin(user);
      return prisma.users.findUnique({ where: { id_user }, include: { seller_products: true, sales: true } });
    },
    me: (_, __, { user }) => {
      requireAuth(user);
      return prisma.users.findUnique({ 
        where: { id_user: user.userId }
      });
    },

    // --- PRODUCTS ---
    products: (_, { active }, { user }) => {
      requireAuth(user);
      const isActiveFilter = active !== undefined ? active : true;
      return prisma.products.findMany({ 
        where: { active: isActiveFilter }, 
        include: { 
            product_categories: { include: { category: true } }, 
            sale_products: true, 
            seller_products: true 
        },
        orderBy: { date_added: 'desc' }
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
      return prisma.categories.findMany({ 
        where: { active: true },
        include: { product_categories: true } 
      });
    },

    // --- SALES & RETURNS ---
    sales: (_, __, { user }) => {
      requireStorekeeper(user); 
      return prisma.sales.findMany({ 
        include: { sale_products: { include: { product: true } }, seller: true },
        orderBy: { sale_date: 'desc' }
      });
    },
    
    sale: (_, { id_sale }, { user }) => {
      requireAuth(user); 
      return prisma.sales.findUnique({ where: { id_sale }, include: { sale_products: { include: { product: true } }, seller: true } });
    },
    returns: (_, __, { user }) => {
      requireStorekeeper(user); 
      return prisma.returns.findMany({ 
        include: { product: true, sale: true },
        orderBy: { return_date: 'desc' }
      });
    },

    // --- LOGISTICS & INVENTORY ---
    shipments: (_, __, { user }) => {
      requireStorekeeper(user);
      return prisma.shipments.findMany({ orderBy: { shipment_date: 'desc' } });
    },
    
    sellerProducts: (_, { sellerId }, { user }) => {
      requireAuth(user);
      let targetId = (user.role === 'admin' || user.role === 'storekeeper') ? sellerId : user.id_user;
      
      return prisma.seller_products.findMany({
        where: { id_seller: targetId },
        include: { seller: true, product: true },
      });
    },

    // --- DASHBOARD & REPORTS ---
   dashboardStats: async (_, __, { user }) => {
      requireAuth(user);
      
      const config = await prisma.system_configuration.findFirst();
      let activeProductsCount = 0;
      let totalItemsSold = 0;

      // LÓGICA DIFERENCIADA POR ROL
      if (user.role === 'seller') {
        // --- CASO VENDEDOR: SOLO SU MUNDO ---
        
        // 1. Stock: Cantidad de SKUs (productos distintos) que tiene asignados y con cantidad > 0
        activeProductsCount = await prisma.seller_products.count({
            where: { 
                id_seller: user.userId, // Usamos userId que viene del token (en el context es user.userId o user.id_user según tu auth.js, revisa eso. En tu código anterior era user.userId)
                quantity: { gt: 0 }     // Solo lo que tiene existencia real
            }
        });

        // 2. Ventas: Suma de cantidades vendidas SOLO por él
        const soldAggregation = await prisma.sale_products.aggregate({
            _sum: { quantity: true },
            where: { 
                sale: { 
                    id_seller: user.userId, // Solo sus ventas
                    status: 'COMPLETED'     // Solo ventas confirmadas
                } 
            }
        });
        totalItemsSold = soldAggregation._sum.quantity || 0;

      } else {
        // --- CASO ADMIN / STOREKEEPER: TODO EL SISTEMA ---
        
        // 1. Stock: Total de productos activos en el almacén global
        activeProductsCount = await prisma.products.count({
            where: { active: true }
        });

        // 2. Ventas: Suma de TODAS las ventas globales
        const soldAggregation = await prisma.sale_products.aggregate({
            _sum: { quantity: true },
            where: { sale: { status: 'COMPLETED' } }
        });
        totalItemsSold = soldAggregation._sum.quantity || 0;
      }

      return {
        exchangeRate: config?.default_exchange_rate || 0,
        activeProductsCount,
        totalItemsSold
      };
    },
    
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
      requireAuth(user);
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

    updateUser: async (_, { id_user, input }, { user }) => {
      requireAuth(user);
      if (user.role !== 'admin' && user.userId !== id_user) {
        throw new Error("⛔ Forbidden: You can only edit your own profile.");
      }

      const dataToUpdate = { ...input };
      if (user.role !== 'admin' && dataToUpdate.role) delete dataToUpdate.role; 
      if (dataToUpdate.password) {
        dataToUpdate.password_hash = await hashPassword(dataToUpdate.password);
        delete dataToUpdate.password; 
      } else {
        delete dataToUpdate.password;
      }

      return prisma.users.update({ where: { id_user }, data: dataToUpdate });
    },

    deleteUser: async (_, { id_user }, { user }) => {
      requireAdmin(user);
      return prisma.users.update({ where: { id_user }, data: { active: false } });
    },

    // --- CONFIGURATION ---
    updateSystemConfiguration: async (_, { id_config, input }, { user }) => {
      requireAdmin(user);
      return prisma.system_configuration.update({ where: { id_config }, data: input });
    },
    
    triggerPriceSync: async (_, __, { user }) => {
      try {
        await executeDailyUpdate(); 
        return true;
      } catch (e) {
        console.error(e);
        return false;
      }
    },

    // --- CATEGORIES ---
    createCategory: (_, { name }, { user }) => {
       requireStorekeeper(user);
       return prisma.categories.create({ data: { name } });
    },
    updateCategory: (_, { id_category, name }, { user }) => {
       requireStorekeeper(user);
       return prisma.categories.update({ where: { id_category }, data: { name } });
    },
    deleteCategory: async (_, { id_category }, { user }) => {
      requireStorekeeper(user);
      return prisma.categories.update({ where: { id_category }, data: { active: false } });
    },

    // --- PRODUCTS ---
    createProduct: (_, { input }, { user }) => {
      requireStorekeeper(user); 
      const { categoryIds, ...productData } = input;
      
      let finalSku = productData.sku;
      if (!finalSku) {
         const year = new Date().getFullYear();
         const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
         finalSku = `HEX-${year}-${randomSuffix}`;
      }

      const isActive = productData.stock > 0 ? true : (productData.active ?? false);

      return prisma.products.create({ 
          data: { 
              ...productData, 
              sku: finalSku, 
              active: isActive,
              product_categories: {
                create: categoryIds ? categoryIds.map(id => ({ category: { connect: { id_category: id } } })) : []
              }
          },
          include: { product_categories: { include: { category: true } } }
      });
    },

    updateProduct: async (_, { id_product, input }, { user }) => {
      requireStorekeeper(user); 
      const { categoryIds, ...dataToUpdate } = input;

      if (dataToUpdate.stock !== undefined) {
        if (dataToUpdate.stock > 0) dataToUpdate.active = true;
        else if (dataToUpdate.stock === 0) dataToUpdate.active = false;
      }

      return prisma.products.update({
        where: { id_product },
        data: {
            ...dataToUpdate,
            ...(categoryIds && {
                product_categories: {
                    deleteMany: {}, 
                    create: categoryIds.map(id => ({ category: { connect: { id_category: id } } }))
                }
            })
        },
        include: { product_categories: { include: { category: true } } }
      });
    },

    deleteProduct: async (_, { id_product }, { user }) => {
      requireStorekeeper(user); 
      return await prisma.products.delete({ where: { id_product } });
    },

    // --- INVENTORY ASSIGNMENT ---
    assignProductToSeller: async (_, { sellerId, productId, quantity }, { user }) => {
      requireStorekeeper(user); 
      
      const product = await prisma.products.findUnique({ where: { id_product: productId } });
      if (!product) throw new Error("Producto no encontrado");
      
      if (quantity > product.stock) {
          throw new Error(`⛔ Stock global insuficiente. Disponible: ${product.stock}`);
      }

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

    returnProductFromSeller: async (_, { sellerId, productId, quantity }, { user }) => {
      requireStorekeeper(user);
      const assignment = await prisma.seller_products.findFirst({ where: { id_seller: sellerId, id_product: productId } });
      if (!assignment || assignment.quantity < quantity) {
        throw new Error("⛔ El vendedor no tiene esa cantidad.");
      }

      if (assignment.quantity === quantity) {
         await prisma.seller_products.delete({ where: { id_seller_product: assignment.id_seller_product } });
         return { ...assignment, quantity: 0 }; 
      } else {
         return prisma.seller_products.update({
            where: { id_seller_product: assignment.id_seller_product },
            data: { quantity: { decrement: quantity } },
            include: { product: true }
         });
      }
    },

    // --- SALES ---
    createSale: async (_, { sellerId, exchange_rate, total_cup, buyer_phone, payment_method, notes, items }, { user }) => {
      // Seguridad: Un vendedor solo vende lo suyo, Admin vende por cualquiera
      if (user.role !== 'admin' && parseInt(user.userId) !== sellerId) {
           throw new Error('⛔ No puedes registrar ventas de otro usuario.');
      }

      // Validar Stock Asignado
      for (const item of items) {
        const product = await prisma.products.findUnique({ where: { id_product: item.productId } });
        if (!product) throw new Error(`Producto ${item.productId} no encontrado`);

        const assignment = await prisma.seller_products.findFirst({
            where: { id_seller: sellerId, id_product: item.productId }
        });

        if (!assignment || assignment.quantity < item.quantity) {
            throw new Error(`⛔ Stock insuficiente de: ${product.name}.`);
        }
      }

      // Crear Venta (Default Status: COMPLETED)
      const sale = await prisma.sales.create({
        data: { 
            id_seller: sellerId, 
            exchange_rate, 
            total_cup, 
            buyer_phone, 
            payment_method, 
            notes,
            status: 'COMPLETED'
        },
      });

      // Mover Inventario
      for (const { productId, quantity } of items) {
        await prisma.sale_products.create({
          data: { id_sale: sale.id_sale, id_product: productId, quantity },
        });

        // A. Restar Stock Global
        const updatedProduct = await prisma.products.update({
          where: { id_product: productId },
          data: { stock: { decrement: quantity } },
        });
        
        if (updatedProduct.stock <= 0) {
            await prisma.products.update({ where: { id_product: productId }, data: { active: false } });
         
            try { await notifyStockDepletion(updatedProduct); } catch (e) { console.error(e); }
          }

        // B. Restar Asignación del Vendedor
        const assignment = await prisma.seller_products.findFirst({ where: { id_seller: sellerId, id_product: productId } });
        if (assignment.quantity === quantity) {
            await prisma.seller_products.delete({ where: { id_seller_product: assignment.id_seller_product } });
        } else {
            await prisma.seller_products.update({
                where: { id_seller_product: assignment.id_seller_product },
                data: { quantity: { decrement: quantity } }
            });
        }
      }

      const saleResult = await prisma.sales.findUnique({
        where: { id_sale: sale.id_sale },
        include: { sale_products: { include: { product: true } }, seller: true },
      });

      try { await notifySale(saleResult); } catch (e) { console.error(e); }
      return saleResult;
    },

    updateSale: async (_, { id_sale, input }, { user }) => {
      requireAdmin(user);
      return prisma.sales.update({
        where: { id_sale },
        data: input,
        include: { seller: true }
      });
    },

    // 🔴 ANULAR VENTA (CANCEL) - Reemplaza lógica de borrado físico
    cancelSale: async (_, { id_sale }, { user }) => {
      requireAdmin(user);

      const sale = await prisma.sales.findUnique({
        where: { id_sale },
        include: { sale_products: true }
      });

      if (!sale) throw new Error("Venta no encontrada");
      if (sale.status === 'CANCELLED') throw new Error("La venta ya está anulada.");

      // Transacción: Cambiar estado y devolver stocks
      return await prisma.$transaction(async (tx) => {
          // 1. Marcar como CANCELLED
          const updatedSale = await tx.sales.update({
              where: { id_sale },
              data: { status: 'CANCELLED' }
          });

          // 2. Devolver items
          for (const item of sale.sale_products) {
              // A. Devolver al Global y Reactivar
              await tx.products.update({
                  where: { id_product: item.id_product },
                  data: { 
                      stock: { increment: item.quantity },
                      active: true 
                  }
              });

              // B. Devolver al Vendedor (Upsert manual para seguridad)
              const existingAssignment = await tx.seller_products.findFirst({
                  where: { id_seller: sale.id_seller, id_product: item.id_product }
              });

              if (existingAssignment) {
                  await tx.seller_products.update({
                      where: { id_seller_product: existingAssignment.id_seller_product },
                      data: { quantity: { increment: item.quantity } }
                  });
              } else {
                  await tx.seller_products.create({
                      data: {
                          id_seller: sale.id_seller,
                          id_product: item.id_product,
                          quantity: item.quantity
                      }
                  });
              }
          }
          return updatedSale;
      });
    },

    // --- RETURNS (DEVOLUCIONES) ---
    createReturn: async (_, { saleId, productId, quantity, reason, returnToStock }, { user }) => {
       // Solo Admin o Storekeeper
       if (user.role !== 'admin' && user.role !== 'storekeeper') {
          throw new Error("⛔ Access Denied.");
       }

       // 1. Validar Venta
       const sale = await prisma.sales.findUnique({ where: { id_sale: saleId } });
       if (!sale) throw new Error("Venta no encontrada");
       if (sale.status === 'CANCELLED') throw new Error("No se pueden hacer devoluciones de ventas anuladas.");

       // 2. Validar Item en la Venta
       const soldItem = await prisma.sale_products.findFirst({
          where: { id_sale: saleId, id_product: productId }
       });
       if (!soldItem || soldItem.quantity < quantity) {
          throw new Error("Cantidad inválida para esta venta.");
       }

       // 3. Obtener info del producto para costo
       const productInfo = await prisma.products.findUnique({ 
           where: { id_product: productId } 
       });

       let calculatedLoss = 0;
       if (!returnToStock) {
           calculatedLoss = Number(productInfo.purchase_price) * quantity;
       }

       // 4. Transacción en Base de Datos
       const resultReturn = await prisma.$transaction(async (tx) => {
           // A. Crear Registro Devolución
           const ret = await tx.returns.create({
             data: { 
                 id_sale: saleId, 
                 id_product: productId, 
                 quantity, 
                 loss_usd: calculatedLoss,
                 reason 
             },
             // 👇 CAMBIO IMPORTANTE: Incluimos al Vendedor (seller) dentro de la venta (sale)
             include: { 
                 product: true, 
                 sale: { 
                     include: { seller: true } 
                 } 
             }
           });

           // B. Si returnToStock es TRUE, devolvemos al Global
           if (returnToStock) {
               await tx.products.update({
                 where: { id_product: productId },
                 data: { 
                     stock: { increment: quantity },
                     active: true 
                 }
               });
           }

           return ret;
       });

       // 👇 NUEVO: Llamamos a la notificación pasando el booleano returnToStock
       try { 
           await notifyReturn(resultReturn, returnToStock); 
       } catch (e) { 
           console.error("Error enviando notificación Telegram:", e); 
       }

       return resultReturn;
    },

    // --- SHIPMENTS ---
    createShipment: (_, args, { user }) => { 
      requireAdmin(user); 
      return prisma.shipments.create({ data: args }); 
    },

    updateShipment: (_, { id_shipment, input }, { user }) => {
      requireAdmin(user);
      
      const dataToUpdate = {
        ...input,
        shipment_date: input.shipment_date ? new Date(input.shipment_date) : undefined,
        shipping_cost_usd: input.shipping_cost_usd ? parseFloat(input.shipping_cost_usd) : undefined,
        merchandise_cost_usd: input.merchandise_cost_usd ? parseFloat(input.merchandise_cost_usd) : undefined,
        customs_fee_cup: input.customs_fee_cup ? parseFloat(input.customs_fee_cup) : undefined,
        exchange_rate: input.exchange_rate ? parseFloat(input.exchange_rate) : undefined,
      };

      // Limpieza de undefined
      Object.keys(dataToUpdate).forEach(key => dataToUpdate[key] === undefined && delete dataToUpdate[key]);

      return prisma.shipments.update({ where: { id_shipment }, data: dataToUpdate });
    },

    deleteShipment: async (_, { id_shipment }, { user }) => { 
      requireAdmin(user); 
      return prisma.shipments.delete({ where: { id_shipment } }); 
    },
  },

  // Field Resolvers
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