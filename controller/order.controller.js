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


// ✅ Place New Order
export const newOrderController = async (req, res) => {
    try {
        const userId = req?.user?.id;
        const { items } = req.body;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return sendBadRequestResponse(res, "Invalid or missing userId");
        }

        if (!Array.isArray(items) || items.length === 0) {
            return sendBadRequestResponse(
                res,
                "Items must be an array with at least 1 product"
            );
        }

        // validate items
        for (const [index, item] of items.entries()) {
            if (!item.productId || !mongoose.Types.ObjectId.isValid(item.productId)) {
                return sendBadRequestResponse(
                    res,
                    `Invalid or missing productId at index ${index}`
                );
            }
            if (!item.packSizeId || !mongoose.Types.ObjectId.isValid(item.packSizeId)) {
                return sendBadRequestResponse(
                    res,
                    `Invalid or missing packSizeId at index ${index}`
                );
            }
            if (!item.quantity || item.quantity < 1) {
                return sendBadRequestResponse(
                    res,
                    `Quantity must be >= 1 at index ${index}`
                );
            }
        }

        // get user & selected address
        const user = await UserModel.findById(userId).select(
            "address selectedAddress"
        );
        if (!user) return sendNotFoundResponse(res, "User not found");
        if (!user.selectedAddress) {
            return sendNotFoundResponse(
                res,
                "No selected address found. Please select an address first."
            );
        }
        const selectedAddress = user.address.id(user.selectedAddress);
        if (!selectedAddress) {
            return sendNotFoundResponse(
                res,
                "Selected address not found in user addresses"
            );
        }

        // attach sellerId to each item
        const itemsWithSeller = await Promise.all(
            items.map(async (item) => {
                const product = await productModel
                    .findById(item.productId)
                    .select("sellerId");
                if (!product) {
                    throw new Error(`Product not found for productId: ${item.productId}`);
                }
                return {
                    ...item,
                    sellerId: product.sellerId,
                };
            })
        );

        const newOrder = new orderModel({
            userId,
            items: itemsWithSeller,
            deliveryAddress: selectedAddress,
        });

        await newOrder.save();

        return sendSuccessResponse(res, "Order placed successfully", newOrder);
    } catch (error) {
        console.error("Error While Ordering:", error);
        return sendErrorResponse(
            res,
            500,
            "Error While Ordering",
            error?.message || error
        );
    }
};


export const myOrderController = async (req, res) => {
    try {
        const userId = req?.user?.id;
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return sendBadRequestResponse(res, "Invalid user id");
        }

        const myOrders = await orderModel
            .find({ userId })
            .populate({
                path: "items.sellerId",
                select: "name email phone"
            })
            .populate({
                path: "items.productId",
                select: "productName images price", // ✅ make sure price is included
                populate: {
                    path: "sellerId",
                    select: "businessName storeName email mobileNo pickUpAddr"
                }
            })
            .populate({
                path: "userId",
                select: "name email"
            });

        if (!myOrders || myOrders.length === 0) {
            return sendNotFoundResponse(res, "No orders found");
        }

        // ✅ Calculate totals
        const ordersWithTotals = myOrders.map(order => {
            let totalAmount = 0;

            order.items.forEach(item => {
                const price = item.productId?.price || 0;
                totalAmount += price * item.quantity;
            });

            return {
                ...order.toObject(),
                totalAmount
            };
        });

        return sendSuccessResponse(res, "My orders fetched successfully", {
            total: ordersWithTotals.length,
            myOrders: ordersWithTotals,
        });
    } catch (error) {
        console.error("Error fetching orders:", error);
        return sendErrorResponse(res, 500, "Error fetching orders", error);
    }
};


