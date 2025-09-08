import mongoose from "mongoose";
import { ThrowError } from "../utils/Error.utils.js";
import CategoryModel from "../model/category.model.js";
import { sendBadRequestResponse, sendCreatedResponse, sendErrorResponse, sendSuccessResponse } from "../utils/Response.utils.js";
import { s3, publicUrlForKey, cleanupUploadedIfAny } from "../utils/aws.config.js";
import { DeleteObjectCommand } from '@aws-sdk/client-s3';

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

            let category_image = null;
            let category_image_key = null;

            // Prefer S3 files
            if (req.s3Files?.category_image) {
                category_image = req.s3Files.category_image.url;
                category_image_key = req.s3Files.category_image.key;
            }
            // fallback (local storage)
            else if (req.files?.category_image?.[0]) {
                const file = req.files.category_image[0];
                category_image = `/uploads/${file.filename}`;
                category_image_key = file.filename;
            }

            const newCategory = await CategoryModel.create({
                category_name,
                category_image,
                category_image_key,
            });

            return sendCreatedResponse(res, "Category added successfully", newCategory);
        } catch (error) {
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

            const pickUploaded = () => {
                if (req.file) return req.file;
                if (req.files?.category_image?.[0]) return req.files.category_image[0];
                return null;
            };
            const uploaded = pickUploaded();

            if (!mongoose.Types.ObjectId.isValid(id)) {
                await cleanupUploadedIfAny(uploaded);
                return sendBadRequestResponse(res, "Invalid Category ID");
            }

            const existingCategory = await CategoryModel.findById(id);
            if (!existingCategory) {
                await cleanupUploadedIfAny(uploaded);
                return sendErrorResponse(res, 404, "Category not found");
            }

            if (uploaded?.key) {
                const oldKey = existingCategory.category_image_key;
                if (oldKey) {
                    try {
                        await s3.send(new DeleteObjectCommand({
                            Bucket: process.env.S3_BUCKET_NAME,
                            Key: oldKey,
                        }));
                    } catch (e) {
                        console.error('Failed to delete old S3 object:', e.message);
                    }
                }
                existingCategory.category_image = publicUrlForKey(uploaded.key);
                existingCategory.category_image_key = uploaded.key;
            }

            if (category_name) {
                existingCategory.category_name = category_name;
            }

            await existingCategory.save();
            return sendSuccessResponse(res, "Category updated successfully", existingCategory);
        } catch (error) {
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

            const category = await CategoryModel.findByIdAndDelete(id);
            if (!category) {
                return sendErrorResponse(res, 404, "Category not found");
            }

            let keyToDelete = category.category_image_key;
            if (!keyToDelete && category.category_image) {
                try {
                    const url = new URL(category.category_image);
                    keyToDelete = url.pathname.replace(/^\//, '');
                } catch { }
            }

            if (keyToDelete) {
                try {
                    await s3.send(new DeleteObjectCommand({
                        Bucket: process.env.S3_BUCKET_NAME,
                        Key: keyToDelete,
                    }));
                } catch (e) {
                    console.error('Failed to delete S3 object:', e.message);
                }
            }

            return sendSuccessResponse(res, "Category deleted successfully");
        } catch (error) {
            return ThrowError(res, 500, error.message);
        }
    }
}
