import mongoose from "mongoose";
import { sendBadRequestResponse, sendErrorResponse, sendNotFoundResponse, sendSuccessResponse } from "../utils/Response.utils.js";
import UserModel from "../model/user.model.js";
import orderModel from "../model/order.model.js";
import productModel from "../model/product.model.js";


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


        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return sendBadRequestResponse(res, "Invalid or missing userId");
        }


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


        const user = await UserModel.findById(userId).select("address selectedAddress");
        if (!user) return sendNotFoundResponse(res, "User not found");
        if (!user.selectedAddress) {
            return sendNotFoundResponse(res, "No selected address found. Please select an address first.");
        }

        const selectedAddress = user.address.id(user.selectedAddress);
        if (!selectedAddress) {
            return sendNotFoundResponse(res, "Selected address not found in user addresses");
        }


        const itemsWithSeller = await Promise.all(
            items.map(async (item) => {
                const product = await productModel.findById(item.productId).select("sellerId");
                if (!product) {
                    throw new Error(`Product not found for productId: ${item.productId}`);
                }
                return {
                    ...item,
                    deliveryAddress: selectedAddress,
                    sellerId: product.sellerId
                };
            })
        );


        let order = await orderModel.findOne({ userId });

        if (order) {

            order.items.push(...itemsWithSeller);
            await order.save();
            return sendSuccessResponse(res, "Order updated successfully (items appended)", order);
        } else {

            const newOrder = new orderModel({
                userId,
                items: itemsWithSeller
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

        const myOrder = await orderModel.find({ userId }).populate({ path: "items.sellerId", select: "name email phone" });

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
        const { orderId } = req.params;


        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return sendBadRequestResponse(res, "Invalid or missing userId");
        }

        if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
            return sendBadRequestResponse(res, "Invalid or missing orderId");
        }

        if (!Array.isArray(items) || items.length === 0) {
            return sendBadRequestResponse(res, "Items must be an array with at least 1 product");
        }

        for (const [index, item] of items.entries()) {
            if (!item._id || !mongoose.Types.ObjectId.isValid(item._id)) {
                return sendBadRequestResponse(res, `Invalid or missing item._id at index ${index}`);
            }
        }


        let order = await orderModel.findOne({ _id: orderId, userId });
        if (!order) {
            return sendNotFoundResponse(res, "Order not found for this user");
        }


        items.forEach(updateItem => {
            const orderItem = order.items.id(updateItem._id);
            if (orderItem) {
                // Update only provided fields
                if (updateItem.quantity !== undefined) orderItem.quantity = updateItem.quantity;
                if (updateItem.status !== undefined) orderItem.status = updateItem.status;
                if (updateItem.comment !== undefined) orderItem.comment = updateItem.comment;
                if (updateItem.reasonForCancel !== undefined) {
                    orderItem.reasonForCancel = updateItem.reasonForCancel;
                }
            }
        });

        await order.save();

        return sendSuccessResponse(res, "Order items updated successfully", order);
    } catch (error) {
        console.error("Error While Updating Order Items:", error);
        return sendErrorResponse(res, 500, "Error While Updating Order Items", error?.message || error);
    }
};


export const deleteMyOrderController = async (req, res) => {
    try {
        const userId = req?.user?.id;
        const { itemId } = req.params;


        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return sendBadRequestResponse(res, "Invalid or missing userId");
        }


        if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
            return sendBadRequestResponse(res, "Invalid or missing itemId");
        }

        const order = await orderModel.findOne({ userId, "items._id": itemId });
        if (!order) {
            return sendNotFoundResponse(res, "Order containing this item not found for this user");
        }

        const item = order.items.id(itemId);
        if (!item) {
            return sendNotFoundResponse(res, "Item not found in this order");
        }

        item.deleteOne();

        if (order.items.length === 0) {
            await orderModel.deleteOne({ _id: order._id });
            return sendSuccessResponse(res, "Order deleted completely (no items left)", null);
        }

        await order.save();
        return sendSuccessResponse(res, "Item deleted from order successfully", order);

    } catch (error) {
        console.error("Error While Deleting Order Item:", error);
        return sendErrorResponse(res, 500, "Error While Deleting Order Item", error?.message || error);
    }
};

//cancel 
export const cancelMyOrderController = async (req, res) => {
    try {
        const userId = req?.user?.id;
        const { itemId } = req.params;
        const { reasonForCancel, comment } = req.body;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return sendBadRequestResponse(res, "Invalid or missing userId");
        }


        if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
            return sendBadRequestResponse(res, "Invalid or missing itemId");
        }


        if (!reasonForCancel || reasonForCancel.trim() === "") {
            return sendBadRequestResponse(res, "Reason for cancellation is required");
        }


        const order = await orderModel.findOne({ userId, "items._id": itemId });
        if (!order) {
            return sendNotFoundResponse(res, "Order containing this item not found");
        }

        const item = order.items.id(itemId);
        if (!item) {
            return sendNotFoundResponse(res, "Item not found in order");
        }


        if (item.status === "cancelled") {
            return sendBadRequestResponse(res, "Item is already cancelled");
        }


        item.status = "cancelled";
        item.reasonForCancel = reasonForCancel;
        item.comment = comment || null;

        await order.save();

        return sendSuccessResponse(res, "Order item cancelled successfully", order);
    } catch (error) {
        console.error("Error While Cancelling Order Item:", error);
        return sendErrorResponse(res, 500, "Error While Cancelling Order Item", error?.message || error);
    }
};

export const sellerChangeOrderStatusController = async (req, res) => {
    try {
        const sellerId = req?.user?.id;
        const { itemId } = req.params;
        const { status } = req.body;

        const allowedStatus = ["pending", "packing", "out of delivery", "delivered", "cancelled"];


        if (!sellerId || !mongoose.Types.ObjectId.isValid(sellerId)) {
            return sendBadRequestResponse(res, "Invalid sellerId");
        }
        if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
            return sendBadRequestResponse(res, "Invalid or missing itemId");
        }


        if (!status || !allowedStatus.includes(status)) {
            return sendBadRequestResponse(res, `Status must be one of: ${allowedStatus.join(", ")}`);
        }


        const order = await orderModel.findOne({ "items._id": itemId, "items.sellerId": sellerId });
        if (!order) {
            return sendNotFoundResponse(res, "Order item not found for this seller");
        }

        const item = order.items.id(itemId);

        if (!item) {
            return sendNotFoundResponse(res, "Item not found in order");
        }

        item.status = status;

        await order.save();

        return sendSuccessResponse(res, "Order item status updated successfully", order);
    } catch (error) {
        console.error("Error while updating order status:", error);
        return sendErrorResponse(res, 500, "Error while updating order status", error?.message || error);
    }
};
