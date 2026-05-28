import mongoose from "mongoose";
import { sendBadRequestResponse, sendErrorResponse, sendNotFoundResponse, sendSuccessResponse } from "../utils/Response.utils.js";
import CategoryModel from "../model/category.model.js";
import productModel from "../model/product.model.js";
import variantModel from "../model/variant.model.js";
import stockModel from "../model/stock.model.js";
import sellerModel from "../model/seller.model.js";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "../utils/aws.config.js";
import { getCurrencyRate, convertPrice } from "../utils/currency.utils.js";

const formatProductWithVariants = (product, rate, currency) => {
    const p = product.toObject();
    if (p.variants) {
        p.variants = p.variants.map(v => {
            v.price = convertPrice(v.price, rate);
            v.originalPrice = convertPrice(v.originalPrice, rate);
            v.currency = currency;
            v.stock = v.stock ? v.stock.quantity : 0;
            return v;
        });
    }
    const firstVariant = p.variants?.[0] || null;
    p.price = firstVariant ? firstVariant.price : null;
    p.originalPrice = firstVariant ? firstVariant.originalPrice : null;
    p.discount = firstVariant ? firstVariant.discount : 0;
    p.productImage = firstVariant ? firstVariant.variantImage : null;
    p.gImage = firstVariant ? firstVariant.gImage : [];
    p.currency = currency;
    return p;
};

export const newProductController = async (req, res) => {
    try {
        const { id } = req?.user;
        if (!id && !mongoose.Types.ObjectId.isValid(id)) {
            return sendBadRequestResponse(res, "Seller Id is required to request");
        }

        const {
            categoryId,
            productName,
            productDesc,
            productHealthBenefit,
            productStorage
        } = req.body;

        if (!categoryId || !mongoose.Types.ObjectId.isValid(categoryId)) {
            return sendBadRequestResponse(res, "Invalid or missing categoryId");
        }

        const categoryExists = await CategoryModel.findById(categoryId);
        if (!categoryExists) return sendBadRequestResponse(res, "Category not found");

        if (!productName?.trim()) return sendBadRequestResponse(res, "Product name is required");

        const duplicateProduct = await productModel.findOne({
            productName: productName.trim(),
            category: categoryId,
            sellerId: id
        });

        if (duplicateProduct) {
            return res.status(409).json({
                success: false,
                message: "Duplicate product exists with the same name and category"
            });
        }

        const newProduct = await productModel.create({
            productName: productName.trim(),
            category: categoryId,
            sellerId: id,
            productDesc: productDesc || "",
            productHealthBenefit: productHealthBenefit || "",
            productStorage: productStorage || "",
            soldCount: 0
        });

        await sellerModel.findByIdAndUpdate(
            { _id: id },
            { $push: { products: newProduct._id } },
            { new: true }
        );

        return res.status(201).json({
            success: true,
            message: "Product created successfully",
            product: newProduct
        });

    } catch (error) {
        console.error("Error while inserting new product:", error);
        return res.status(500).json({
            success: false,
            message: "Error while inserting new product",
            error: error.message
        });
    }
};

export const getAllProductsController = async (req, res) => {
    try {
        const products = await productModel.find({})
            .populate("category")
            .populate({ path: "variants", populate: { path: "stock" } });

        if (!products) {
            return sendNotFoundResponse(res, "Not Product Found!");
        }

        const { rate, currency } = getCurrencyRate(req?.user);
        const formatted = products.map(p => formatProductWithVariants(p, rate, currency));

        return sendSuccessResponse(res, "All product Fetched Successfully", {
            total: formatted.length,
            products: formatted
        });
    } catch (error) {
        console.log("Error during Fetching All Products");
        return sendErrorResponse(res, 500, "Error During Fetching All products", error);
    }
};

