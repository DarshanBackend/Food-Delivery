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

// Create a new product
export const createProduct = async (req, res) => {
    try {
        const { categoryId, product_name } = req.body;

        if (!categoryId || !product_name) {
            return sendBadRequestResponse(res, "categoryId & product_name are required!!!");
        }

        if (!mongoose.Types.ObjectId.isValid(categoryId)) {
            return sendBadRequestResponse(res, "Invalid categoryId");
        }

        const checkCategoryId = await CategoryModel.findById(categoryId);
        if (!checkCategoryId) {
            return sendNotFoundResponse(res, "Category not found!!!");
        }

        const checkProductexist = await ProductModel.findOne({ product_name });
        if (checkProductexist) {
            return sendBadRequestResponse(res, "Product already exists!!!");
        }

        const newProduct = await ProductModel.create({
            categoryId,
            product_name,
        });

        return sendCreatedResponse(res, "Product added successfully", newProduct);

    } catch (error) {
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

        if (categoryId && !mongoose.Types.ObjectId.isValid(categoryId)) {
            return sendBadRequestResponse(res, "Invalid categoryId");
        }

        if (categoryId) {
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

        await ProductModel.findByIdAndDelete(id);
        return sendSuccessResponse(res, "Product deleted successfully", null);

    } catch (error) {
        return ThrowError(res, 500, error.message);
    }
};
