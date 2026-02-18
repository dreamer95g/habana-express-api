// src/resolvers.js
import { PrismaClient } from '@prisma/client';
import { hashPassword, comparePassword, createToken } from './auth.js';
import { getMonthlyReport, getAnnualReport, calculateTopSellers } from './services/finance.js';
import { notifySale, notifyReturn, notifyStockDepletion } from './telegram.js';
import { executeDailyUpdate } from './services/scheduler.js'; 

const prisma = new PrismaClient();

/* 🛡️ --- SECURITY GUARDS --- 🛡️ */

const requireAuth = (user) => {
  if (!user) throw new Error(' Autorización requerida');
};

// 1. Admin Only
const requireAdmin = (user) => {
  requireAuth(user);
  if (user.role !== 'admin') {
    throw new Error(' Acceso denegado: se requiere rol de Admin');
  }
};

// 2. Storekeeper or Admin (Admin is allowed)
const requireStorekeeper = (user) => {
  requireAuth(user);
  if (user.role === 'admin') return; 
  if (user.role !== 'storekeeper') {
    throw new Error(' Acceso denegado: se requiere rol de Storekeeper');
  }
};

// 3. Seller or Admin (Admin is allowed)
const requireSeller = (user) => {
  requireAuth(user);
  if (user.role === 'admin') return; 
  if (user.role !== 'seller') {
    throw new Error(' Acceso denegado: se requiere rol de Seller ');
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

     catalogData: async () => {
      // 1. Obtener productos activos QUE TENGAN STOCK EN MANOS DE VENDEDORES
      const products = await prisma.products.findMany({
        where: { 
          active: true, 
          seller_products: {
            some: {
              quantity: { gt: 0 }
            }
          }
        },
        // 👇 AGREGA ESTO AQUÍ: Necesitamos las categorías para filtrar en el front
        include: {
            product_categories: {
                include: { category: true }
            }
        },
        orderBy: { date_added: 'desc' }
      });

      // 2. Obtener configuración (sin cambios)
      const config = await prisma.system_configuration.findFirst();

      return {
        products,
        companyPhone: config?.company_phone || ''
      };
    },

    // --- CATEGORIES ---
    categories: (_, __, { user }) => {
      // requireAuth(user);
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
    
    sellerProducts: async (_, { sellerId }, { user }) => {
  requireAuth(user);

  // 1. Determinar el ID del vendedor a consultar
  // Si es admin/storekeeper, usa el sellerId que viene por argumento.
  // Si es un vendedor, OBLIGATORIAMENTE usa SU ID que viene en el token (userId).
  const targetId = (user.role === 'admin' || user.role === 'storekeeper') 
    ? parseInt(sellerId) 
    : parseInt(user.userId); // <--- CAMBIO CLAVE: usar userId

  if (!targetId) {
    throw new Error("ID de vendedor no proporcionado o inválido.");
  }

  return prisma.seller_products.findMany({
    where: { 
      id_seller: targetId 
    },
    include: { 
      seller: true, 
      product: true 
    },
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
    activeProductsCount = await prisma.seller_products.count({
        where: { 
            id_seller: parseInt(user.userId), // <--- Asegúrate que diga userId
            quantity: { gt: 0 }
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
      if (!user) throw new Error('Usuario no encontrado');
      
      const valid = await comparePassword(password, user.password_hash);
      if (!valid) throw new Error('Contraseña incorrecta');
      
      if (!user.active) throw new Error('La cuenta está desactivada');
      
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
        throw new Error(" Prohibido: solo puedes editar tu propio perfil");
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
      // Usamos una transacción para asegurarnos de que ambas cosas pasen o ninguna
  return await prisma.$transaction(async (tx) => {
    // 1. Borramos todos los vínculos de productos con esta categoría
    // Esto hace que los productos que la tenían simplemente se queden sin ella
    await tx.product_categories.deleteMany({
      where: { id_category: id_category }
    });

    // 2. Marcamos la categoría como inactiva
    return await tx.categories.update({
      where: { id_category },
      data: { active: false }
    });
  });
      
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

  // 1. Calcular cuánto tienen asignado TODOS los vendedores actualmente
  const totalAssigned = await prisma.seller_products.aggregate({
    _sum: { quantity: true },
    where: { id_product: productId }
  });

  const assignedCount = totalAssigned._sum.quantity || 0;
  
  // 2. Calcular la disponibilidad real en el almacén (físico)
  // Stock Global - Lo que ya está en la calle
  const availableInWarehouse = Number(product.stock) - assignedCount;

  // 3. VALIDACIÓN:
  if (quantity > availableInWarehouse) {
      throw new Error(`No hay suficiente mercancía en el estante. Disponible en almacén: ${availableInWarehouse}`);
  }

  // Si pasa la validación, procedemos con la asignación normal
  const existing = await prisma.seller_products.findFirst({ 
    where: { id_seller: sellerId, id_product: productId } 
  });
  
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
        throw new Error(" El vendedor no tiene esa cantidad.");
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
           throw new Error(' No puedes registrar ventas de otro usuario.');
      }

      // Validar Stock Asignado
      for (const item of items) {
        const product = await prisma.products.findUnique({ where: { id_product: item.productId } });
        if (!product) throw new Error(`Producto ${item.productId} no encontrado`);

        const assignment = await prisma.seller_products.findFirst({
            where: { id_seller: sellerId, id_product: item.productId }
        });

        if (!assignment || assignment.quantity < item.quantity) {
            throw new Error(` Stock insuficiente de: ${product.name}.`);
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
  if (user.role !== 'admin' && user.role !== 'storekeeper') {
    throw new Error("Acceso denegado.");
  }

  return await prisma.$transaction(async (tx) => {
    // 1. Obtener la venta con sus productos
    const sale = await tx.sales.findUnique({
      where: { id_sale: saleId },
      include: { sale_products: true, seller: true }
    });

    if (!sale) throw new Error("Venta no encontrada");
    if (sale.status === 'CANCELLED') throw new Error("La venta ya está anulada.");

    // 2. Obtener el producto específico de esa venta
    const soldItem = await tx.sale_products.findFirst({
      where: { id_sale: saleId, id_product: productId }
    });

    if (!soldItem || soldItem.quantity < quantity) {
      throw new Error("La cantidad a devolver supera lo vendido.");
    }

    // 3. Obtener info del producto (para saber su precio de venta actual)
    const productInfo = await tx.products.findUnique({ where: { id_product: productId } });

    // CALCULO FINANCIERO:
    // ¿Cuánto dinero representa esta devolución en CUP? 
    // Usamos el precio de venta actual del producto (que ya está en CUP)
    const refundAmountCUP = Number(productInfo.sale_price) * quantity;
    const lossUSD = !returnToStock ? (Number(productInfo.purchase_price) * quantity) : 0;

    // 4. CREAR EL REGISTRO DE DEVOLUCIÓN
    const ret = await tx.returns.create({
      data: {
        id_sale: saleId,
        id_product: productId,
        quantity,
        loss_usd: lossUSD,
        reason
      },
      include: { product: true, sale: { include: { seller: true } } }
    });

    // 5. ACTUALIZAR STOCK GLOBAL (Si el admin lo marcó como útil)
    if (returnToStock) {
      await tx.products.update({
        where: { id_product: productId },
        data: { stock: { increment: quantity }, active: true }
      });
    }

    // 6. ACTUALIZAR LA VENTA (RESTAR EL PRODUCTO)
    // A. Restamos cantidad del listado de la venta
    if (soldItem.quantity === quantity) {
      // Si devolvió todo el stock de este producto, borramos la relación
      await tx.sale_products.delete({ where: { id_sale_product: soldItem.id_sale_product } });
    } else {
      // Si fue una devolución parcial, restamos la cantidad
      await tx.sale_products.update({
        where: { id_sale_product: soldItem.id_sale_product },
        data: { quantity: { decrement: quantity } }
      });
    }

    // B. Restar el dinero del total de la venta
    const newTotalCUP = Number(sale.total_cup) - refundAmountCUP;

    // 7. ¿QUEDAN MÁS PRODUCTOS EN LA VENTA?
    const remainingItems = await tx.sale_products.count({ where: { id_sale: saleId } });

    if (remainingItems === 0 || newTotalCUP <= 0) {
      // Si ya no queda nada, marcamos la venta como CANCELADA
      await tx.sales.update({
        where: { id_sale: saleId },
        data: { total_cup: 0, status: 'CANCELLED' }
      });
    } else {
      // Si aún quedan otros productos, solo actualizamos el total
      await tx.sales.update({
        where: { id_sale: saleId },
        data: { total_cup: newTotalCUP }
      });
    }

    return ret;
  });
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
  },

   Product: {
    // Esto busca automáticamente quién tiene este producto en stock personal
    active_sellers_phones: async (parent) => {
      const sellersWithStock = await prisma.seller_products.findMany({
        where: {
          id_product: parent.id_product,
          quantity: { gt: 0 } // Solo si tienen más de 0
        },
        include: { seller: true }
      });
      
      // Devolvemos solo un array de teléfonos: ["555555", "533333"]
      return sellersWithStock.map(s => s.seller.phone);
    }
  }
};