export const updateProductController = async (req, res) => {
    try {
        const { productId } = req.params;
        const { id: sellerId } = req.user;

        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return sendBadRequestResponse(res, "Invalid Product ID");
        }

        const product = await productModel.findById(productId);
        if (!product) {
            return sendErrorResponse(res, 404, "Product not found");
        }

        if (product.sellerId.toString() !== sellerId.toString()) {
            return sendErrorResponse(res, 403, "You are not authorized to update this product");
        }

        const {
            categoryId,
            productName,
            productDesc,
            productHealthBenefit,
            productStorage
        } = req.body;

        if (categoryId) {
            if (!mongoose.Types.ObjectId.isValid(categoryId)) {
                return sendBadRequestResponse(res, "Invalid categoryId");
            }
            const categoryExists = await CategoryModel.findById(categoryId);
            if (!categoryExists) {
                return sendBadRequestResponse(res, "Category not found");
            }
            product.category = categoryId;
        }

        if (productName) product.productName = productName.trim();
        if (productDesc !== undefined) product.productDesc = productDesc;
        if (productHealthBenefit !== undefined) product.productHealthBenefit = productHealthBenefit;
        if (productStorage !== undefined) product.productStorage = productStorage;

        await product.save();

        const updatedProduct = await productModel.findById(productId)
            .populate("category")
            .populate({ path: "variants", populate: { path: "stock" } });

        const { rate, currency } = getCurrencyRate(req?.user);

        return sendSuccessResponse(res, "Product updated successfully", formatProductWithVariants(updatedProduct, rate, currency));

    } catch (error) {
        console.error("Update Product Error:", error.message);
        return sendErrorResponse(res, 500, "Error while updating product", error.message);
    }
};

export const deleteProductController = async (req, res) => {
    try {
        const { id } = req.params; 
        const { id: sellerId } = req.user;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return sendBadRequestResponse(res, "Invalid Product ID");
        }

        const product = await productModel.findById(id);
        if (!product) {
            return sendErrorResponse(res, 404, "Product not found");
        }

        if (product.sellerId.toString() !== sellerId.toString()) {
            return sendErrorResponse(res, 403, "You are not authorized to delete this product");
        }

        const variants = await variantModel.find({ productId: id });
        for (const variant of variants) {
            if (variant.variantImageKey) {
                try {
                    await s3.send(new DeleteObjectCommand({
                        Bucket: process.env.S3_BUCKET_NAME,
                        Key: variant.variantImageKey
                    }));
                } catch (err) {
                    console.error("Failed to delete variant image:", err.message);
                }
            }

            if (variant.gImage && variant.gImage.length > 0) {
                for (const img of variant.gImage) {
                    if (img.gImageKey) {
                        try {
                            await s3.send(new DeleteObjectCommand({
                                Bucket: process.env.S3_BUCKET_NAME,
                                Key: img.gImageKey
                            }));
                        } catch (err) {
                            console.error("Failed to delete gallery image:", err.message);
                        }
                    }
                }
            }

            await variant.deleteOne();
            await stockModel.deleteOne({ variantId: variant._id });
        }

        await product.deleteOne();

        await sellerModel.findByIdAndUpdate(
            sellerId,
            { $pull: { products: product._id } },
            { new: true }
        );

        return sendSuccessResponse(res, "Product and variants deleted successfully");
    } catch (error) {
        console.error("Delete Product Error:", error.message);
        return sendErrorResponse(res, 500, "Error while deleting product", error.message);
    }
};

export const getProductByCategoryController = async (req, res) => {
    try {
        const { categoryId } = req?.params;

        if (!categoryId || !mongoose.Types.ObjectId.isValid(categoryId)) {
            return sendBadRequestResponse(res, "Category ID is required!");
        }

        let products = await productModel.find({ category: categoryId })
            .populate({ path: "variants", populate: { path: "stock" } });

        if (!products || products.length === 0) {
            return sendSuccessResponse(res, "No products found", { total: 0, products: [] });
        }

        const { rate, currency } = getCurrencyRate(req?.user);
        const formatted = products.map(p => formatProductWithVariants(p, rate, currency));

        return sendSuccessResponse(res, "Products Fetched SuccessFully", {
            total: formatted.length,
            products: formatted
        });

    } catch (error) {
        console.log("error during Fetch Product By category", error);
        return sendErrorResponse(res, 500, "Error During Fetch Product By category", error);
    }
};

