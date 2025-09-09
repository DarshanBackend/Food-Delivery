import mongoose from "mongoose";
import { sendBadRequestResponse, sendErrorResponse, sendNotFoundResponse, sendSuccessResponse } from "../utils/Response.utils.js";
import CategoryModel from "../model/category.model.js";
import productModel from "../model/product.model.js";
import { uploadFile } from "../middleware/imageUpload.js";
import sellerModel from "../model/seller.model.js";


//new product Insert
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

        // === Check mandatory product image ===
        if (!req.file && !req.files?.productImage) {
            return sendBadRequestResponse(res, "Product image is required");
        }

        // === Validations ===
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

        // === Parse packSizes if provided (expects JSON array) ===
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

        // === Check for duplicate product ===
        const duplicateProduct = await productModel.findOne({
            productName: productName.trim(),
            price,
            "totalQuantity.value": totalQuantity,
            "totalQuantity.unit": totalUnit,
            packSizes: { $eq: parsedPackSizes } // optional strict match
        });

        if (duplicateProduct) {
            return res.status(409).json({
                success: false,
                message: "Duplicate product exists with the same name, price, quantity, and pack sizes"
            });
        }

        // === Upload main product image ===
        let productImg, productImgKey;
        const mainImageFile = req.files?.productImage?.[0] || req.file;
        if (mainImageFile) {
            const result = await uploadFile(mainImageFile);
            productImg = result.url;
            productImgKey = result.key;
        }

        // === Upload gallery images ===
        let galleryImages = [];
        if (req.files?.gImage) {
            for (const file of req.files.gImage) {
                const result = await uploadFile(file);
                galleryImages.push({ gImage: result.url, gImageKey: result.key });
            }
        }

        // === Create new product ===
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
            inStock: totalQuantity > 0,   // automatically set inStock based on quantity
            soldCount: 0
        });


        // save all product id in seller collection
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

//get All products
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

//get product by catgory id & short product info
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

        // Transform response: only first packSize
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
                : [] // empty array if no packSizes
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

//get Product By Category
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

//search controler by price,orinalPrice,discount,productName,catgory serach work
export const searchProductController = async (req, res) => {
    try {
        const { q } = req?.query;

        if (!q) {
            return sendErrorResponse(res, 400, "Search query is required");
        }

        // Escape regex special chars
        const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(escaped, "i");

        // --- Base search conditions ---
        const searchConditions = [
            { productName: regex },

            // price like '%q%'
            {
                $expr: {
                    $regexMatch: {
                        input: { $toString: "$price" },
                        regex: regex
                    }
                }
            },

            // originalPrice like '%q%'
            {
                $expr: {
                    $regexMatch: {
                        input: { $toString: "$originalPrice" },
                        regex: regex
                    }
                }
            },

            // discount like '%q%'
            {
                $expr: {
                    $regexMatch: {
                        input: { $toString: "$discount" },
                        regex: regex
                    }
                }
            }
        ];

        // --- Category search ---
        const categories = await CategoryModel.find({ category_name: regex }).select("_id");
        if (categories.length > 0) {
            const categoryIds = categories.map(c => c._id);
            searchConditions.push({ category: { $in: categoryIds } });
        }

        // Query products
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

//filter product
export const filterProductController = async (req, res) => {
    try {
        const {
            categories,       // array of category IDs or names
            priceRange,       // { min, max }
            discountRange,    // { min, max }
            sortBy,           // "priceHigh" | "priceLow" | "recent" | "popular"
            search,           // optional search string
            inStock,          // true/false
            page = 1,         // default 1
            limit = 20        // default 20
        } = req.body;

        const filter = {};

        // --- Category filter ---
        if (categories && categories.length > 0) {
            // If sending category names instead of IDs
            const categoryDocs = await CategoryModel.find({ category_name: { $in: categories } }, "_id")
            const categoryIds = categoryDocs.map(c => c._id);
            filter.category = { $in: categoryIds };
        }

        // --- Price filter ---
        if (priceRange) {
            filter.$or = [
                { price: { ...(priceRange.min !== undefined && { $gte: priceRange.min }), ...(priceRange.max !== undefined && { $lte: priceRange.max }) } },
                { "packSizes.price": { ...(priceRange.min !== undefined && { $gte: priceRange.min }), ...(priceRange.max !== undefined && { $lte: priceRange.max }) } }
            ];
        }

        // --- Discount filter ---
        if (discountRange) {
            filter.$or = [
                { discount: { ...(discountRange.min !== undefined && { $gte: discountRange.min }), ...(discountRange.max !== undefined && { $lte: discountRange.max }) } },
                { "packSizes.discount": { ...(discountRange.min !== undefined && { $gte: discountRange.min }), ...(discountRange.max !== undefined && { $lte: discountRange.max }) } }
            ];
        }

        // --- Stock filter ---
        if (inStock !== undefined) {
            filter.inStock = inStock;
        }

        // --- Search filter ---
        if (search) {
            filter.$or = [
                { productName: { $regex: search, $options: "i" } },
                { productDesc: { $regex: search, $options: "i" } }
            ];
        }

        // --- Sorting ---
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

        // --- Pagination ---
        const skip = (page - 1) * limit;

        // --- Fetch products ---
        const products = await productModel.find(filter)
            .populate("category", "category_name")
            .sort(sort)
            .skip(skip)
            .limit(limit);

        // --- Total count for pagination ---
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

