import mongoose from "mongoose";
import stockModel from "../model/stock.model.js";
import variantModel from "../model/variant.model.js";
import { sendBadRequestResponse, sendErrorResponse, sendNotFoundResponse, sendSuccessResponse } from "../utils/Response.utils.js";

export const addOrUpdateStockController = async (req, res) => {
    try {
        const { productId, variantId, quantity } = req.body;

        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
            return sendBadRequestResponse(res, "Valid productId is required");
        }

        if (!variantId || !mongoose.Types.ObjectId.isValid(variantId)) {
            return sendBadRequestResponse(res, "Valid variantId is required");
        }

        if (quantity == null || isNaN(quantity) || quantity < 0) {
            return sendBadRequestResponse(res, "Valid positive quantity is required");
        }

        const variant = await variantModel.findById(variantId);
        if (!variant) {
            return sendNotFoundResponse(res, "Variant not found");
        }

        let stock = await stockModel.findOne({ variantId });
        if (stock) {
            stock.quantity = Number(quantity);
            await stock.save();
        } else {
            stock = await stockModel.create({
                productId,
                variantId,
                quantity: Number(quantity)
            });
        }

        return sendSuccessResponse(res, "Stock updated successfully", stock);
    } catch (error) {
        console.error("Error updating stock:", error);
        return sendErrorResponse(res, 500, "Error updating stock", error.message);
    }
};

export const getStockByVariantController = async (req, res) => {
    try {
        const { variantId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(variantId)) {
            return sendBadRequestResponse(res, "Invalid variant ID");
        }

        const stock = await stockModel.findOne({ variantId });
        if (!stock) {
            return sendSuccessResponse(res, "Stock fetched successfully", { quantity: 0 });
        }

        return sendSuccessResponse(res, "Stock fetched successfully", stock);
    } catch (error) {
        console.error("Error fetching stock:", error);
        return sendErrorResponse(res, 500, "Error fetching stock", error.message);
    }
};
