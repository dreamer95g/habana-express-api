import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const resolvers = {
  Query: {
    systemConfiguration: () => prisma.system_configuration.findMany(),
    users: () => prisma.users.findMany({ include: { seller_products: true, sales: true } }),
    user: (_, { id_user }) => prisma.users.findUnique({ where: { id_user }, include: { seller_products: true, sales: true } }),
    products: () => prisma.products.findMany({
      include: { product_categories: { include: { category: true } }, sale_products: true, returns: true, seller_products: true },
    }),
    product: (_, { id_product }) => prisma.products.findUnique({
      where: { id_product },
      include: { product_categories: { include: { category: true } }, sale_products: true, returns: true, seller_products: true },
    }),
    categories: () => prisma.categories.findMany({ include: { product_categories: true } }),
    sales: () => prisma.sales.findMany({
      include: { sale_products: { include: { product: true } }, returns: true, seller: true },
    }),
    sale: (_, { id_sale }) => prisma.sales.findUnique({
      where: { id_sale },
      include: { sale_products: { include: { product: true } }, returns: { include: { product: true } }, seller: true },
    }),
    returns: () => prisma.returns.findMany({ include: { product: true, sale: true } }),
    shipments: () => prisma.shipments.findMany(),
    sellerProducts: (_, { sellerId }) => prisma.seller_products.findMany({
      where: { id_seller: sellerId },
      include: { seller: true, product: true },
    }),
  },

  Mutation: {
    createUser: (_, { input }) => prisma.users.create({ data: input }),
    createProduct: (_, { input }) => prisma.products.create({ data: input }),

    // --- CAMBIO REGLA DE NEGOCIO: ASIGNACIÓN ---
    assignProductToSeller: async (_, { sellerId, productId, quantity }) => {
      // 1. ELIMINADO: Ya NO restamos del stock global aquí.
      // El producto sigue siendo de la empresa, solo cambia de manos (custodia).
      
      // 2. Asignar al vendedor (crear o sumar a su inventario personal)
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

    // --- CAMBIO REGLA DE NEGOCIO: VENTA ---
    createSale: async (
      _,
      { sellerId, exchange_rate, total_cup, buyer_phone, payment_method, notes, items }
    ) => {
      // 1. Crear la venta
      const sale = await prisma.sales.create({
        data: {
          id_seller: sellerId,
          exchange_rate,
          total_cup,
          buyer_phone,
          payment_method,
          notes,
        },
      });

      // 2. Procesar productos
      for (const { productId, quantity } of items) {
        // A. Registrar item de venta
        await prisma.sale_products.create({
          data: { id_sale: sale.id_sale, id_product: productId, quantity },
        });

        // B. SIEMPRE restar del Stock Global (Products) porque el item se vendió y salió de la empresa
        await prisma.products.update({
          where: { id_product: productId },
          data: { stock: { decrement: quantity } },
        });

        // C. Si el vendedor tenía stock asignado, restarlo de SU inventario también
        const assigned = await prisma.seller_products.findFirst({
          where: { id_seller: sellerId, id_product: productId },
        });

        if (assigned) {
          // Si tiene asignación, restamos. 
          // (Nota: Podrías validar aquí si assigned.quantity >= quantity para evitar negativos)
          await prisma.seller_products.update({
            where: { id_seller_product: assigned.id_seller_product },
            data: { quantity: { decrement: quantity } },
          });
        }
      }

      return prisma.sales.findUnique({
        where: { id_sale: sale.id_sale },
        include: { 
          sale_products: { include: { product: true } }, 
          seller: true 
        },
      });
    },

    createReturn: async (_, { saleId, productId, quantity, loss_usd, notes }) => {
      const ret = await prisma.returns.create({
        data: { id_sale: saleId, id_product: productId, quantity, loss_usd, notes },
        include: { product: true, sale: true },
      });

      // Devolver stock al almacén global
      await prisma.products.update({
        where: { id_product: productId },
        data: { stock: { increment: quantity } },
      });

      return ret;
    },

    createShipment: (_, args) => prisma.shipments.create({ data: args }),
    updateSystemConfiguration: async (_, { id_config, input }) => {
      return prisma.system_configuration.update({ where: { id_config }, data: input });
    },
    createCategory: (_, { name }) => prisma.categories.create({ data: { name } }),
  },

  // Field Resolvers
  SaleProduct: {
    product: (parent) => parent.product || prisma.products.findUnique({ where: { id_product: parent.id_product } }),
  },
  Return: {
    product: (parent) => parent.product || prisma.products.findUnique({ where: { id_product: parent.id_product } }),
    sale: (parent) => parent.sale || prisma.sales.findUnique({ where: { id_sale: parent.id_sale } }),
  },
  SellerProduct: {
    product: (parent) => parent.product || prisma.products.findUnique({ where: { id_product: parent.id_product } }),
    seller: (parent) => parent.seller || prisma.users.findUnique({ where: { id_user: parent.id_seller } }),
  }
};