export const updateMyOrderController = async (req, res) => {
    try {
        const userId = req?.user?.id;
        const { orderId } = req.params;
        const { items, comment } = req.body;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return sendBadRequestResponse(res, "Invalid or missing userId");
        }
        if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
            return sendBadRequestResponse(res, "Invalid or missing orderId");
        }

        const order = await orderModel.findOne({ _id: orderId, userId });
        if (!order) {
            return sendNotFoundResponse(res, "Order not found");
        }

        if (Array.isArray(items) && items.length > 0) {
            items.forEach((updateItem) => {
                const orderItem = order.items.id(updateItem._id);
                if (orderItem) {
                    if (updateItem.quantity !== undefined)
                        orderItem.quantity = updateItem.quantity;
                }
            });
        }

        if (comment !== undefined) {
            order.comment = comment;
        }

        await order.save();
        return sendSuccessResponse(res, "Order updated successfully", order);
    } catch (error) {
        console.error("Error updating order:", error);
        return sendErrorResponse(
            res,
            500,
            "Error updating order",
            error?.message || error
        );
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
        const { orderId } = req.params;
        const { reasonForCancel, comment } = req.body;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return sendBadRequestResponse(res, "Invalid userId");
        }
        if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
            return sendBadRequestResponse(res, "Invalid orderId");
        }
        if (!reasonForCancel || reasonForCancel.trim() === "") {
            return sendBadRequestResponse(res, "Reason for cancellation is required");
        }

        const order = await orderModel.findOne({ _id: orderId, userId });
        if (!order) return sendNotFoundResponse(res, "Order not found");

        if (order.status === "cancelled") {
            return sendBadRequestResponse(res, "Order is already cancelled");
        }

        order.status = "cancelled";
        order.reasonForCancel = reasonForCancel;
        order.comment = comment || null;

        await order.save();
        return sendSuccessResponse(res, "Order cancelled successfully", order);
    } catch (error) {
        console.error("Error cancelling order:", error);
        return sendErrorResponse(res, 500, "Error cancelling order", error);
    }
};


export const sellerChangeOrderStatusController = async (req, res) => {
    try {
        const sellerId = req?.user?.id;
        const { orderId } = req.params;
        const { status } = req.body;

        const allowedStatus = [
            "pending",
            "packing",
            "out for delivery",
            "delivered",
            "cancelled",
        ];

        if (!sellerId || !mongoose.Types.ObjectId.isValid(sellerId)) {
            return sendBadRequestResponse(res, "Invalid sellerId");
        }
        if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
            return sendBadRequestResponse(res, "Invalid orderId");
        }
        if (!status || !allowedStatus.includes(status)) {
            return sendBadRequestResponse(
                res,
                `Status must be one of: ${allowedStatus.join(", ")}`
            );
        }

        const order = await orderModel.findOne({
            _id: orderId,
            "items.sellerId": sellerId,
        });
        if (!order) {
            return sendNotFoundResponse(res, "Order not found for this seller");
        }

        order.status = status;
        await order.save();

        return sendSuccessResponse(
            res,
            "Order status updated successfully",
            order
        );
    } catch (error) {
        console.error("Error updating order status:", error);
        return sendErrorResponse(
            res,
            500,
            "Error updating order status",
            error?.message || error
        );
    }
};


//user status wise filter
export const userStatusFilterController = async (req, res) => {
    try {
        const userId = req?.user?.id;
        const { status } = req.query;
        const allowedStatus = [
            "pending",
            "packing",
            "out for delivery",
            "delivered",
            "cancelled",
        ];

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return sendBadRequestResponse(res, "Invalid userId");
        }
        if (!status || !allowedStatus.includes(status)) {
            return sendBadRequestResponse(
                res,
                `Status query parameter is required and must be one of: ${allowedStatus.join(
                    ", "
                )}`
            );
        }

        const orders = await orderModel
            .find({ userId, status })
            .populate({ path: "items.sellerId", select: "name email phone" });

        if (!orders || orders.length === 0) {
            return sendNotFoundResponse(res, `No orders found with status: ${status}`);
        }

        return sendSuccessResponse(
            res,
            `Orders with status: ${status} fetched successfully`,
            {
                total: orders.length,
                orders,
            }
        );
    } catch (error) {
        console.error("Error filtering orders by status:", error);
        return sendErrorResponse(
            res,
            500,
            "Error filtering orders by status",
            error?.message || error
        );
    }
};

