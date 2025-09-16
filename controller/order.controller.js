import mongoose from "mongoose";
import { sendBadRequestResponse, sendErrorResponse, sendNotFoundResponse, sendSuccessResponse } from "../utils/Response.utils.js";
import UserModel from "../model/user.model.js";
import orderModel from "../model/order.model.js";
import productModel from "../model/product.model.js";
import cartModel from "../model/cart.model.js";


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
        const { items, appliedCoupon } = req.body;

        const platformFee = 1;

        // 1. Validate userId
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return sendBadRequestResponse(res, "Invalid or missing userId");
        }

        // 2. Validate items array
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

        // 3. Fetch user and selected address
        const user = await UserModel.findById(userId).select("address selectedAddress");
        if (!user) return sendNotFoundResponse(res, "User not found");
        if (!user.selectedAddress) {
            return sendNotFoundResponse(res, "No selected address found. Please select an address first.");
        }

        const selectedAddress = user.address.id(user.selectedAddress);
        if (!selectedAddress) {
            return sendNotFoundResponse(res, "Selected address not found in user addresses");
        }

        // 4. Enrich items with sellerId and calculate totalAmount
        let totalAmount = 0;
        const itemsWithSeller = await Promise.all(
            items.map(async (item) => {
                const product = await productModel.findById(item.productId).select("sellerId price");
                if (!product) {
                    throw new Error(`Product not found for productId: ${item.productId}`);
                }

                totalAmount += product.price * item.quantity;

                return {
                    ...item,
                    sellerId: product.sellerId
                };
            })
        );

        // 5. Check for existing pending order
        let order = await orderModel.findOne({ userId, "items.status": { $ne: "delivered" } });

        if (order) {
            // Append items to existing order
            order.items.push(...itemsWithSeller);
            order.totalAmount += totalAmount;
            order.finalAmount = order.totalAmount - (order.discount || 0);
            if (appliedCoupon) order.appliedCoupon = appliedCoupon;
            await order.save();

            return sendSuccessResponse(res, "Order updated successfully (items appended)", order);
        } else {
            // Create new order
            const newOrder = new orderModel({
                userId,
                items: itemsWithSeller,
                deliveryAddress: selectedAddress,
                platformFee: platformFee,
                totalAmount: totalAmount + platformFee,
                finalAmount: totalAmount + platformFee,
                appliedCoupon: appliedCoupon || null
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
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return sendBadRequestResponse(res, "Invalid user id");
        }

        // Fetch orders with populated fields
        const myOrders = await orderModel
            .find({ userId })
            .populate({
                path: "items.sellerId",
                select: "name email phone"
            })
            .populate({
                path: "items.productId",
                select: "productName images price",
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

        // Calculate totalAmount per order
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
            orders: ordersWithTotals,
        });
    } catch (error) {
        console.error("Error fetching orders:", error);
        return sendErrorResponse(res, 500, "Error fetching orders", error.message || error);
    }
};

