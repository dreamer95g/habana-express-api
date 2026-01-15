/*
Navicat MySQL Data Transfer

Source Server         : MySQL
Source Server Version : 50724
Source Host           : 127.0.0.1:3306
Source Database       : habana_express_store

Target Server Type    : MYSQL
Target Server Version : 50724
File Encoding         : 65001

Date: 2026-01-15 16:09:02
*/

SET FOREIGN_KEY_CHECKS=0;


-- --------------------------------------------------------
-- 📦 HABANA EXPRESS STORE - ESTRUCTURA FINAL 2026
-- --------------------------------------------------------

-- 1. Crear Base de Datos con soporte para Emojis
DROP DATABASE IF EXISTS habana_express_store;
CREATE DATABASE habana_express_store
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE habana_express_store;


-- ----------------------------
-- Table structure for categories
-- ----------------------------
DROP TABLE IF EXISTS `categories`;
CREATE TABLE `categories` (
  `id_category` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id_category`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for products
-- ----------------------------
DROP TABLE IF EXISTS `products`;
CREATE TABLE `products` (
  `id_product` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `purchase_price` decimal(10,2) NOT NULL,
  `sale_price` decimal(10,2) NOT NULL,
  `stock` int(11) NOT NULL DEFAULT '0',
  `sku` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `supplier_name` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `date_added` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `photo_url` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `warranty` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id_product`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for product_categories
-- ----------------------------
DROP TABLE IF EXISTS `product_categories`;
CREATE TABLE `product_categories` (
  `id_product_category` int(11) NOT NULL AUTO_INCREMENT,
  `id_product` int(11) NOT NULL,
  `id_category` int(11) NOT NULL,
  PRIMARY KEY (`id_product_category`),
  KEY `product_categories_id_category_fkey` (`id_category`),
  KEY `product_categories_id_product_fkey` (`id_product`),
  CONSTRAINT `product_categories_id_category_fkey` FOREIGN KEY (`id_category`) REFERENCES `categories` (`id_category`) ON UPDATE CASCADE,
  CONSTRAINT `product_categories_id_product_fkey` FOREIGN KEY (`id_product`) REFERENCES `products` (`id_product`) ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for returns
-- ----------------------------
DROP TABLE IF EXISTS `returns`;
CREATE TABLE `returns` (
  `id_return` int(11) NOT NULL AUTO_INCREMENT,
  `id_sale` int(11) NOT NULL,
  `id_product` int(11) NOT NULL,
  `quantity` int(11) NOT NULL,
  `return_date` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `loss_usd` decimal(12,2) NOT NULL,
  `reason` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id_return`),
  KEY `returns_id_product_fkey` (`id_product`),
  KEY `returns_id_sale_fkey` (`id_sale`),
  CONSTRAINT `returns_id_product_fkey` FOREIGN KEY (`id_product`) REFERENCES `products` (`id_product`) ON UPDATE CASCADE,
  CONSTRAINT `returns_id_sale_fkey` FOREIGN KEY (`id_sale`) REFERENCES `sales` (`id_sale`) ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for sales
-- ----------------------------
DROP TABLE IF EXISTS `sales`;
CREATE TABLE `sales` (
  `id_sale` int(11) NOT NULL AUTO_INCREMENT,
  `sale_date` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `exchange_rate` decimal(10,4) NOT NULL,
  `total_cup` decimal(12,2) NOT NULL,
  `buyer_phone` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `notes` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_method` enum('cash','transfer') COLLATE utf8mb4_unicode_ci NOT NULL,
  `id_seller` int(11) NOT NULL,
  PRIMARY KEY (`id_sale`),
  KEY `sales_id_seller_fkey` (`id_seller`),
  CONSTRAINT `sales_id_seller_fkey` FOREIGN KEY (`id_seller`) REFERENCES `users` (`id_user`) ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for sale_products
-- ----------------------------
DROP TABLE IF EXISTS `sale_products`;
CREATE TABLE `sale_products` (
  `id_sale_product` int(11) NOT NULL AUTO_INCREMENT,
  `id_sale` int(11) NOT NULL,
  `id_product` int(11) NOT NULL,
  `quantity` int(11) NOT NULL,
  PRIMARY KEY (`id_sale_product`),
  KEY `sale_products_id_product_fkey` (`id_product`),
  KEY `sale_products_id_sale_fkey` (`id_sale`),
  CONSTRAINT `sale_products_id_product_fkey` FOREIGN KEY (`id_product`) REFERENCES `products` (`id_product`) ON UPDATE CASCADE,
  CONSTRAINT `sale_products_id_sale_fkey` FOREIGN KEY (`id_sale`) REFERENCES `sales` (`id_sale`) ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for seller_products
-- ----------------------------
DROP TABLE IF EXISTS `seller_products`;
CREATE TABLE `seller_products` (
  `id_seller_product` int(11) NOT NULL AUTO_INCREMENT,
  `id_seller` int(11) NOT NULL,
  `id_product` int(11) NOT NULL,
  `quantity` int(11) NOT NULL DEFAULT '0',
  `assigned_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id_seller_product`),
  KEY `seller_products_id_product_fkey` (`id_product`),
  KEY `seller_products_id_seller_fkey` (`id_seller`),
  CONSTRAINT `seller_products_id_product_fkey` FOREIGN KEY (`id_product`) REFERENCES `products` (`id_product`) ON UPDATE CASCADE,
  CONSTRAINT `seller_products_id_seller_fkey` FOREIGN KEY (`id_seller`) REFERENCES `users` (`id_user`) ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for shipments
-- ----------------------------
DROP TABLE IF EXISTS `shipments`;
CREATE TABLE `shipments` (
  `id_shipment` int(11) NOT NULL AUTO_INCREMENT,
  `agency_name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `shipment_date` date NOT NULL,
  `shipping_cost_usd` decimal(12,2) NOT NULL,
  `merchandise_cost_usd` decimal(12,2) NOT NULL,
  `customs_fee_cup` decimal(12,2) NOT NULL,
  `exchange_rate` decimal(10,4) NOT NULL,
  `notes` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id_shipment`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for system_configuration
-- ----------------------------
DROP TABLE IF EXISTS `system_configuration`;
CREATE TABLE `system_configuration` (
  `id_config` int(11) NOT NULL AUTO_INCREMENT,
  `company_name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `company_phone` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `company_email` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `logo_url` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `seller_commission_percentage` decimal(5,2) NOT NULL,
  `monthly_report_day` int(11) DEFAULT NULL,
  `monthly_report_time` time DEFAULT NULL,
  `annual_report_day` int(11) DEFAULT NULL,
  `annual_report_time` time DEFAULT NULL,
  `default_exchange_rate` decimal(10,4) NOT NULL,
  `telegram_bot_token` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `exchange_rate_sync_time` time DEFAULT NULL,
  PRIMARY KEY (`id_config`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for users
-- ----------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id_user` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `photo_url` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `password_hash` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `telegram_chat_id` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `role` enum('admin','seller','storekeeper') COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `active` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id_user`),
  UNIQUE KEY `phone` (`phone`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
