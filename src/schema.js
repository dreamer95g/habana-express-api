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
    company_phone: String
    company_email: String
    logo_url: String
    description: String
    seller_commission_percentage: Float!
    
    # --- REPORTES Y TIEMPOS ---
    monthly_report_day: Int
    monthly_report_time: String
    annual_report_day: Int
    annual_report_time: String
    
    # ✅ NUEVO CAMPO AGREGADO
    exchange_rate_sync_time: String
    
    default_exchange_rate: Float!
    telegram_bot_token: String!
    created_at: String
    active: Boolean
  }

  type User {
    id_user: Int!
    name: String!
    phone: String!
    email: String
    photo_url: String
    telegram_chat_id: String
    role: Role!
    created_at: String
    active: Boolean
    sales: [Sale]
    seller_products: [SellerProduct]
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  type Category {
    id_category: Int!
    name: String!
    active: Boolean
    product_categories: [ProductCategory]
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
    reason: String
    product: Product!
    sale: Sale!
  }

  type Shipment {
    id_shipment: Int!
    agency_name: String!
    shipment_date: String!
    shipping_cost_usd: Float!
    merchandise_cost_usd: Float! 
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

  type TopSeller {
    id_user: Int!
    name: String!
    photo_url: String
    total_sales_usd: Float!
    items_sold: Int!
  }

  # --- REPORT TYPES ---
  
  type MonthlyReport {
    month: Int!
    year: Int!
    income: Float!
    expenses: Float!
    netProfit: Float!
  }

  type AnnualReport {
    year: Int!
    totalNetProfit: Float!
    breakdown: [MonthlyBreakdown]
  }

  type MonthlyBreakdown {
    month: Int!
    investment: Float!      
    profit: Float!          
    roiPercentage: Float!   
  }

  # --- INPUTS ---

  input CreateUserInput {
    name: String!
    phone: String!
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
    categoryIds: [Int] 
  }

  input UpdateProductInput {
    name: String
    description: String
    purchase_price: Float
    sale_price: Float
    stock: Int
    sku: String
    supplier_name: String
    photo_url: String
    warranty: Boolean
    active: Boolean
    categoryIds: [Int]
  }

  input UpdateSystemConfigurationInput {
    company_name: String
    company_phone: String
    company_email: String
    logo_url: String
    description: String
    seller_commission_percentage: Float
    
    # --- REPORTES Y TIEMPOS ---
    monthly_report_day: Int
    monthly_report_time: String
    annual_report_day: Int
    annual_report_time: String
    
    # ✅ NUEVO CAMPO AGREGADO EN INPUT TAMBIÉN
    exchange_rate_sync_time: String
    
    default_exchange_rate: Float
    telegram_bot_token: String
    active: Boolean
  }

  input SaleItemInput {
    productId: Int!
    quantity: Int!
  }

  # --- QUERY & MUTATION ---

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
    monthlyReport: MonthlyReport
    annualReport: AnnualReport
    topSellers(period: String!): [TopSeller]
  }

  type Mutation {
    login(phone: String!, password: String!): AuthPayload
    
    createUser(input: CreateUserInput!): User
    createCategory(name: String!): Category 
    createProduct(input: CreateProductInput!): Product
    updateProduct(id_product: Int!, input: UpdateProductInput!): Product
    deleteProduct(id_product: Int!): Product
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
    
    createReturn(saleId: Int!, productId: Int!, quantity: Int!, loss_usd: Float!, reason: String): Return
    
    createShipment(
      agency_name: String!,
      shipment_date: String!,
      shipping_cost_usd: Float!,
      merchandise_cost_usd: Float!,
      customs_fee_cup: Float!,
      exchange_rate: Float!,
      notes: String
    ): Shipment
    
    updateSystemConfiguration(id_config: Int!, input: UpdateSystemConfigurationInput!): SystemConfiguration
  }
`;