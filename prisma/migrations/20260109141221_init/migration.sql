-- CreateTable
CREATE TABLE `system_configuration` (
    `id_config` INTEGER NOT NULL AUTO_INCREMENT,
    `company_name` VARCHAR(191) NOT NULL,
    `logo_url` VARCHAR(191) NULL,
    `description` VARCHAR(191) NULL,
    `seller_commission_percentage` DOUBLE NOT NULL,
    `weekly_report_day` INTEGER NULL,
    `weekly_report_time` DATETIME(3) NULL,
    `monthly_report_day` INTEGER NULL,
    `monthly_report_time` DATETIME(3) NULL,
    `annual_report_day` INTEGER NULL,
    `annual_report_time` DATETIME(3) NULL,
    `default_exchange_rate` DOUBLE NOT NULL,
    `telegram_bot_token` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `active` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`id_config`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id_user` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `photo_url` VARCHAR(191) NULL,
    `password_hash` VARCHAR(191) NOT NULL,
    `telegram_chat_id` VARCHAR(191) NULL,
    `role` ENUM('admin', 'seller', 'storekeeper') NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id_user`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
    `id_product` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `purchase_price` DOUBLE NOT NULL,
    `sale_price` DOUBLE NOT NULL,
    `stock` INTEGER NOT NULL DEFAULT 0,
    `sku` VARCHAR(191) NULL,
    `supplier_name` VARCHAR(191) NULL,
    `date_added` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `active` BOOLEAN NOT NULL DEFAULT true,
    `photo_url` VARCHAR(191) NULL,
    `warranty` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`id_product`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categories` (
    `id_category` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`id_category`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_categories` (
    `id_product_category` INTEGER NOT NULL AUTO_INCREMENT,
    `id_product` INTEGER NOT NULL,
    `id_category` INTEGER NOT NULL,

    PRIMARY KEY (`id_product_category`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sales` (
    `id_sale` INTEGER NOT NULL AUTO_INCREMENT,
    `sale_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `exchange_rate` DOUBLE NOT NULL,
    `total_cup` DOUBLE NOT NULL,
    `buyer_phone` VARCHAR(191) NOT NULL,
    `notes` VARCHAR(191) NULL,
    `payment_method` ENUM('cash', 'transfer') NOT NULL,
    `id_seller` INTEGER NOT NULL,

    PRIMARY KEY (`id_sale`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sale_products` (
    `id_sale_product` INTEGER NOT NULL AUTO_INCREMENT,
    `id_sale` INTEGER NOT NULL,
    `id_product` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL,

    PRIMARY KEY (`id_sale_product`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `returns` (
    `id_return` INTEGER NOT NULL AUTO_INCREMENT,
    `id_sale` INTEGER NOT NULL,
    `id_product` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL,
    `return_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `loss_usd` DOUBLE NOT NULL,
    `notes` VARCHAR(191) NULL,

    PRIMARY KEY (`id_return`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shipments` (
    `id_shipment` INTEGER NOT NULL AUTO_INCREMENT,
    `agency_name` VARCHAR(191) NOT NULL,
    `shipment_date` DATETIME(3) NOT NULL,
    `shipping_cost_usd` DOUBLE NOT NULL,
    `customs_fee_cup` DOUBLE NOT NULL,
    `exchange_rate` DOUBLE NOT NULL,
    `notes` VARCHAR(191) NULL,

    PRIMARY KEY (`id_shipment`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `seller_products` (
    `id_seller_product` INTEGER NOT NULL AUTO_INCREMENT,
    `id_seller` INTEGER NOT NULL,
    `id_product` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 0,
    `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id_seller_product`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `product_categories` ADD CONSTRAINT `product_categories_id_product_fkey` FOREIGN KEY (`id_product`) REFERENCES `products`(`id_product`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_categories` ADD CONSTRAINT `product_categories_id_category_fkey` FOREIGN KEY (`id_category`) REFERENCES `categories`(`id_category`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales` ADD CONSTRAINT `sales_id_seller_fkey` FOREIGN KEY (`id_seller`) REFERENCES `users`(`id_user`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_products` ADD CONSTRAINT `sale_products_id_sale_fkey` FOREIGN KEY (`id_sale`) REFERENCES `sales`(`id_sale`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_products` ADD CONSTRAINT `sale_products_id_product_fkey` FOREIGN KEY (`id_product`) REFERENCES `products`(`id_product`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `returns` ADD CONSTRAINT `returns_id_sale_fkey` FOREIGN KEY (`id_sale`) REFERENCES `sales`(`id_sale`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `returns` ADD CONSTRAINT `returns_id_product_fkey` FOREIGN KEY (`id_product`) REFERENCES `products`(`id_product`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `seller_products` ADD CONSTRAINT `seller_products_id_seller_fkey` FOREIGN KEY (`id_seller`) REFERENCES `users`(`id_user`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `seller_products` ADD CONSTRAINT `seller_products_id_product_fkey` FOREIGN KEY (`id_product`) REFERENCES `products`(`id_product`) ON DELETE RESTRICT ON UPDATE CASCADE;
