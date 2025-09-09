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
            productStorage: productStorage || ""
        });


        // save all product id in seller collection
        const sellerProduct = await sellerModel.findByIdAndUpdate(
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

        if (!categoryId && !mongoose.Types.ObjectId.isValid(categoryId)) {
            return sendBadRequestResponse(res, "catgoey iD is Required!");
        }

        const product = await productModel.find({ category: categoryId }).select("productImage productName price originalPrice discount packSizes[0]")
        return res.json(product)
    } catch (error) {
        console.log("error during Fetch Product By catgory (short)");
        return sendErrorResponse(res, 500, "Error During Fetch Product By category", error)
    }
}