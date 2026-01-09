-- Crear base de datos con soporte de emojis
CREATE DATABASE habana_express_market
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE habana_express_market;

-- Tabla de configuración global
CREATE TABLE system_configuration (
  id_config INT AUTO_INCREMENT PRIMARY KEY,
  company_name VARCHAR(150) NOT NULL,
  logo_url VARCHAR(255),
  description TEXT,
  seller_commission_percentage DECIMAL(5,2) NOT NULL,
  weekly_report_day TINYINT,
  weekly_report_time TIME,
  monthly_report_day TINYINT,
  monthly_report_time TIME,
  annual_report_day TINYINT,
  annual_report_time TIME,
  default_exchange_rate DECIMAL(10,4) NOT NULL,
  telegram_bot_token VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT TRUE
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Tabla de usuarios (con rol storekeeper)
CREATE TABLE users (
  id_user INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE,
  photo_url VARCHAR(255),
  password_hash VARCHAR(255) NOT NULL,
  telegram_chat_id VARCHAR(50),
  role ENUM('admin','seller','storekeeper') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT TRUE
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Tabla de productos
CREATE TABLE products (
  id_product INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  purchase_price DECIMAL(10,2) NOT NULL,
  sale_price DECIMAL(10,2) NOT NULL,
  stock INT DEFAULT 0,
  sku VARCHAR(50),
  supplier_name VARCHAR(150),
  date_added TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT TRUE,
  photo_url VARCHAR(255),
  warranty BOOLEAN DEFAULT FALSE
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Tabla de categorías
CREATE TABLE categories (
  id_category INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  active BOOLEAN DEFAULT TRUE
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Tabla puente productos-categorías
CREATE TABLE product_categories (
  id_product_category INT AUTO_INCREMENT PRIMARY KEY,
  id_product INT NOT NULL,
  id_category INT NOT NULL,
  FOREIGN KEY (id_product) REFERENCES products(id_product),
  FOREIGN KEY (id_category) REFERENCES categories(id_category)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Tabla de ventas
CREATE TABLE sales (
  id_sale INT AUTO_INCREMENT PRIMARY KEY,
  sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  exchange_rate DECIMAL(10,4) NOT NULL,
  total_cup DECIMAL(12,2) NOT NULL,
  buyer_phone VARCHAR(20) NOT NULL,
  notes TEXT,
  payment_method ENUM('cash','transfer') NOT NULL,
  id_seller INT NOT NULL,
  FOREIGN KEY (id_seller) REFERENCES users(id_user)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Tabla puente ventas-productos
CREATE TABLE sale_products (
  id_sale_product INT AUTO_INCREMENT PRIMARY KEY,
  id_sale INT NOT NULL,
  id_product INT NOT NULL,
  quantity INT NOT NULL,
  FOREIGN KEY (id_sale) REFERENCES sales(id_sale),
  FOREIGN KEY (id_product) REFERENCES products(id_product)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Tabla de devoluciones
CREATE TABLE returns (
  id_return INT AUTO_INCREMENT PRIMARY KEY,
  id_sale INT NOT NULL,
  id_product INT NOT NULL,
  quantity INT NOT NULL,
  return_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  loss_usd DECIMAL(12,2) NOT NULL,
  notes TEXT,
  FOREIGN KEY (id_sale) REFERENCES sales(id_sale),
  FOREIGN KEY (id_product) REFERENCES products(id_product)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Tabla de envíos
CREATE TABLE shipments (
  id_shipment INT AUTO_INCREMENT PRIMARY KEY,
  agency_name VARCHAR(150) NOT NULL,
  shipment_date DATE NOT NULL,
  shipping_cost_usd DECIMAL(12,2) NOT NULL,
  customs_fee_cup DECIMAL(12,2) NOT NULL,
  exchange_rate DECIMAL(10,4) NOT NULL,
  notes TEXT
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Tabla puente vendedores-productos
CREATE TABLE seller_products (
  id_seller_product INT AUTO_INCREMENT PRIMARY KEY,
  id_seller INT NOT NULL,
  id_product INT NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_seller) REFERENCES users(id_user),
  FOREIGN KEY (id_product) REFERENCES products(id_product)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