export const getProductByCategoryId = async (req, res) => {
    try {
        const { categoryId } = req.params;

        if (!categoryId || !mongoose.Types.ObjectId.isValid(categoryId)) {
            return sendBadRequestResponse(res, "Category ID is required!");
        }

        const products = await productModel.find({ category: categoryId })
            .populate("category")
            .populate({ path: "variants", populate: { path: "stock" } });

        const { rate, currency } = getCurrencyRate(req?.user);
        const formatted = products.map(p => formatProductWithVariants(p, rate, currency));

        return sendSuccessResponse(res, "Products fetched successfully", {
            total: formatted.length,
            products: formatted
        });
    } catch (error) {
        console.error("Error in getProductByCategoryId:", error);
        return sendErrorResponse(res, 500, "Error during fetching products by category", error.message);
    }
};

export const getProductDetailController = async (req, res) => {
    try {
        const { productId } = req?.params;

        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
            return sendBadRequestResponse(res, "Product ID is required!");
        }

        let product = await productModel.findById(productId)
            .populate("category")
            .populate({ path: "variants", populate: { path: "stock" } });

        if (!product) {
            return sendNotFoundResponse(res, "Product Not Found");
        }

        const { rate, currency } = getCurrencyRate(req?.user);
        const formatted = formatProductWithVariants(product, rate, currency);

        return sendSuccessResponse(res, "Products details Fetched SuccessFully", {
            total: 1,
            shareLink: "",
            products: [formatted]
        });

    } catch (error) {
        console.log("error during Fetch Product Details", error);
        return sendErrorResponse(res, 500, "Error During Fetch Product Details", error);
    }
};

export const searchProductController = async (req, res) => {
    try {
        const { q } = req?.query;

        if (!q) {
            return sendErrorResponse(res, 400, "Search query is required");
        }

        const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(escaped, "i");

        const searchConditions = [
            { productName: regex }
        ];

        const categories = await CategoryModel.find({ category_name: regex }).select("_id");
        if (categories.length > 0) {
            const categoryIds = categories.map(c => c._id);
            searchConditions.push({ category: { $in: categoryIds } });
        }

        const products = await productModel.find({
            $or: searchConditions
        })
            .populate("category", "category_name")
            .populate({ path: "variants", populate: { path: "stock" } });

        const { rate, currency } = getCurrencyRate(req?.user);
        const formatted = products.map(p => formatProductWithVariants(p, rate, currency));

        return sendSuccessResponse(res, "Products fetched successfully", {
            total: formatted.length,
            products: formatted
        });

    } catch (error) {
        console.error("Error during Search product Controller:", error);
        return sendErrorResponse(res, 500, "Error during Search product Controller", error);
    }
};