export const updateMyOrderController = async (req, res) => {
    try {
        const userId = req?.user?.id;
        const { orderId } = req.params;
        const { items, comment } = req.body;

        // 1. Validate userId and orderId
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return sendBadRequestResponse(res, "Invalid or missing userId");
        }
        if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
            return sendBadRequestResponse(res, "Invalid or missing orderId");
        }

        // 2. Validate items array if provided
        if (items && (!Array.isArray(items) || items.length === 0)) {
            return sendBadRequestResponse(res, "Items must be an array with at least 1 product");
        }

        if (items) {
            for (const [index, item] of items.entries()) {
                if (!item._id || !mongoose.Types.ObjectId.isValid(item._id)) {
                    return sendBadRequestResponse(res, `Invalid or missing item._id at index ${index}`);
                }
                if (item.quantity !== undefined && item.quantity < 1) {
                    return sendBadRequestResponse(res, `Quantity must be >= 1 at index ${index}`);
                }
            }
        }

        // 3. Find the order and populate productId for price
        let order = await orderModel.findOne({ _id: orderId, userId }).populate("items.productId");
        if (!order) {
            return sendNotFoundResponse(res, "Order not found for this user");
        }

        let totalAmount = 0;

        // 4. Update items if provided
        if (items) {
            items.forEach(updateItem => {
                const orderItem = order.items.id(updateItem._id);
                if (orderItem) {
                    if (updateItem.quantity !== undefined) orderItem.quantity = updateItem.quantity;
                    if (updateItem.status !== undefined) orderItem.status = updateItem.status;
                    if (updateItem.comment !== undefined) orderItem.comment = updateItem.comment;
                    if (updateItem.reasonForCancel !== undefined) orderItem.reasonForCancel = updateItem.reasonForCancel;

                    const price = orderItem.productId?.price || 0;
                    totalAmount += price * orderItem.quantity;
                }
            });
        }

        // 5. Update order-level comment if provided
        if (comment !== undefined) {
            order.comment = comment;
        }

        order.totalAmount = totalAmount;

        // 6. Recalculate finalAmount if a coupon is applied
        if (order.appliedCoupon) {
            const coupon = await CouponModel.findOne({ code: order.appliedCoupon, isActive: true });
            let discount = 0;
            if (coupon) {
                if (coupon.discountType === "percentage") {
                    discount = (totalAmount * coupon.discountValue) / 100;
                    if (coupon.maxDiscount && discount > coupon.maxDiscount) discount = coupon.maxDiscount;
                } else {
                    discount = coupon.discountValue;
                }
                if (discount > totalAmount) discount = totalAmount;
            }
            order.discount = discount;
            order.finalAmount = totalAmount - discount;
        } else {
            order.discount = 0;
            order.finalAmount = totalAmount;
        }

        await order.save();

        return sendSuccessResponse(res, "Order updated successfully", order);
    } catch (error) {
        console.error("Error updating order:", error);
        return sendErrorResponse(res, 500, "Error updating order", error?.message || error);
    }
};

