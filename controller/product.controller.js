import mongoose from "mongoose";
import {
    sendBadRequestResponse,
    sendCreatedResponse,
    sendErrorResponse,
    sendNotFoundResponse,
    sendSuccessResponse
} from "../utils/Response.utils.js";
import { ThrowError } from "../utils/Error.utils.js";
import ProductModel from "../model/product.model.js";
import CategoryModel from "../model/category.model.js";
import SellerModel from "../model/seller.model.js";
import { uploadFile } from "../middleware/imageUpload.js";

// Create a new product
export const createProduct = async (req, res) => {
    try {
        const { categoryId, product_name } = req.body;
        const { id } = req.user;

        if (!categoryId || !product_name) {
            return sendBadRequestResponse(res, "categoryId & product_name are required!!!");
        }

        if (!mongoose.Types.ObjectId.isValid(categoryId)) {
            return sendBadRequestResponse(res, "Invalid categoryId");
        }

        const checkCategory = await CategoryModel.findById(categoryId);
        if (!checkCategory) {
            return sendNotFoundResponse(res, "Category not found!!!");
        }

        // Check if product already exists for this seller
        const existingProduct = await ProductModel.findOne({
            product_name,
            sellerId: id
        });
        if (existingProduct) {
            return sendBadRequestResponse(res, "Product already exists!!!");
        }


        let product_image = { url: null, key: null };
        let product_gallery_image = [];

        // Single main product image
        if (req.files?.product_image?.[0]) {
            const result = await uploadFile(req.files.product_image[0]);
            product_image = { url: result.url, key: result.key };
        }

        // Multiple gallery images
        if (req.files?.product_gallery_image) {
            for (const file of req.files.product_gallery_image) {
                const result = await uploadFile(file);
                product_gallery_image.push({ url: result.url, key: result.key });
            }
        }

        const newProduct = await ProductModel.create({
            categoryId,
            product_name,
            sellerId: id,
            product_image,
            product_gallery_image
        });


        await SellerModel.findByIdAndUpdate(
            id,
            { $push: { products: newProduct._id } }
        );

        return sendCreatedResponse(res, "Product added successfully", newProduct);

    } catch (error) {
        console.error("Create Product Error:", error.message);
        return ThrowError(res, 500, error.message);
    }
};

// Get all products
export const getAllProduct = async (req, res) => {
    try {
        const product = await ProductModel.find().populate("categoryId", "category_name");
        if (!product || product.length === 0) {
            return sendBadRequestResponse(res, "No Product found", []);
        }
        return sendSuccessResponse(res, "Product fetched successfully", product);
    } catch (error) {
        return ThrowError(res, 500, error.message);
    }
};

// Get product by ID
export const getProductById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return sendBadRequestResponse(res, "Invalid Product ID");
        }

        const product = await ProductModel.findById(id).populate("categoryId", "category_name");
        if (!product) {
            return sendErrorResponse(res, 404, "Product not found");
        }

        return sendSuccessResponse(res, "Product retrieved successfully", product);
    } catch (error) {
        return ThrowError(res, 500, error.message);
    }
};

// Update product
export const updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const { categoryId, product_name } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return sendBadRequestResponse(res, "Invalid Product ID");
        }

        const product = await ProductModel.findById(id);
        if (!product) {
            return sendNotFoundResponse(res, "Product not found!!!");
        }

        if (categoryId) {
            if (!mongoose.Types.ObjectId.isValid(categoryId)) {
                return sendBadRequestResponse(res, "Invalid categoryId");
            }
            const categoryExists = await CategoryModel.findById(categoryId);
            if (!categoryExists) {
                return sendNotFoundResponse(res, "Category not found!!!");
            }
            product.categoryId = categoryId;
        }

        if (product_name) {
            const productExist = await ProductModel.findOne({ product_name });
            if (productExist && productExist._id.toString() !== id) {
                return sendBadRequestResponse(res, "Product name already exists!!!");
            }
            product.product_name = product_name;
        }

        if (req.files?.product_image?.[0]) {
            const file = req.files.product_image[0];
            const result = await uploadFile(file);

            // Delete old image from S3
            if (product.product_image?.key) {
                try {
                    await s3.send(new DeleteObjectCommand({
                        Bucket: process.env.S3_BUCKET_NAME,
                        Key: product.product_image.key
                    }));
                } catch (err) {
                    console.error("Failed to delete old product image:", err.message);
                }
            }

            product.product_image = { url: result.url, key: result.key };
        }

        if (req.files?.product_gallery_image) {
            // Delete old gallery images
            for (const img of product.product_gallery_image) {
                if (img?.key) {
                    try {
                        await s3.send(new DeleteObjectCommand({
                            Bucket: process.env.S3_BUCKET_NAME,
                            Key: img.key
                        }));
                    } catch (err) {
                        console.error("Failed to delete old gallery image:", err.message);
                    }
                }
            }

            // Upload new gallery images
            const newGallery = [];
            for (const file of req.files.product_gallery_image) {
                const result = await uploadFile(file);
                newGallery.push({ url: result.url, key: result.key });
            }
            product.product_gallery_image = newGallery;
        }

        await product.save();
        return sendSuccessResponse(res, "Product updated successfully", product);

    } catch (error) {
        return ThrowError(res, 500, error.message);
    }
};

// Delete product
export const deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return sendBadRequestResponse(res, "Invalid Product ID");
        }

        const product = await ProductModel.findById(id);
        if (!product) {
            return sendNotFoundResponse(res, "Product not found!!!");
        }

        // Delete main image
        if (product.product_image?.key) {
            try {
                await s3.send(new DeleteObjectCommand({
                    Bucket: process.env.S3_BUCKET_NAME,
                    Key: product.product_image.key
                }));
            } catch (err) {
                console.error("Failed to delete main image:", err.message);
            }
        }

        // Delete gallery images
        for (const img of product.product_gallery_image) {
            if (img?.key) {
                try {
                    await s3.send(new DeleteObjectCommand({
                        Bucket: process.env.S3_BUCKET_NAME,
                        Key: img.key
                    }));
                } catch (err) {
                    console.error("Failed to delete gallery image:", err.message);
                }
            }
        }

        // Delete product from DB
        await ProductModel.findByIdAndDelete(id);

        // Remove reference from seller
        await SellerModel.findByIdAndUpdate(
            product.sellerId,
            { $pull: { products: product._id } }
        );

        return sendSuccessResponse(res, "Product deleted successfully", null);

    } catch (error) {
        return ThrowError(res, 500, error.message);
    }
};
