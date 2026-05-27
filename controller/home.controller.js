import mongoose from "mongoose";
import CategoryModel from "../model/category.model.js";
import productModel from "../model/product.model.js";
import BannerModel from "../model/banner.model.js";
import offerModel from "../model/offer.model.js";
import orderModel from "../model/order.model.js";
import { sendSuccessResponse } from "../utils/Response.utils.js";
import { ThrowError } from "../utils/Error.utils.js";

export class HomeController {
    static async getHomePageData(req, res) {
        try {
            const [
                banners,
                categories,
                offers,
                gardenFreshProducts,
                seasonalCategory,
            ] = await Promise.all([
                BannerModel.find().populate("category"),
                CategoryModel.find(),
                offerModel.find({}).populate("category"),
                productModel.find({
                    productName: {
                        $in: [
                            "Hybrid Tomato",
                            "Onion",
                            "Potato",
                            "Green Chilli",
                            "Lady Finger",
                            "Cauliflower"
                        ].map(name => new RegExp(`^${name}$`, 'i'))
                    }
                }).populate("category"),
                CategoryModel.findOne({ category_name: { $regex: /^seasonal$/i } }),
            ]);

            let seasonalProducts = [];
            if (seasonalCategory) {
                seasonalProducts = await productModel.find({ category: seasonalCategory._id }).populate("category");
            }

            let topCategories = [];
            try {
                topCategories = await orderModel.aggregate([
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
            } catch (err) {
                console.error("Failed to fetch top categories aggregation:", err.message);
            }

            if (!topCategories || topCategories.length === 0) {
                topCategories = categories.slice(0, 6).map(cat => ({
                    _id: cat._id,
                    category_name: cat.category_name,
                    category_image: cat.category_image,
                    category_image_key: cat.category_image_key,
                    orderCount: 0,
                    totalQuantity: 0
                }));
            }

            return sendSuccessResponse(res, "Home page data fetched successfully", {
                topCategories,
                gardenFresh: gardenFreshProducts,
                banners,
                seasonal: seasonalProducts,
                offers
            });
        } catch (error) {
            console.error("Home Page Data Fetch Error:", error.message);
            return ThrowError(res, 500, error.message);
        }
    }
}