export const deleteMyOrderController = async (req, res) => {
    try {
        const userId = req?.user?.id;
        const { itemId } = req.params;

        // 1. Validate userId and itemId
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return sendBadRequestResponse(res, "Invalid or missing userId");
        }
        if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
            return sendBadRequestResponse(res, "Invalid or missing itemId");
        }

        // 2. Find the order containing the item and populate productId
        const order = await orderModel.findOne({ userId, "items._id": itemId }).populate("items.productId");
        if (!order) {
            return sendNotFoundResponse(res, "Order containing this item not found for this user");
        }

        const item = order.items.id(itemId);
        if (!item) {
            return sendNotFoundResponse(res, "Item not found in this order");
        }

        // 3. Remove the item
        item.deleteOne();

        // 4. If no items left, delete the whole order
        if (order.items.length === 0) {
            await orderModel.deleteOne({ _id: order._id });
            return sendSuccessResponse(res, "Order deleted completely (no items left)", null);
        }

        // 5. Recalculate totalAmount
        let totalAmount = 0;
        order.items.forEach(i => {
            const price = i.productId?.price || 0;
            totalAmount += price * i.quantity;
        });
        order.totalAmount = totalAmount;

        // 6. Recalculate finalAmount if a coupon is applied
        if (order.appliedCoupon) {
            const coupon = await CouponModel.findOne({ code: order.appliedCoupon, isActive: true });
            let discount = 0;
            if (coupon) {
                if (coupon.discountType === "percentage") {
                    discount = (totalAmount * coupon.discountValue) / 100;
                    if (coupon.maxDiscount && discount > coupon.maxDiscount) discount = coupon.maxDiscount;
                } else if (coupon.discountType === "flat") {
                    discount = coupon.discountValue;
                }
                if (discount > totalAmount) discount = totalAmount;
            }
            order.discount = discount;
            order.finalAmount = totalAmount - discount;
        } else {
            order.discount = 0;
            order.finalAmount = totalAmount;
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
        const { orderId, itemId } = req.params; // orderId for full order, itemId for single item
        const { reasonForCancel, comment } = req.body;

        // 1. Validate userId
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return sendBadRequestResponse(res, "Invalid or missing userId");
        }

        // 2. Validate reason for cancellation
        if (!reasonForCancel || reasonForCancel.trim() === "") {
            return sendBadRequestResponse(res, "Reason for cancellation is required");
        }

        let order;
        let totalAmount = 0;

        if (itemId) {
            // Cancel single item
            if (!mongoose.Types.ObjectId.isValid(itemId)) {
                return sendBadRequestResponse(res, "Invalid or missing itemId");
            }

            order = await orderModel.findOne({ userId, "items._id": itemId }).populate("items.productId");
            if (!order) return sendNotFoundResponse(res, "Order containing this item not found");

            const item = order.items.id(itemId);
            if (!item) return sendNotFoundResponse(res, "Item not found in order");

            if (item.status === "cancelled") return sendBadRequestResponse(res, "Item is already cancelled");
            if (item.status === "delivered") return sendBadRequestResponse(res, "Cannot cancel a delivered item");

            // Cancel the item
            item.status = "cancelled";
            item.reasonForCancel = reasonForCancel;
            item.comment = comment || null;

        } else {
            // Cancel entire order
            if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
                return sendBadRequestResponse(res, "Invalid or missing orderId");
            }

            order = await orderModel.findOne({ _id: orderId, userId }).populate("items.productId");
            if (!order) return sendNotFoundResponse(res, "Order not found");

            if (order.status === "cancelled") return sendBadRequestResponse(res, "Order is already cancelled");

            // Cancel all items
            order.items.forEach(item => {
                if (item.status !== "delivered") {
                    item.status = "cancelled";
                    item.reasonForCancel = reasonForCancel;
                    item.comment = comment || null;
                }
            });

            order.status = "cancelled";
            order.reasonForCancel = reasonForCancel;
            order.comment = comment || null;
        }

        // 3. Recalculate totalAmount excluding cancelled items
        order.items.forEach(item => {
            if (item.status !== "cancelled") {
                totalAmount += item.productId?.price || 0 * item.quantity;
            }
        });
        order.totalAmount = totalAmount;

        // 4. Recalculate finalAmount considering applied coupon
        if (order.appliedCoupon) {
            const coupon = await CouponModel.findOne({ code: order.appliedCoupon, isActive: true });
            let discount = 0;

            if (coupon) {
                if (totalAmount < coupon.minOrderValue) {
                    // Remove coupon if order total below minimum
                    order.appliedCoupon = null;
                } else {
                    if (coupon.discountType === "percentage") {
                        discount = (totalAmount * coupon.discountValue) / 100;
                        if (coupon.maxDiscount && discount > coupon.maxDiscount) discount = coupon.maxDiscount;
                    } else if (coupon.discountType === "flat") {
                        discount = coupon.discountValue;
                    }
                    if (discount > totalAmount) discount = totalAmount;
                }
            }
            order.discount = discount;
            order.finalAmount = totalAmount - discount;
        } else {
            order.discount = 0;
            order.finalAmount = totalAmount;
        }

        await order.save();

        return sendSuccessResponse(res, itemId ? "Order item cancelled successfully" : "Order cancelled successfully", order);

    } catch (error) {
        console.error("Error cancelling order:", error);
        return sendErrorResponse(res, 500, "Error cancelling order", error?.message || error);
    }
};