export const filterProductController = async (req, res) => {
    try {
        let {
            categories,
            priceRange,
            discountRange,
            sortBy,
            search,
            inStock,
            page = 1,
            limit = 20
        } = req.query;

        if (req.method === "GET") {
            if (typeof categories === "string" && categories.trim() !== "") {
                categories = categories.split(",");
            }
            if (typeof priceRange === "string") {
                const parts = priceRange.split("-");
                priceRange = { min: Number(parts[0]), max: Number(parts[1]) };
            }
            if (typeof discountRange === "string") {
                const parts = discountRange.split("-");
                discountRange = { min: Number(parts[0]), max: Number(parts[1]) };
            }
            if (typeof inStock === "string") {
                inStock = inStock === "true";
            }
            page = Number(page) || 1;
            limit = Number(limit) || 20;
        }

        const andConditions = [];

        if (categories && categories.length > 0) {
            const categoryIds = categories.filter(id => mongoose.Types.ObjectId.isValid(id));
            if (categoryIds.length > 0) {
                andConditions.push({ category: { $in: categoryIds } });
            }
        }

        if (search) {
            andConditions.push({
                $or: [
                    { productName: { $regex: search, $options: "i" } },
                    { productDesc: { $regex: search, $options: "i" } }
                ]
            });
        }

        let variantFilter = {};
        let hasVariantFilter = false;

        if (priceRange) {
            variantFilter.price = {};
            if (priceRange.min !== undefined) variantFilter.price.$gte = priceRange.min;
            if (priceRange.max !== undefined) variantFilter.price.$lte = priceRange.max;
            hasVariantFilter = true;
        }

        if (discountRange) {
            variantFilter.discount = {};
            if (discountRange.min !== undefined) variantFilter.discount.$gte = discountRange.min;
            if (discountRange.max !== undefined) variantFilter.discount.$lte = discountRange.max;
            hasVariantFilter = true;
        }

        if (hasVariantFilter) {
            const matchingVariants = await variantModel.find(variantFilter).select("productId");
            const productIds = matchingVariants.map(v => v.productId);
            andConditions.push({ _id: { $in: productIds } });
        }

        if (inStock !== undefined) {
            const stockQuery = inStock ? { quantity: { $gt: 0 } } : { quantity: 0 };
            const matchingStocks = await stockModel.find(stockQuery).select("productId");
            const productIds = matchingStocks.map(s => s.productId);
            andConditions.push({ _id: { $in: productIds } });
        }

        const filter = andConditions.length > 0 ? { $and: andConditions } : {};

        let sort = {};
        switch (sortBy) {
            case "recent":
                sort = { createdAt: -1 };
                break;
            case "popular":
                sort = { soldCount: -1 };
                break;
            default:
                sort = { createdAt: -1 };
        }

        const skip = (page - 1) * limit;

        const products = await productModel.find(filter)
            .populate("category", "category_name")
            .populate({ path: "variants", populate: { path: "stock" } })
            .sort(sort)
            .skip(skip)
            .limit(limit);

        const total = await productModel.countDocuments(filter);
        
        const { rate, currency } = getCurrencyRate(req?.user);
        const formatted = products.map(p => formatProductWithVariants(p, rate, currency));

        return res.status(200).json({
            success: true,
            total,
            page,
            limit,
            products: formatted
        });

    } catch (error) {
        console.error("Error in filterProductController:", error);
        return res.status(500).json({
            success: false,
            message: "Error filtering products",
            error: error.message
        });
    }
};

export const getSeasonalProductsController = async (req, res) => {
    try {
        const category = await CategoryModel.findOne({ category_name: { $regex: /^seasonal$/i } });
        if (!category) {
            return sendSuccessResponse(res, "Seasonal category not found", {
                total: 0,
                products: []
            });
        }

        const products = await productModel.find({ category: category._id })
            .populate("category")
            .populate({ path: "variants", populate: { path: "stock" } });

        const { rate, currency } = getCurrencyRate(req?.user);
        const formatted = products.map(p => formatProductWithVariants(p, rate, currency));

        return sendSuccessResponse(res, "Seasonal products fetched successfully", {
            total: formatted.length,
            products: formatted
        });
    } catch (error) {
        console.error("Error in getSeasonalProductsController:", error);
        return sendErrorResponse(res, 500, "Error during fetching seasonal products", error.message);
    }
};

export const getGardenFreshProductsController = async (req, res) => {
    try {
        const productNames = [
            "Hybrid Tomato",
            "Onion",
            "Potato",
            "Green Chilli",
            "Lady Finger",
            "Cauliflower"
        ];

        const queryRegexes = productNames.map(name => new RegExp(`^${name}$`, 'i'));
        const products = await productModel.find({
            productName: { $in: queryRegexes }
        })
            .populate("category")
            .populate({ path: "variants", populate: { path: "stock" } });

        const { rate, currency } = getCurrencyRate(req?.user);
        const formatted = products.map(p => formatProductWithVariants(p, rate, currency));

        return sendSuccessResponse(res, "Garden Fresh products fetched successfully", {
            total: formatted.length,
            products: formatted
        });
    } catch (error) {
        console.error("Error in getGardenFreshProductsController:", error);
        return sendErrorResponse(res, 500, "Error during fetching Garden Fresh products", error.message);
    }
};
