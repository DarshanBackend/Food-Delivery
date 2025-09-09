import mongoose from "mongoose";
import { ThrowError } from "../utils/Error.utils.js";
import CategoryModel from "../model/category.model.js";
import { sendBadRequestResponse, sendCreatedResponse, sendErrorResponse, sendSuccessResponse } from "../utils/Response.utils.js";
import { s3, publicUrlForKey, cleanupUploadedIfAny } from "../utils/aws.config.js";
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { uploadFile } from "../middleware/imageUpload.js";

export class CategoryController {

    // Create new Category
    static async createCategory(req, res) {
        try {
            const { category_name } = req.body;

            if (!category_name) {
                return sendBadRequestResponse(res, "category_name is required");
            }

            const existingCategory = await CategoryModel.findOne({ category_name });
            if (existingCategory) {
                return sendBadRequestResponse(res, "This Category already exists");
            }

            let avatarUrl;
            if (req.file) {
                const result = await uploadFile(req.file);
                avatarUrl = result.url;
            }

            const newCategory = await CategoryModel.create({
                category_name,
                category_image: avatarUrl,
                category_image_key: null,
            });

            return sendCreatedResponse(res, "Category added successfully", newCategory);

        } catch (error) {
            console.error("Create Category Error:", error.message);
            return ThrowError(res, 500, error.message);
        }
    }

    // Get all categories
    static async getAllCategory(req, res) {
        try {
            const categories = await CategoryModel.find();
            if (!categories || categories.length === 0) {
                return sendBadRequestResponse(res, "No Category found", []);
            }
            return sendSuccessResponse(res, "Category fetched successfully", categories);
        } catch (error) {
            return ThrowError(res, 500, error.message);
        }
    }

    // Get category by ID
    static async getCategoryById(req, res) {
        try {
            const { id } = req.params;

            if (!mongoose.Types.ObjectId.isValid(id)) {
                return sendBadRequestResponse(res, "Invalid Category ID");
            }

            const category = await CategoryModel.findById(id);
            if (!category) {
                return sendErrorResponse(res, 404, "Category not found");
            }

            return sendSuccessResponse(res, "Category retrieved successfully", category);
        } catch (error) {
            return ThrowError(res, 500, error.message);
        }
    }

    // Update category
    static async updateCategory(req, res) {
        try {
            const { id } = req.params;
            const { category_name } = req.body;

            if (!mongoose.Types.ObjectId.isValid(id)) {
                return sendBadRequestResponse(res, "Invalid Category ID");
            }

            const existingCategory = await CategoryModel.findById(id);
            if (!existingCategory) {
                return sendErrorResponse(res, 404, "Category not found");
            }

            // Handle Image Upload
            if (req.file) {
                try {
                    // Delete old image from S3 if exists
                    if (existingCategory.category_image_key) {
                        try {
                            await s3.send(new DeleteObjectCommand({
                                Bucket: process.env.S3_BUCKET_NAME,
                                Key: existingCategory.category_image_key,
                            }));
                        } catch (delErr) {
                            console.error("Failed to delete old S3 object:", delErr.message);
                        }
                    }

                    // Upload new file
                    const result = await uploadFile(req.file);
                    existingCategory.category_image = result.url;
                    existingCategory.category_image_key = result.key;
                } catch (uploadErr) {
                    console.error("S3 Upload Error:", uploadErr.message);
                    return sendErrorResponse(res, 500, "Error while uploading category image");
                }
            }

            // Update category_name if provided
            if (category_name) {
                existingCategory.category_name = category_name;
            }

            await existingCategory.save();
            return sendSuccessResponse(res, "Category updated successfully", existingCategory);

        } catch (error) {
            console.error("Update Category Error:", error.message);
            return ThrowError(res, 500, error.message);
        }
    }

    // Delete category
    static async deleteCategory(req, res) {
        try {
            const { id } = req.params;

            if (!mongoose.Types.ObjectId.isValid(id)) {
                return sendBadRequestResponse(res, "Invalid Category ID");
            }

            const category = await CategoryModel.findById(id);
            if (!category) {
                return sendErrorResponse(res, 404, "Category not found");
            }

            // 🗑️ Delete image from S3 if exists
            if (category.category_image_key) {
                try {
                    await s3.send(new DeleteObjectCommand({
                        Bucket: process.env.S3_BUCKET_NAME,
                        Key: category.category_image_key,
                    }));
                } catch (err) {
                    console.error("Failed to delete S3 object:", err.message);
                }
            }

            // ❌ Delete category from DB
            await category.deleteOne();

            return sendSuccessResponse(res, "Category deleted successfully");
        } catch (error) {
            console.error("Delete Category Error:", error.message);
            return ThrowError(res, 500, error.message);
        }
    }
}
