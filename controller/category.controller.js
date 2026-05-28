import mongoose from "mongoose";
import { ThrowError } from "../utils/Error.utils.js";
import CategoryModel from "../model/category.model.js";
import { sendBadRequestResponse, sendCreatedResponse, sendErrorResponse, sendSuccessResponse } from "../utils/Response.utils.js";
import { s3, publicUrlForKey, cleanupUploadedIfAny } from "../utils/aws.config.js";
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { uploadFile } from "../middleware/imageupload.js";

export class CategoryController {

    
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

    
    static async getTopCategories(req, res) {
        try {
            const OrderModel = mongoose.model("order");
            const topCategories = await OrderModel.aggregate([
                { $unwind: "$items" },
                { $match: { "items.status": { $ne: "cancelled" } } },
                {
                    $lookup: {
                        from: "products",
                        localField: "items.productId",
                        foreignField: "_id",
                        as: "productDetails"
                    }
                },
                { $unwind: "$productDetails" },
                {
                    $group: {
                        _id: "$productDetails.category",
                        orderCount: { $sum: 1 },
                        totalQuantity: { $sum: "$items.quantity" }
                    }
                },
                {
                    $lookup: {
                        from: "categories",
                        localField: "_id",
                        foreignField: "_id",
                        as: "categoryDetails"
                    }
                },
                { $unwind: "$categoryDetails" },
                {
                    $project: {
                        _id: 1,
                        category_name: "$categoryDetails.category_name",
                        category_image: "$categoryDetails.category_image",
                        category_image_key: "$categoryDetails.category_image_key",
                        orderCount: 1,
                        totalQuantity: 1
                    }
                },
                { $sort: { orderCount: -1 } }
            ]);

            return sendSuccessResponse(res, "Top categories fetched successfully", topCategories);
        } catch (error) {
            return ThrowError(res, 500, error.message);
        }
    }

    
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

            
            if (req.file) {
                try {
                    
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

                    
                    const result = await uploadFile(req.file);
                    existingCategory.category_image = result.url;
                    existingCategory.category_image_key = result.key;
                } catch (uploadErr) {
                    console.error("S3 Upload Error:", uploadErr.message);
                    return sendErrorResponse(res, 500, "Error while uploading category image");
                }
            }

            
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

            
            await category.deleteOne();

            return sendSuccessResponse(res, "Category deleted successfully");
        } catch (error) {
            console.error("Delete Category Error:", error.message);
            return ThrowError(res, 500, error.message);
        }
    }
}
