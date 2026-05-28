import mongoose from "mongoose";
import { sendBadRequestResponse, sendErrorResponse, sendNotFoundResponse, sendSuccessResponse } from "../utils/Response.utils.js";
import CategoryModel from "../model/category.model.js";
import productModel from "../model/product.model.js";
import { uploadFile } from "../middleware/imageupload.js";
import sellerModel from "../model/seller.model.js";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "../utils/aws.config.js";



export const newProductController = async (req, res) => {
    try {
        const { id } = req?.user;
        if (!id && !mongoose.Types.ObjectId.isValid(id)) {
            return sendBadRequestResponse(res, "Seller Id is required to request");
        }
        const {
            categoryId,
            productName,
            price,
            originalPrice,
            discount,
            totalQuantity,
            totalUnit,
            packSizes,
            productDesc,
            productHealthBenefit,
            productStorage
        } = req.body;

        
        if (!req.file && !req.files?.productImage) {
            return sendBadRequestResponse(res, "Product image is required");
        }

        
        if (!categoryId || !mongoose.Types.ObjectId.isValid(categoryId)) {
            return sendBadRequestResponse(res, "Invalid or missing categoryId");
        }

        const categoryExists = await CategoryModel.findById(categoryId);
        if (!categoryExists) return sendBadRequestResponse(res, "Category not found");

        if (!productName?.trim()) return sendBadRequestResponse(res, "Product name is required");

        if (price == null || isNaN(price) || price < 0) {
            return sendBadRequestResponse(res, "Valid product price is required");
        }

        if (originalPrice != null && (isNaN(originalPrice) || originalPrice < 0)) {
            return sendBadRequestResponse(res, "Original price must be positive");
        }

        if (discount != null && (isNaN(discount) || discount < 0)) {
            return sendBadRequestResponse(res, "Discount must be >= 0");
        }

        if (!totalQuantity || isNaN(totalQuantity) || totalQuantity <= 0) {
            return sendBadRequestResponse(res, "Total quantity must be greater than 0");
        }

        const allowedUnits = ["g", "kg", "ml", "l", "pc"];
        if (!totalUnit || !allowedUnits.includes(totalUnit)) {
            return sendBadRequestResponse(res, `Invalid total unit. Allowed: ${allowedUnits.join(", ")}`);
        }

        
        let parsedPackSizes = [];
        if (packSizes) {
            try {
                parsedPackSizes = JSON.parse(packSizes);
                if (!Array.isArray(parsedPackSizes)) {
                    return sendBadRequestResponse(res, "packSizes must be an array");
                }
            } catch (err) {
                return sendBadRequestResponse(res, "Invalid packSizes format (must be JSON array)");
            }
        }

        
        const duplicateProduct = await productModel.findOne({
            productName: productName.trim(),
            price,
            "totalQuantity.value": totalQuantity,
            "totalQuantity.unit": totalUnit,
            packSizes: { $eq: parsedPackSizes } 
        });

        if (duplicateProduct) {
            return res.status(409).json({
                success: false,
                message: "Duplicate product exists with the same name, price, quantity, and pack sizes"
            });
        }

        
        let productImg, productImgKey;
        const mainImageFile = req.files?.productImage?.[0] || req.file;
        if (mainImageFile) {
            const result = await uploadFile(mainImageFile);
            productImg = result.url;
            productImgKey = result.key;
        }

        
        let galleryImages = [];
        if (req.files?.gImage) {
            for (const file of req.files.gImage) {
                const result = await uploadFile(file);
                galleryImages.push({ gImage: result.url, gImageKey: result.key });
            }
        }

        
        const newProduct = await productModel.create({
            productName: productName.trim(),
            category: categoryId,
            sellerId: id,
            price,
            originalPrice,
            discount: discount || 0,
            totalQuantity: { value: totalQuantity, unit: totalUnit },
            packSizes: parsedPackSizes,
            productDesc: productDesc || "",
            productImage: productImg,
            productImageKey: productImgKey,
            gImage: galleryImages,
            productHealthBenefit: productHealthBenefit || "",
            productStorage: productStorage || "",
            inStock: totalQuantity > 0,   
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
        const products = await productModel.find({}).populate("category");

        if (!products) {
            return sendNotFoundResponse(res, "Not Product Found!");
        }

        return sendSuccessResponse(res, "All product Fetched Successfully", {
            total: products.length,
            products: products
        })
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
            price,
            originalPrice,
            discount,
            totalQuantity,
            totalUnit,
            packSizes,
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
        if (price != null) product.price = price;
        if (originalPrice != null) product.originalPrice = originalPrice;
        if (discount != null) product.discount = discount;
        if (productDesc) product.productDesc = productDesc;
        if (productHealthBenefit) product.productHealthBenefit = productHealthBenefit;
        if (productStorage) product.productStorage = productStorage;

        
        if (totalQuantity && totalUnit) {
            const allowedUnits = ["g", "kg", "ml", "l", "pc"];
            if (!allowedUnits.includes(totalUnit)) {
                return sendBadRequestResponse(res, `Invalid unit. Allowed: ${allowedUnits.join(", ")}`);
            }
            product.totalQuantity = { value: totalQuantity, unit: totalUnit };
            product.inStock = totalQuantity > 0;
        }

        
        if (packSizes) {
            try {
                const parsedPackSizes = JSON.parse(packSizes);
                if (!Array.isArray(parsedPackSizes)) {
                    return sendBadRequestResponse(res, "packSizes must be an array");
                }
                product.packSizes = parsedPackSizes;
            } catch (err) {
                return sendBadRequestResponse(res, "Invalid packSizes format (must be JSON array)");
            }
        }

        
        const mainImageFile = req.files?.productImage?.[0] || req.file;
        if (mainImageFile) {
            
            if (product.productImageKey) {
                try {
                    await s3.send(new DeleteObjectCommand({
                        Bucket: process.env.S3_BUCKET_NAME,
                        Key: product.productImageKey
                    }));
                } catch (delErr) {
                    console.error("Failed to delete old product image:", delErr.message);
                }
            }
            const result = await uploadFile(mainImageFile);
            product.productImage = result.url;
            product.productImageKey = result.key;
        }

        
        if (req.files?.gImage && req.files.gImage.length > 0) {
            
            if (product.gImage && product.gImage.length > 0) {
                for (const img of product.gImage) {
                    if (img.gImageKey) {
                        try {
                            await s3.send(new DeleteObjectCommand({
                                Bucket: process.env.S3_BUCKET_NAME,
                                Key: img.gImageKey
                            }));
                        } catch (delErr) {
                            console.error("Failed to delete old gallery image:", delErr.message);
                        }
                    }
                }
            }

            
            const galleryImages = [];
            for (const file of req.files.gImage) {
                const result = await uploadFile(file);
                galleryImages.push({ gImage: result.url, gImageKey: result.key });
            }
            product.gImage = galleryImages;
        }

        await product.save();

        return sendSuccessResponse(res, "Product updated successfully", product);

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
            return sendErrorResponse(
                res,
                403,
                "You are not authorized to delete this product"
            );
        }

        
        if (product.productImageKey) {
            try {
                console.log("Deleting main image:", product.productImageKey);
                await s3.send(
                    new DeleteObjectCommand({
                        Bucket: process.env.S3_BUCKET_NAME,
                        Key: product.productImageKey, 
                    })
                );
            } catch (err) {
                console.error("❌ Failed to delete main image:", err.message);
            }
        }

        
        if (product.gImage?.length > 0) {
            for (const img of product.gImage) {
                if (img.gImageKey) {
                    try {
                        console.log("Deleting gallery image:", img.gImageKey);
                        await s3.send(
                            new DeleteObjectCommand({
                                Bucket: process.env.S3_BUCKET_NAME,
                                Key: img.gImageKey,
                            })
                        );
                    } catch (err) {
                        console.error("❌ Failed to delete gallery image:", err.message);
                    }
                }
            }
        }

        
        await product.deleteOne();

        
        await sellerModel.findByIdAndUpdate(
            sellerId,
            { $pull: { products: product._id } },
            { new: true }
        );

        return sendSuccessResponse(res, "✅ Product deleted successfully");
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

        let products = await productModel
            .find({ category: categoryId })
            .select("productImage productName price originalPrice discount packSizes");

        if (!products && !products.length !== 0) {
            return sendBadRequestResponse("Product Not Found");
        }

        
        const formattedProducts = products.map(product => ({
            _id: product._id,
            productName: product.productName,
            price: product.price,
            originalPrice: product.originalPrice,
            discount: product.discount,
            productImage: product.productImage,
            packSizes: product.packSizes.length > 0
                ? [{
                    weight: product.packSizes[0].weight,
                    unit: product.packSizes[0].unit
                }]
                : [] 
        }));

        return sendSuccessResponse(res, "Products Fetched SuccessFully", {
            total: formattedProducts.length,
            products: formattedProducts
        });

    } catch (error) {
        console.log("error during Fetch Product By category (short)", error);
        return sendErrorResponse(res, 500, "Error During Fetch Product By category", error);
    }
};


export const getProductByCategoryId = async (req, res) => {
    try {
        const { categoryId } = req.params;

        if (!categoryId || !mongoose.Types.ObjectId.isValid(categoryId)) {
            return sendBadRequestResponse(res, "Category ID is required!");
        }

        const products = await productModel.find({ category: categoryId }).populate("category");

        return sendSuccessResponse(res, "Products fetched successfully", {
            total: products.length,
            products: products
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
            return sendBadRequestResponse(res, "Category ID is required!");
        }

        let products = await productModel
            .find({ _id: productId })

        if (!products && !products.length !== 0) {
            return sendBadRequestResponse("Product Not Found");
        }

        return sendSuccessResponse(res, "Products details Fetched SuccessFully", {
            total: products.length,
            shareLink: "",
            products: products
        });

    } catch (error) {
        console.log("error during Fetch Product Details (long)", error);
        return sendErrorResponse(res, 500, "Error During Fetch Product Details", error);
    }
}


export const searchProductController = async (req, res) => {
    try {
        const { q } = req?.query;

        if (!q) {
            return sendErrorResponse(res, 400, "Search query is required");
        }

        
        const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(escaped, "i");

        
        const searchConditions = [
            { productName: regex },

            
            {
                $expr: {
                    $regexMatch: {
                        input: { $toString: "$price" },
                        regex: regex
                    }
                }
            },

            
            {
                $expr: {
                    $regexMatch: {
                        input: { $toString: "$originalPrice" },
                        regex: regex
                    }
                }
            },

            
            {
                $expr: {
                    $regexMatch: {
                        input: { $toString: "$discount" },
                        regex: regex
                    }
                }
            }
        ];

        
        const categories = await CategoryModel.find({ category_name: regex }).select("_id");
        if (categories.length > 0) {
            const categoryIds = categories.map(c => c._id);
            searchConditions.push({ category: { $in: categoryIds } });
        }

        
        const products = await productModel.find({
            $or: searchConditions
        }).populate("category", "category_name");

        return sendSuccessResponse(res, "Products fetched successfully", {
            total: products.length,
            products
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
            } else if (req.query.minPrice !== undefined || req.query.maxPrice !== undefined) {
                priceRange = {
                    min: req.query.minPrice !== undefined ? Number(req.query.minPrice) : undefined,
                    max: req.query.maxPrice !== undefined ? Number(req.query.maxPrice) : undefined
                };
            }
            if (typeof discountRange === "string") {
                const parts = discountRange.split("-");
                discountRange = { min: Number(parts[0]), max: Number(parts[1]) };
            } else if (req.query.minDiscount !== undefined || req.query.maxDiscount !== undefined) {
                discountRange = {
                    min: req.query.minDiscount !== undefined ? Number(req.query.minDiscount) : undefined,
                    max: req.query.maxDiscount !== undefined ? Number(req.query.maxDiscount) : undefined
                };
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

        if (priceRange) {
            const priceCond = {};
            if (priceRange.min !== undefined) priceCond.$gte = priceRange.min;
            if (priceRange.max !== undefined) priceCond.$lte = priceRange.max;

            andConditions.push({
                $or: [
                    { price: priceCond },
                    { "packSizes.price": priceCond }
                ]
            });
        }

        if (discountRange) {
            const discountCond = {};
            if (discountRange.min !== undefined) discountCond.$gte = discountRange.min;
            if (discountRange.max !== undefined) discountCond.$lte = discountRange.max;

            andConditions.push({
                $or: [
                    { discount: discountCond },
                    { "packSizes.discount": discountCond }
                ]
            });
        }

        if (inStock !== undefined) {
            andConditions.push({ inStock });
        }

        if (search) {
            andConditions.push({
                $or: [
                    { productName: { $regex: search, $options: "i" } },
                    { productDesc: { $regex: search, $options: "i" } }
                ]
            });
        }

        const filter = andConditions.length > 0 ? { $and: andConditions } : {};

        let sort = {};
        switch (sortBy) {
            case "priceHigh":
                sort = { price: -1 };
                break;
            case "priceLow":
                sort = { price: 1 };
                break;
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
            .sort(sort)
            .skip(skip)
            .limit(limit);

        const total = await productModel.countDocuments(filter);

        return res.status(200).json({
            success: true,
            total,
            page,
            limit,
            products
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


export const getPackSizeByIdController = async (req, res) => {
    try {
        const { packSizeId } = req.params;

        if (!packSizeId || !mongoose.Types.ObjectId.isValid(packSizeId)) {
            return sendErrorResponse(res, 400, "Valid packSizeId is required");
        }

        
        const product = await productModel.findOne(
            { "packSizes._id": packSizeId },
            { "packSizes.$": 1, productName: 1, categoryName: 1, price: 1, originalPrice: 1 }
        );

        if (!product || !product.packSizes || product.packSizes.length === 0) {
            return sendErrorResponse(res, 404, "PackSize not found");
        }

        const packSize = product.packSizes[0];

        
        const responseData = {
            productId: product._id,
            productName: product.productName,
            categoryName: product.category,
            basePrice: product.price,
            originalPrice: product.originalPrice,
            packSize: packSize
        };

        return sendSuccessResponse(res, "PackSize with product fetched successfully", responseData);
    } catch (error) {
        console.error("Error in getPackSizeByIdController:", error);
        return sendErrorResponse(res, 500, "Internal server error");
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

        
        const products = await productModel.find({ category: category._id }).populate("category");

        return sendSuccessResponse(res, "Seasonal products fetched successfully", {
            total: products.length,
            products: products
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
        }).populate("category");

        return sendSuccessResponse(res, "Garden Fresh products fetched successfully", {
            total: products.length,
            products: products
        });
    } catch (error) {
        console.error("Error in getGardenFreshProductsController:", error);
        return sendErrorResponse(res, 500, "Error during fetching Garden Fresh products", error.message);
    }
};

