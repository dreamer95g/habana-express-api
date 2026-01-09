import { gql } from "apollo-server-express";

export const typeDefs = gql`
  enum Role {
    admin
    seller
    storekeeper
  }

  enum PaymentMethod {
    cash
    transfer
  }

  type SystemConfiguration {
    id_config: Int!
    company_name: String!
    logo_url: String
    description: String
    seller_commission_percentage: Float!
    weekly_report_day: Int
    weekly_report_time: String
    monthly_report_day: Int
    monthly_report_time: String
    annual_report_day: Int
    annual_report_time: String
    default_exchange_rate: Float!
    telegram_bot_token: String!
    created_at: String
    active: Boolean
  }

  type User {
    id_user: Int!
    name: String!
    email: String
    photo_url: String
    telegram_chat_id: String
    role: Role!
    created_at: String
    active: Boolean
    sales: [Sale]
    seller_products: [SellerProduct]
  }

  type Category {
    id_category: Int!
    name: String!
    active: Boolean
    product_categories: [ProductCategory]
  }

  type Mutation {
    createCategory(name: String!): Category 
  }

  type Product {
    id_product: Int!
    name: String!
    description: String
    purchase_price: Float!
    sale_price: Float!
    stock: Int
    sku: String
    supplier_name: String
    date_added: String
    active: Boolean
    photo_url: String
    warranty: Boolean
    product_categories: [ProductCategory]
    sale_products: [SaleProduct]
    returns: [Return]
    seller_products: [SellerProduct]
  }

  type ProductCategory {
    id_product_category: Int!
    product: Product!
    category: Category!
  }

  type Sale {
    id_sale: Int!
    sale_date: String
    exchange_rate: Float!
    total_cup: Float!
    buyer_phone: String!
    notes: String
    payment_method: PaymentMethod!
    seller: User!
    sale_products: [SaleProduct]
    returns: [Return]
  }

  type SaleProduct {
    id_sale_product: Int!
    quantity: Int!
    sale: Sale!
    product: Product!
  }

  type Return {
    id_return: Int!
    quantity: Int!
    return_date: String
    loss_usd: Float!
    notes: String
    product: Product!
    sale: Sale!
  }

  type Shipment {
    id_shipment: Int!
    agency_name: String!
    shipment_date: String!
    shipping_cost_usd: Float!
    customs_fee_cup: Float!
    exchange_rate: Float!
    notes: String
  }

  type SellerProduct {
    id_seller_product: Int!
    quantity: Int!
    assigned_at: String
    seller: User!
    product: Product!
  }

  input CreateUserInput {
    name: String!
    email: String
    photo_url: String
    password_hash: String!
    telegram_chat_id: String
    role: Role!
  }

  input CreateProductInput {
    name: String!
    description: String
    purchase_price: Float!
    sale_price: Float!
    stock: Int
    sku: String
    supplier_name: String
    photo_url: String
    warranty: Boolean
    active: Boolean
  }

  input UpdateSystemConfigurationInput {
    company_name: String
    logo_url: String
    description: String
    seller_commission_percentage: Float
    weekly_report_day: Int
    weekly_report_time: String
    monthly_report_day: Int
    monthly_report_time: String
    annual_report_day: Int
    annual_report_time: String
    default_exchange_rate: Float
    telegram_bot_token: String
    active: Boolean
  }

  type Query {
    systemConfiguration: [SystemConfiguration]
    users: [User]
    user(id_user: Int!): User
    products: [Product]
    product(id_product: Int!): Product
    categories: [Category]
    sales: [Sale]
    sale(id_sale: Int!): Sale
    returns: [Return]
    shipments: [Shipment]
    sellerProducts(sellerId: Int!): [SellerProduct]
  }

  type Mutation {
    createUser(input: CreateUserInput!): User
    createProduct(input: CreateProductInput!): Product
    assignProductToSeller(sellerId: Int!, productId: Int!, quantity: Int!): SellerProduct
    createSale(
      sellerId: Int!,
      exchange_rate: Float!,
      total_cup: Float!,
      buyer_phone: String!,
      payment_method: PaymentMethod!,
      notes: String,
      items: [SaleItemInput!]!
    ): Sale
    createReturn(saleId: Int!, productId: Int!, quantity: Int!, loss_usd: Float!, notes: String): Return
    createShipment(
      agency_name: String!,
      shipment_date: String!,
      shipping_cost_usd: Float!,
      customs_fee_cup: Float!,
      exchange_rate: Float!,
      notes: String
    ): Shipment
    updateSystemConfiguration(id_config: Int!, input: UpdateSystemConfigurationInput!): SystemConfiguration
  }

  input SaleItemInput {
    productId: Int!
    quantity: Int!
  }
`;
