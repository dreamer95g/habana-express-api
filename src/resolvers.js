import { PrismaClient } from '@prisma/client';
import { hashPassword, comparePassword, createToken } from './auth.js';

const prisma = new PrismaClient();

/* 🛡️ --- SECURITY GUARDS (MIDDLEWARES) --- 🛡️ */

const requireAuth = (user) => {
  if (!user) throw new Error('⛔ Authorization required. Please log in.');
};

const requireAdmin = (user) => {
  requireAuth(user);
  if (user.role !== 'admin') {
    throw new Error('⛔ Access Denied: Admin role required.');
  }
};

const requireStorekeeper = (user) => {
  requireAuth(user);
  if (user.role !== 'admin' && user.role !== 'storekeeper') {
    throw new Error('⛔ Access Denied: Storekeeper or Admin role required.');
  }
};

const requireSeller = (user) => {
  requireAuth(user);
  if (user.role !== 'admin' && user.role !== 'seller') {
    throw new Error('⛔ Access Denied: Seller or Admin role required.');
  }
};

/* 🚀 --- RESOLVERS --- 🚀 */

export const resolvers = {
  Query: {
    // PUBLIC
    
    // 🔒 AHORA PROTEGIDO: Solo usuarios logueados pueden ver la lista
    products: (_, __, { user }) => {
      requireAuth(user); // <--- ESTO ES LO QUE BLOQUEA A LOS NO LOGUEADOS
      
      return prisma.products.findMany({ 
        where: { active: true }, // Seguimos mostrando solo los activos
        include: { 
          product_categories: { include: { category: true } }, 
          sale_products: true, 
          seller_products: true 
        } 
      });
    },
    
    // 🔒 AHORA PROTEGIDO: Ver detalle de un producto
    product: (_, { id_product }, { user }) => {
      requireAuth(user); // <--- BLOQUEO
      
      return prisma.products.findUnique({ 
        where: { id_product }, 
        include: { 
          product_categories: { include: { category: true } }, 
          seller_products: true 
        } 
      });
    },
    
    // 🔒 AHORA PROTEGIDO: Ver categorías
    categories: (_, __, { user }) => {
      requireAuth(user); // <--- BLOQUEO
      return prisma.categories.findMany({ include: { product_categories: true } });
    },



    // ADMIN ONLY
    users: (_, __, { user }) => {
      requireAdmin(user);
      return prisma.users.findMany({ include: { seller_products: true, sales: true } });
    },
    
    user: (_, { id_user }, { user }) => {
      requireAdmin(user);
      return prisma.users.findUnique({ where: { id_user }, include: { seller_products: true, sales: true } });
    },

    // ADMIN & STOREKEEPER
    sales: (_, __, { user }) => {
      requireStorekeeper(user); 
      return prisma.sales.findMany({ include: { sale_products: { include: { product: true } }, seller: true } });
    },
    
    returns: (_, __, { user }) => {
      requireStorekeeper(user);
      return prisma.returns.findMany({ include: { product: true, sale: true } });
    },
    
    shipments: (_, __, { user }) => {
      requireStorekeeper(user);
      return prisma.shipments.findMany();
    },

    // AUTH REQUIRED
    systemConfiguration: (_, __, { user }) => {
      requireAuth(user); 
      return prisma.system_configuration.findMany();
    },
    
    sale: (_, { id_sale }, { user }) => {
      requireAuth(user); 
      return prisma.sales.findUnique({ where: { id_sale }, include: { sale_products: { include: { product: true } }, seller: true } });
    },

    // LOGIC FOR SELLERS (View own stock)
    sellerProducts: (_, { sellerId }, { user }) => {
      requireAuth(user);
      
      let targetId = sellerId;
      // If I am a seller, I can ONLY see my own products
      if (user.role === 'seller') {
        targetId = user.id_user; 
      }

      return prisma.seller_products.findMany({
        where: { id_seller: targetId },
        include: { seller: true, product: true },
      });
    },
  },

  Mutation: {
    // PUBLIC
    login: async (_, { email, password }) => {
      const user = await prisma.users.findUnique({ where: { email } });
      if (!user) throw new Error('User not found');
      
      const valid = await comparePassword(password, user.password_hash);
      if (!valid) throw new Error('Invalid password');
      
      if (!user.active) throw new Error('User account is deactivated');
      
      const token = createToken(user);
      return { token, user };
    },

    // ADMIN ONLY
    createUser: async (_, { input }, { user }) => {
      requireAdmin(user);
      const hashedPassword = await hashPassword(input.password_hash);
      return prisma.users.create({
        data: { ...input, password_hash: hashedPassword },
      });
    },

    updateSystemConfiguration: async (_, { id_config, input }, { user }) => {
      requireAdmin(user);
      return prisma.system_configuration.update({ where: { id_config }, data: input });
    },
    
    createShipment: (_, args, { user }) => { 
      requireAdmin(user); 
      return prisma.shipments.create({ data: args }); 
    },

    // STOREKEEPER & ADMIN (Inventory Management)
    createCategory: (_, { name }, { user }) => {
       requireStorekeeper(user);
       return prisma.categories.create({ data: { name } });
    },

    createProduct: (_, { input }, { user }) => {
      requireStorekeeper(user);
      return prisma.products.create({ data: input });
    },

    updateProduct: (_, { id_product, input }, { user }) => {
      requireStorekeeper(user);
      return prisma.products.update({
        where: { id_product },
        data: input
      });
    },

    deleteProduct: async (_, { id_product }, { user }) => {
      requireStorekeeper(user);
      try {
        return await prisma.products.delete({ where: { id_product } });
      } catch (error) {
        throw new Error("Cannot delete: Product has associated sales or assignments. Deactivate it instead.");
      }
    },

    assignProductToSeller: async (_, { sellerId, productId, quantity }, { user }) => {
      requireStorekeeper(user);
      
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

    // SELLERS & ADMIN
    createSale: async (_, { sellerId, exchange_rate, total_cup, buyer_phone, payment_method, notes, items }, { user }) => {
      requireSeller(user);
      
      if (user.role === 'seller' && user.id_user !== sellerId) {
        throw new Error('⛔ Action Forbidden: You cannot register sales for another seller.');
      }

      const sale = await prisma.sales.create({
        data: { id_seller: sellerId, exchange_rate, total_cup, buyer_phone, payment_method, notes },
      });

      for (const { productId, quantity } of items) {
        await prisma.sale_products.create({
          data: { id_sale: sale.id_sale, id_product: productId, quantity },
        });

        await prisma.products.update({
          where: { id_product: productId },
          data: { stock: { decrement: quantity } },
        });

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

      // Telegram Logic would go here...

      return prisma.sales.findUnique({
        where: { id_sale: sale.id_sale },
        include: { sale_products: { include: { product: true } }, seller: true },
      });
    },

    createReturn: async (_, args, { user }) => {

       //requireSeller(user);
      //   requireStorekeeper(user);
      //  const { saleId, productId, quantity, loss_usd, notes } = args;
      //  const ret = await prisma.returns.create({ data: { id_sale: saleId, id_product: productId, quantity, loss_usd, notes }, include: { product: true, sale: true } });
      //  await prisma.products.update({ where: { id_product: productId }, data: { stock: { increment: quantity } } });
      //  return ret;
//requireSeller(user);
        requireStorekeeper(user); 
       
       const { saleId, productId, quantity, loss_usd, notes } = args;
       
       // 1. Crear el registro de devolución
       const ret = await prisma.returns.create({
         data: { id_sale: saleId, id_product: productId, quantity, loss_usd, notes },
         include: { product: true, sale: true }
       });

       // 2. Regresar el stock al Almacén Global (Responsabilidad del Storekeeper)
       await prisma.products.update({
         where: { id_product: productId },
         data: { stock: { increment: quantity } }
       });

       return ret;

    },
  },

  // Field Resolvers
  SaleProduct: { product: (parent) => parent.product || prisma.products.findUnique({ where: { id_product: parent.id_product } }) },
  Return: { product: (parent) => parent.product || prisma.products.findUnique({ where: { id_product: parent.id_product } }), sale: (parent) => parent.sale || prisma.sales.findUnique({ where: { id_sale: parent.id_sale } }) },
  SellerProduct: { product: (parent) => parent.product || prisma.products.findUnique({ where: { id_product: parent.id_product } }), seller: (parent) => parent.seller || prisma.users.findUnique({ where: { id_user: parent.id_seller } }) }
};