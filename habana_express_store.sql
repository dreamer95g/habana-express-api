-- --------------------------------------------------------
-- 📦 HABANA EXPRESS STORE - ESTRUCTURA FINAL 2026
-- --------------------------------------------------------

-- 1. Crear Base de Datos con soporte para Emojis
DROP DATABASE IF EXISTS habana_express_store;
CREATE DATABASE habana_express_store
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE habana_express_store;

-- --------------------------------------------------------

-- 2. Tabla: Configuración del Sistema
-- Se eliminaron los campos de reporte semanal
CREATE TABLE system_configuration (
  id_config INT AUTO_INCREMENT PRIMARY KEY,
  company_name VARCHAR(191) NOT NULL,
  company_phone VARCHAR(191),
  company_email VARCHAR(191),
  logo_url VARCHAR(255),
  description TEXT,
  seller_commission_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  
  -- Reportes Automáticos (Mensual y Anual)
  monthly_report_day INT,
  monthly_report_time TIME,
  annual_report_day INT,
  annual_report_time TIME,
  
  default_exchange_rate DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
  telegram_bot_token VARCHAR(255) NOT NULL,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT TRUE
) ENGINE=InnoDB;

-- --------------------------------------------------------

-- 3. Tabla: Usuarios
-- Login principal ahora es por 'phone'
CREATE TABLE users (
  id_user INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  phone VARCHAR(191) NOT NULL UNIQUE, -- Login
  email VARCHAR(191),
  photo_url VARCHAR(255),
  password_hash VARCHAR(255) NOT NULL,
  telegram_chat_id VARCHAR(191),
  role ENUM('admin','seller','storekeeper') NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT TRUE
) ENGINE=InnoDB;

-- --------------------------------------------------------

-- 4. Tabla: Categorías
CREATE TABLE categories (
  id_category INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  active BOOLEAN DEFAULT TRUE
) ENGINE=InnoDB;

-- --------------------------------------------------------

-- 5. Tabla: Productos
CREATE TABLE products (
  id_product INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  description TEXT,
  purchase_price DECIMAL(10,2) NOT NULL,
  sale_price DECIMAL(10,2) NOT NULL,
  stock INT NOT NULL DEFAULT 0,
  sku VARCHAR(191),
  supplier_name VARCHAR(191),
  date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT TRUE,
  photo_url VARCHAR(255),
  warranty BOOLEAN DEFAULT FALSE
) ENGINE=InnoDB;

-- --------------------------------------------------------

-- 6. Tabla Puente: Productos - Categorías
CREATE TABLE product_categories (
  id_product_category INT AUTO_INCREMENT PRIMARY KEY,
  id_product INT NOT NULL,
  id_category INT NOT NULL,
  FOREIGN KEY (id_product) REFERENCES products(id_product) ON DELETE CASCADE,
  FOREIGN KEY (id_category) REFERENCES categories(id_category) ON DELETE CASCADE
) ENGINE=InnoDB;

-- --------------------------------------------------------

-- 7. Tabla: Envíos (Inversión)
-- Incluye el nuevo campo merchandise_cost_usd para calcular ROI
CREATE TABLE shipments (
  id_shipment INT AUTO_INCREMENT PRIMARY KEY,
  agency_name VARCHAR(191) NOT NULL,
  shipment_date DATE NOT NULL,
  shipping_cost_usd DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  merchandise_cost_usd DECIMAL(12,2) NOT NULL DEFAULT 0.00, -- ✨ Nuevo campo inversión
  customs_fee_cup DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  exchange_rate DECIMAL(10,4) NOT NULL DEFAULT 1.0000,
  notes TEXT
) ENGINE=InnoDB;

-- --------------------------------------------------------

-- 8. Tabla: Asignación Vendedor - Producto (Inventario descentralizado)
CREATE TABLE seller_products (
  id_seller_product INT AUTO_INCREMENT PRIMARY KEY,
  id_seller INT NOT NULL,
  id_product INT NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_seller) REFERENCES users(id_user) ON DELETE CASCADE,
  FOREIGN KEY (id_product) REFERENCES products(id_product) ON DELETE CASCADE
) ENGINE=InnoDB;

-- --------------------------------------------------------

-- 9. Tabla: Ventas
CREATE TABLE sales (
  id_sale INT AUTO_INCREMENT PRIMARY KEY,
  sale_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  exchange_rate DECIMAL(10,4) NOT NULL,
  total_cup DECIMAL(12,2) NOT NULL,
  buyer_phone VARCHAR(191) NOT NULL,
  notes TEXT,
  payment_method ENUM('cash','transfer') NOT NULL,
  id_seller INT NOT NULL,
  FOREIGN KEY (id_seller) REFERENCES users(id_user)
) ENGINE=InnoDB;

-- --------------------------------------------------------

-- 10. Tabla Puente: Detalle de Venta
CREATE TABLE sale_products (
  id_sale_product INT AUTO_INCREMENT PRIMARY KEY,
  id_sale INT NOT NULL,
  id_product INT NOT NULL,
  quantity INT NOT NULL,
  FOREIGN KEY (id_sale) REFERENCES sales(id_sale) ON DELETE CASCADE,
  FOREIGN KEY (id_product) REFERENCES products(id_product)
) ENGINE=InnoDB;

-- --------------------------------------------------------

-- 11. Tabla: Devoluciones
-- Se cambió 'notes' por 'reason'
CREATE TABLE returns (
  id_return INT AUTO_INCREMENT PRIMARY KEY,
  id_sale INT NOT NULL,
  id_product INT NOT NULL,
  quantity INT NOT NULL,
  return_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  loss_usd DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  reason TEXT, -- ✨ Campo renombrado
  FOREIGN KEY (id_sale) REFERENCES sales(id_sale),
  FOREIGN KEY (id_product) REFERENCES products(id_product)
) ENGINE=InnoDB;