import pkg from '@prisma/client';
const { PrismaClient } = pkg;
 
const prisma = new PrismaClient();

export const resolvers = {
  Query: {
    systemConfiguration: () => prisma.system_configuration.findMany(),
    users: () =>
      prisma.users.findMany({
        include: { seller_products: true, sales: true },
      }),
    user: (_, { id_user }) =>
      prisma.users.findUnique({
        where: { id_user },
        include: { seller_products: true, sales: true },
      }),
    products: () =>
      prisma.products.findMany({
        include: { product_categories: true, sale_products: true, returns: true, seller_products: true },
      }),
    product: (_, { id_product }) =>
      prisma.products.findUnique({
        where: { id_product },
        include: { product_categories: true, sale_products: true, returns: true, seller_products: true },
      }),
    categories: () =>
      prisma.categories.findMany({
        include: { product_categories: true },
      }),
    sales: () =>
      prisma.sales.findMany({
        include: { sale_products: true, returns: true, seller: true },
      }),
    sale: (_, { id_sale }) =>
      prisma.sales.findUnique({
        where: { id_sale },
        include: { sale_products: true, returns: true, seller: true },
      }),
    returns: () =>
      prisma.returns.findMany({
        include: { product: true, sale: true },
      }),
    shipments: () => prisma.shipments.findMany(),
    sellerProducts: (_, { sellerId }) =>
      prisma.seller_products.findMany({
        where: { id_seller: sellerId },
        include: { seller: true, product: true },
      }),
  },

  Mutation: {
    createUser: (_, { input }) => prisma.users.create({ data: input }),

    createProduct: (_, { input }) => prisma.products.create({ data: input }),

    assignProductToSeller: async (_, { sellerId, productId, quantity }) => {
      // decrementa stock global y asigna al vendedor
      await prisma.products.update({
        where: { id_product: productId },
        data: { stock: { decrement: quantity } },
      });
      return prisma.seller_products.create({
        data: { id_seller: sellerId, id_product: productId, quantity },
        include: { seller: true, product: true },
      });
    },

    createSale: async (
      _,
      { sellerId, exchange_rate, total_cup, buyer_phone, payment_method, notes, items }
    ) => {
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

      // Crea items y descuenta del stock del vendedor si está asignado; si no, del stock global
      for (const { productId, quantity } of items) {
        await prisma.sale_products.create({
          data: { id_sale: sale.id_sale, id_product: productId, quantity },
        });

        const assigned = await prisma.seller_products.findFirst({
          where: { id_seller: sellerId, id_product: productId },
        });

        if (assigned) {
          await prisma.seller_products.update({
            where: { id_seller_product: assigned.id_seller_product },
            data: { quantity: { decrement: quantity } },
          });
        } else {
          await prisma.products.update({
            where: { id_product: productId },
            data: { stock: { decrement: quantity } },
          });
        }
      }

      return prisma.sales.findUnique({
        where: { id_sale: sale.id_sale },
        include: { sale_products: true, seller: true },
      });
    },

    createReturn: async (_, { saleId, productId, quantity, loss_usd, notes }) => {
      const ret = await prisma.returns.create({
        data: { id_sale: saleId, id_product: productId, quantity, loss_usd, notes },
        include: { product: true, sale: true },
      });

      // Opcional: reingresar stock al almacén global
      await prisma.products.update({
        where: { id_product: productId },
        data: { stock: { increment: quantity } },
      });

      return ret;
    },

    createShipment: (_, args) => prisma.shipments.create({ data: args }),

    updateSystemConfiguration: async (_, { id_config, input }) => {
      return prisma.system_configuration.update({
        where: { id_config },
        data: input,
      });
    },
  },

  // Resolvers de campos (por si prefieres resolver relaciones explícitas)
  Sale: {
    sale_products: (parent) =>
      prisma.sale_products.findMany({ where: { id_sale: parent.id_sale }, include: { product: true, sale: true } }),
    returns: (parent) =>
      prisma.returns.findMany({ where: { id_sale: parent.id_sale }, include: { product: true, sale: true } }),
    seller: (parent) =>
      prisma.users.findUnique({ where: { id_user: parent.id_seller } }),
  },
  SaleProduct: {
    product: (parent) =>
      prisma.products.findUnique({ where: { id_product: parent.id_product } }),
    sale: (parent) =>
      prisma.sales.findUnique({ where: { id_sale: parent.id_sale } }),
  },
  Return: {
    product: (parent) =>
      prisma.products.findUnique({ where: { id_product: parent.id_product } }),
    sale: (parent) =>
      prisma.sales.findUnique({ where: { id_sale: parent.id_sale } }),
  },
  SellerProduct: {
    seller: (parent) =>
      prisma.users.findUnique({ where: { id_user: parent.id_seller } }),
    product: (parent) =>
      prisma.products.findUnique({ where: { id_product: parent.id_product } }),
  },
  ProductCategory: {
    product: (parent) =>
      prisma.products.findUnique({ where: { id_product: parent.product.id_product } }),
    category: (parent) =>
      prisma.categories.findUnique({ where: { id_category: parent.category.id_category } }),
  },
};