export const sellerChangeOrderStatusController = async (req, res) => {
    try {
        const sellerId = req?.user?.id; // seller id from JWT
        const { orderId, itemId } = req.params; // itemId optional
        const { status } = req.body;

        const allowedStatus = ["pending", "packing", "out for delivery", "delivered", "cancelled"];

        // 1️⃣ Validate sellerId
        if (!sellerId || !mongoose.Types.ObjectId.isValid(sellerId)) {
            return res.status(400).json({ success: false, message: "Seller ID is missing or invalid. Please login again." });
        }

        // 2️⃣ Validate status
        if (!status || !allowedStatus.includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Please select a valid status: Pending, Packing, Out for Delivery, Delivered, or Cancelled."
            });
        }

        let order;

        // 3️⃣ Update single item
        if (itemId) {
            if (!mongoose.Types.ObjectId.isValid(itemId)) {
                return res.status(400).json({ success: false, message: "The item you are trying to update is invalid." });
            }

            order = await orderModel.findOne({
                items: { $elemMatch: { _id: itemId, sellerId: sellerId } }
            }).populate("items.productId");

            if (!order) return res.status(404).json({ success: false, message: "Sorry, we couldn’t find this item in your orders." });

            const item = order.items.id(itemId);

            // Prevent invalid changes
            if (item.status === "cancelled" && status !== "cancelled") {
                return res.status(400).json({ success: false, message: "This item was cancelled and its status cannot be changed." });
            }
            if (item.status === "delivered" && status !== "delivered") {
                return res.status(400).json({ success: false, message: "This item is already delivered and cannot be updated." });
            }

            item.status = status;

        } else {
            // 4️⃣ Update all items for this seller
            if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
                return res.status(400).json({ success: false, message: "Order ID is invalid." });
            }

            order = await orderModel.findOne({
                _id: orderId,
                items: { $elemMatch: { sellerId: sellerId } }
            }).populate("items.productId");

            if (!order) return res.status(404).json({ success: false, message: "We couldn’t find any order matching your selection." });

            order.items.forEach(item => {
                if (item.sellerId.toString() === sellerId) {
                    if (item.status !== "delivered" && item.status !== "cancelled") {
                        item.status = status;
                    }
                }
            });
        }

        // 5️⃣ Recalculate totalAmount excluding cancelled items
        let totalAmount = 0;
        order.items.forEach(i => {
            if (i.status !== "cancelled") {
                totalAmount += (i.productId?.price || 0) * i.quantity;
            }
        });
        order.totalAmount = totalAmount;

        // 6️⃣ Recalculate finalAmount with coupon if applied
        if (order.appliedCoupon) {
            const coupon = await couponModel.findOne({ code: order.appliedCoupon, isActive: true });
            let discount = 0;

            if (coupon) {
                if (totalAmount < coupon.minOrderValue) {
                    order.appliedCoupon = null;
                } else {
                    if (coupon.discountType === "percentage") {
                        discount = (totalAmount * coupon.discountValue) / 100;
                        if (coupon.maxDiscount && discount > coupon.maxDiscount) discount = coupon.maxDiscount;
                    } else if (coupon.discountType === "flat") {
                        discount = coupon.discountValue;
                    }
                    if (discount > totalAmount) discount = totalAmount;
                }
            }
            order.discount = discount;
            order.finalAmount = totalAmount - discount;
        } else {
            order.discount = 0;
            order.finalAmount = totalAmount;
        }

        // 7️⃣ Calculate overall orderStatus based on item statuses
        const itemStatuses = order.items.map(i => i.status);
        if (itemStatuses.every(s => s === "delivered")) {
            order.orderStatus = "completed";
        } else if (itemStatuses.every(s => s === "cancelled")) {
            order.orderStatus = "cancelled";
        } else {
            order.orderStatus = "processing";
        }

        await order.save();

        return res.status(200).json({
            success: true,
            message: itemId ? "Order item status updated successfully." : "Order status updated successfully.",
            order
        });

    } catch (error) {
        console.error("Error updating order status:", error);
        return res.status(500).json({
            success: false,
            message: "Error updating order status.",
            error: error.message
        });
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

