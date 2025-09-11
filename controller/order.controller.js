import mongoose from "mongoose";
import { sendBadRequestResponse, sendErrorResponse, sendNotFoundResponse, sendSuccessResponse } from "../utils/Response.utils.js";
import UserModel from "../model/user.model.js";
import orderModel from "../model/order.model.js";


//select address for delivery
export const selectUserAddressController = async (req, res) => {
    try {
        const userId = req?.user?.id;
        const { addressId } = req?.params;

        // Validate IDs
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return sendBadRequestResponse(res, "Invalid or missing userId");
        }
        if (!addressId || !mongoose.Types.ObjectId.isValid(addressId)) {
            return sendBadRequestResponse(res, "Invalid or missing addressId");
        }

        // Find user
        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Find address inside user
        const address = user.address.id(addressId);
        if (!address) {
            return res.status(404).json({ message: "Address not found for this user" });
        }

        // If already selected, skip unnecessary save
        if (user.selectedAddress?.toString() === addressId) {
            return sendSuccessResponse(res, "Address already selected", {
                selectedAddress: user.selectedAddress
            });
        }

        // Update selected address
        user.selectedAddress = addressId;
        await user.save();

        return sendSuccessResponse(res, "Address selected successfully", {
            selectedAddress: user.selectedAddress
        });

    } catch (error) {
        console.error("Error while selecting address:", error.message);
        return sendErrorResponse(res, 500, "Error while selecting address", error);
    }
};


export const newOrderController = async (req, res) => {
    try {
        const userId = req?.user?.id;
        const { items } = req.body;

        // 🔹 Validate userId
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return sendBadRequestResponse(res, "Invalid or missing userId");
        }

        // 🔹 Validate items
        if (!Array.isArray(items) || items.length === 0) {
            return sendBadRequestResponse(res, "Items must be an array with at least 1 product");
        }

        for (const [index, item] of items.entries()) {
            if (!item.productId || !mongoose.Types.ObjectId.isValid(item.productId)) {
                return sendBadRequestResponse(res, `Invalid or missing productId at index ${index}`);
            }
            if (!item.packSizeId || !mongoose.Types.ObjectId.isValid(item.packSizeId)) {
                return sendBadRequestResponse(res, `Invalid or missing packSizeId at index ${index}`);
            }
            if (!item.quantity || item.quantity < 1) {
                return sendBadRequestResponse(res, `Quantity must be >= 1 at index ${index}`);
            }
        }

        // 🔹 Fetch user & selected address
        const user = await UserModel.findById(userId).select("address selectedAddress");
        if (!user) return sendNotFoundResponse(res, "User not found");
        if (!user.selectedAddress) {
            return sendNotFoundResponse(res, "No selected address found. Please select an address first.");
        }

        const selectedAddress = user.address.id(user.selectedAddress);
        if (!selectedAddress) {
            return sendNotFoundResponse(res, "Selected address not found in user addresses");
        }

        // 🔑 Check if order already exists for this user
        let order = await orderModel.findOne({ userId });

        if (order) {
            // ✅ Always append new items with deliveryAddress inside each item
            const newItems = items.map(item => ({
                ...item,
                deliveryAddress: selectedAddress
            }));

            order.items.push(...newItems);
            await order.save();

            return sendSuccessResponse(res, "Order updated successfully (items appended)", order);
        } else {
            // ✅ Create new order if none exists
            const newOrder = new orderModel({
                userId,
                items: items.map(item => ({
                    ...item,
                    deliveryAddress: selectedAddress
                }))
            });

            await newOrder.save();
            return sendSuccessResponse(res, "Order placed successfully", newOrder);
        }
    } catch (error) {
        console.error("Error While Ordering:", error);
        return sendErrorResponse(res, 500, "Error While Ordering", error?.message || error);
    }
};



export const myOrderController = async (req, res) => {
    try {
        const userId = req?.user?.id;

        if (!userId && !mongoose.Types.ObjectId.isValid(userId)) {
            return sendBadRequestResponse(res, "User id not found by Token");
        }

        //check

        const myOrder = await orderModel.find({ userId: userId });

        if (!myOrder) return sendNotFoundResponse(res, "My Order's Not Found! OOPS!");

        return sendSuccessResponse(res, "My order fetched Successfully", {
            total: myOrder.length,
            myOrder
        });
    } catch (error) {
        console.log("Error during Fetching My Controller");
        return sendErrorResponse(res, 500, "Error while Fetching My orders", error)
    }
}

export const updateMyOrderController = async (req, res) => {
    try {
        const userId = req?.user?.id;
        const { items } = req.body;
        const { orderId } = req.params;  // ✅ get from params

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return sendBadRequestResponse(res, "Invalid or missing userId");
        }

        if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
            return sendBadRequestResponse(res, "Invalid or missing orderId");
        }

        if (!Array.isArray(items) || items.length === 0) {
            return sendBadRequestResponse(res, "Items must be an array with at least 1 product");
        }

        // Validate items
        for (const [index, item] of items.entries()) {
            if (!item.productId || !mongoose.Types.ObjectId.isValid(item.productId)) {
                return sendBadRequestResponse(res, `Invalid or missing productId at index ${index}`);
            }
            if (!item.packSizeId || !mongoose.Types.ObjectId.isValid(item.packSizeId)) {
                return sendBadRequestResponse(res, `Invalid or missing packSizeId at index ${index}`);
            }
            if (!item.quantity || item.quantity < 1) {
                return sendBadRequestResponse(res, `Quantity must be >= 1 at index ${index}`);
            }
        }

        // Find order
        let order = await orderModel.findOne({ _id: orderId, userId });
        if (!order) {
            return sendNotFoundResponse(res, "Order not found for this user");
        }

        // Replace items (full update)
        order.items = items;

        // Refresh address
        const user = await UserModel.findById(userId).select("address selectedAddress");
        if (user?.selectedAddress) {
            const selectedAddress = user.address.id(user.selectedAddress);
            if (selectedAddress) {
                order.deliveryAddress = selectedAddress;
            }
        }

        await order.save();
        return sendSuccessResponse(res, "Order updated successfully", order);

    } catch (error) {
        console.error("Error While Updating Order:", error);
        return sendErrorResponse(res, 500, "Error While Updating Order", error?.message || error);
    }
};

export const deleteMyOrderController = async () => { }