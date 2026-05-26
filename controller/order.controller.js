import mongoose from "mongoose";
import { sendBadRequestResponse, sendErrorResponse, sendNotFoundResponse, sendSuccessResponse } from "../utils/Response.utils.js";
import UserModel from "../model/user.model.js";
import orderModel from "../model/order.model.js";
import productModel from "../model/product.model.js";
import cartModel from "../model/cart.model.js";
import CouponModel from "../model/coupon.model.js";
import paymentModel from "../model/payment.model.js";
import couponModel from "../model/coupon.model.js";


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

        // 4. Enrich items with sellerId and calculate subtotal based on pack sizes
        let subtotal = 0;
        const itemsWithSeller = await Promise.all(
            items.map(async (item) => {
                const product = await productModel.findById(item.productId).select("sellerId price packSizes");
                if (!product) {
                    throw new Error(`Product not found for productId: ${item.productId}`);
                }

                const selectedPack = product.packSizes?.find(
                    (p) => p._id.toString() === item.packSizeId.toString()
                );
                const effectivePrice = selectedPack ? selectedPack.price : product.price || 0;

                subtotal += effectivePrice * item.quantity;

                return {
                    ...item,
                    sellerId: product.sellerId
                };
            })
        );

        const deliveryCharges = 20;

        // Calculate coupon discount if applied
        let discount = 0;
        if (appliedCoupon) {
            const coupon = await CouponModel.findOne({ code: appliedCoupon.toUpperCase(), isActive: true });
            if (coupon && coupon.expiryDate >= new Date()) {
                let eligibleAmount = 0;
                for (const item of items) {
                    const product = await productModel.findById(item.productId);
                    if (product) {
                        const selectedPack = product.packSizes?.find(
                            p => p._id.toString() === item.packSizeId.toString()
                        );
                        const price = selectedPack ? selectedPack.price : product.price || 0;
                        const itemTotal = price * item.quantity;

                        if (!coupon.sellerId || (product.sellerId && product.sellerId.toString() === coupon.sellerId.toString())) {
                            eligibleAmount += itemTotal;
                        }
                    }
                }

                if (eligibleAmount >= coupon.minOrderValue) {
                    if (coupon.discountType === "percentage") {
                        discount = (eligibleAmount * coupon.discountValue) / 100;
                        if (coupon.maxDiscount && discount > coupon.maxDiscount) {
                            discount = coupon.maxDiscount;
                        }
                    } else if (coupon.discountType === "flat") {
                        discount = coupon.discountValue;
                    }
                    if (discount > eligibleAmount) {
                        discount = eligibleAmount;
                    }
                }
            }
        }

        // 5. Check for existing pending order
        let order = await orderModel.findOne({ userId, "items.status": { $ne: "delivered" } });

        if (order) {
            // Append items to existing order
            order.items.push(...itemsWithSeller);

            // Recalculate subtotal of all items in the order
            let newSubtotal = 0;
            for (const item of order.items) {
                const product = await productModel.findById(item.productId);
                if (product) {
                    const selectedPack = product.packSizes?.find(
                        p => p._id.toString() === item.packSizeId.toString()
                    );
                    const price = selectedPack ? selectedPack.price : product.price || 0;
                    newSubtotal += price * item.quantity;
                }
            }

            // Recalculate coupon discount for the order
            let newDiscount = 0;
            const activeCouponCode = appliedCoupon || order.appliedCoupon;
            if (activeCouponCode) {
                const coupon = await CouponModel.findOne({ code: activeCouponCode.toUpperCase(), isActive: true });
                if (coupon && coupon.expiryDate >= new Date()) {
                    let eligibleAmount = 0;
                    for (const item of order.items) {
                        const product = await productModel.findById(item.productId);
                        if (product) {
                            const selectedPack = product.packSizes?.find(
                                p => p._id.toString() === item.packSizeId.toString()
                            );
                            const price = selectedPack ? selectedPack.price : product.price || 0;
                            const itemTotal = price * item.quantity;

                            if (!coupon.sellerId || (product.sellerId && product.sellerId.toString() === coupon.sellerId.toString())) {
                                eligibleAmount += itemTotal;
                            }
                        }
                    }

                    if (eligibleAmount >= coupon.minOrderValue) {
                        if (coupon.discountType === "percentage") {
                            newDiscount = (eligibleAmount * coupon.discountValue) / 100;
                            if (coupon.maxDiscount && newDiscount > coupon.maxDiscount) {
                                newDiscount = coupon.maxDiscount;
                            }
                        } else if (coupon.discountType === "flat") {
                            newDiscount = coupon.discountValue;
                        }
                        if (newDiscount > eligibleAmount) {
                            newDiscount = eligibleAmount;
                        }
                        order.appliedCoupon = activeCouponCode.toUpperCase();
                    }
                }
            }

            order.discount = newDiscount;
            order.totalAmount = newSubtotal + platformFee + deliveryCharges;
            order.finalAmount = newSubtotal - newDiscount + platformFee + deliveryCharges;
            if (!order.statusTimeline) order.statusTimeline = {};
            if (!order.statusTimeline.confirmedAt) order.statusTimeline.confirmedAt = new Date();

            await order.save();

            return sendSuccessResponse(res, "Order updated successfully (items appended)", order);
        } else {
            // Create unique custom orderId (format: ABC - 123456)
            let uniqueOrderId;
            let exists = true;
            while (exists) {
                const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
                let randomLetters = "";
                for (let i = 0; i < 3; i++) {
                    randomLetters += letters.charAt(Math.floor(Math.random() * letters.length));
                }
                const digits = "0123456789";
                let randomDigits = "";
                for (let i = 0; i < 6; i++) {
                    randomDigits += digits.charAt(Math.floor(Math.random() * digits.length));
                }
                uniqueOrderId = `${randomLetters} - ${randomDigits}`;
                
                const existingOrder = await orderModel.findOne({ orderId: uniqueOrderId });
                if (!existingOrder) {
                    exists = false;
                }
            }

            // Create new order
            const newOrder = new orderModel({
                orderId: uniqueOrderId,
                userId,
                items: itemsWithSeller,
                deliveryAddress: selectedAddress,
                platformFee: platformFee,
                totalAmount: subtotal + platformFee + deliveryCharges,
                discount: discount,
                finalAmount: subtotal - discount + platformFee + deliveryCharges,
                appliedCoupon: appliedCoupon ? appliedCoupon.toUpperCase() : null,
                statusTimeline: {
                    confirmedAt: new Date()
                }
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
                select: "productName images price packSizes",
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

        const formattedOrders = myOrders.map(order => {
            const orderObj = order.toObject();
            orderObj.items = orderObj.items.map(item => {
                if (item.productId && item.productId.packSizes) {
                    const matchedPack = item.productId.packSizes.find(
                        p => p._id.toString() === item.packSizeId.toString()
                    );
                    if (matchedPack) {
                        item.selectedPackSize = {
                            weight: matchedPack.weight,
                            unit: matchedPack.unit,
                            price: matchedPack.price
                        };
                    } else {
                        item.selectedPackSize = null;
                    }
                } else {
                    item.selectedPackSize = null;
                }
                return item;
            });
            return orderObj;
        });

        return sendSuccessResponse(res, "My orders fetched successfully", {
            total: formattedOrders.length,
            orders: formattedOrders,
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
        const { orderId } = req.params;
        const { reasonForCancel, comment } = req.body;

        // 1. Validate userId
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return sendBadRequestResponse(res, "Invalid or missing userId");
        }

        // 2. Validate reason for cancellation
        if (!reasonForCancel || reasonForCancel.trim() === "") {
            return sendBadRequestResponse(res, "Reason for cancellation is required");
        }

        if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
            return sendBadRequestResponse(res, "Invalid or missing orderId");
        }

        let order;
        let totalAmount = 0;

        // Find the order by orderId
        order = await orderModel.findOne({ _id: orderId, userId }).populate("items.productId");

        if (!order) {
            return sendNotFoundResponse(res, "Order not found");
        }

        // Check if the order is already cancelled
        if (order.status === "cancelled" || order.orderStatus === "cancelled") {
            return sendBadRequestResponse(res, "Order is already cancelled");
        }

        // Check if all items are already delivered
        const allDelivered = order.items.every(item => item.status === "delivered");
        if (allDelivered) {
            return sendBadRequestResponse(res, "Cannot cancel this order as all items are already delivered");
        }

        // Cancel all non-delivered items
        order.items.forEach(item => {
            if (item.status !== "delivered" && item.status !== "cancelled") {
                item.status = "cancelled";
                item.reasonForCancel = reasonForCancel;
                item.comment = comment || null;
            }
        });

        order.status = "cancelled";
        order.orderStatus = "cancelled";
        order.reasonForCancel = reasonForCancel;
        order.comment = comment || null;

        // 3. Recalculate totalAmount excluding cancelled items
        order.items.forEach(item => {
            if (item.status !== "cancelled") {
                totalAmount += (item.productId?.price || 0) * item.quantity;
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

        // Check payment method for refund
        const payment = await paymentModel.findOne({ orderId: order._id });
        if (payment) {
            if (payment.paymentMethod === "credit_card" || payment.paymentMethod === "upi") {
                payment.refundStatus = "refund initiated";
                order.refundStatus = "refund initiated";

                payment.refundTimeline = {
                    initiatedAt: new Date(),
                    processingAt: null,
                    deliveredAt: null
                };
                order.refundTimeline = {
                    initiatedAt: new Date(),
                    processingAt: null,
                    deliveredAt: null
                };

                await payment.save();
            }
        }

        if (!order.statusTimeline) order.statusTimeline = {};
        order.statusTimeline.cancelledAt = new Date();

        await order.save();

        return sendSuccessResponse(res, "Order cancelled successfully", order);

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

        // 3️⃣ Find the order by orderId or itemId
        if (orderId && mongoose.Types.ObjectId.isValid(orderId)) {
            order = await orderModel.findById(orderId).populate("items.productId");
        } else if (itemId && mongoose.Types.ObjectId.isValid(itemId)) {
            order = await orderModel.findOne({ "items._id": itemId }).populate("items.productId");
        }

        if (!order) {
            return res.status(404).json({ success: false, message: "We couldn’t find any order matching your selection." });
        }

        // 4️⃣ Verify that this seller has items in this order
        const hasSellerItem = order.items.some(item => item.sellerId.toString() === sellerId.toString());
        if (!hasSellerItem) {
            return res.status(403).json({ success: false, message: "You are not authorized to update this order." });
        }

        // 5️⃣ Update status of all non-cancelled items in the order
        order.items.forEach(item => {
            if (item.status !== "cancelled") {
                item.status = status;
            }
        });

        // 6️⃣ Recalculate totalAmount and finalAmount
        let totalAmount = 0;
        order.items.forEach(i => {
            if (i.status !== "cancelled") {
                totalAmount += (i.productId?.price || 0) * i.quantity;
            }
        });
        order.totalAmount = totalAmount;

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
            order.status = "completed";
        } else if (itemStatuses.every(s => s === "cancelled")) {
            order.orderStatus = "cancelled";
            order.status = "cancelled";
        } else if (itemStatuses.every(s => s === "pending")) {
            order.orderStatus = "Pending";
            order.status = "Pending";
        } else {
            order.orderStatus = "processing";
            order.status = "processing";
        }

        // 8️⃣ Handle payment status changes order-wise
        if (status === "delivered") {
            order.paymentStatus = "Paid";
            const payment = await paymentModel.findOne({ orderId: order._id });
            if (payment) {
                payment.paymentStatus = "Paid";
                payment.paymentDate = new Date();
                await payment.save();
            }
        } else {
            // For COD, if not all items are delivered yet, ensure the payment status remains "Pending"
            const payment = await paymentModel.findOne({ orderId: order._id });
            if (payment && payment.paymentMethod === "cash_on_delivery" && payment.paymentStatus !== "Paid") {
                order.paymentStatus = "Pending";
                payment.paymentStatus = "Pending";
                await payment.save();
            }
        }

        // Update status timeline
        if (!order.statusTimeline) {
            order.statusTimeline = {};
        }
        if (status === "pending") {
            order.statusTimeline.confirmedAt = new Date();
        } else if (status === "packing") {
            order.statusTimeline.processingAt = new Date();
        } else if (status === "out for delivery") {
            order.statusTimeline.shippedAt = new Date();
        } else if (status === "delivered") {
            order.statusTimeline.deliveredAt = new Date();
        } else if (status === "cancelled") {
            order.statusTimeline.cancelledAt = new Date();
        }

        await order.save();

        return res.status(200).json({
            success: true,
            message: "Order status updated successfully.",
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

export const getOrderTimelineController = async (req, res) => {
    try {
        const userId = req?.user?.id;
        const { orderId } = req.params;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return sendBadRequestResponse(res, "Invalid or missing userId");
        }
        if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
            return sendBadRequestResponse(res, "Invalid or missing orderId");
        }

        const order = await orderModel.findOne({ _id: orderId, userId })
            .populate({
                path: "items.productId",
                select: "productName price images productImage packSizes"
            });

        if (!order) {
            return sendNotFoundResponse(res, "Order not found");
        }

        const formatTimelineEvent = (date) => {
            if (!date) return null;
            const d = new Date(date);
            if (isNaN(d.getTime())) return null;

            const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(d);
            const formatted = new Intl.DateTimeFormat('en-US', {
                weekday: 'short',
                month: 'short',
                day: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            }).format(d);

            return {
                raw: date,
                formatted,
                dayName
            };
        };

        const statusTimeline = {};
        if (order.statusTimeline) {
            const st = order.statusTimeline.toObject ? order.statusTimeline.toObject() : order.statusTimeline;
            statusTimeline.confirmedAt = formatTimelineEvent(st.confirmedAt);
            statusTimeline.processingAt = formatTimelineEvent(st.processingAt);
            statusTimeline.shippedAt = formatTimelineEvent(st.shippedAt);
            statusTimeline.deliveredAt = formatTimelineEvent(st.deliveredAt);
            statusTimeline.cancelledAt = formatTimelineEvent(st.cancelledAt);
        } else {
            statusTimeline.confirmedAt = null;
            statusTimeline.processingAt = null;
            statusTimeline.shippedAt = null;
            statusTimeline.deliveredAt = null;
            statusTimeline.cancelledAt = null;
        }

        const refundTimeline = {};
        if (order.refundTimeline) {
            const rt = order.refundTimeline.toObject ? order.refundTimeline.toObject() : order.refundTimeline;
            refundTimeline.initiatedAt = formatTimelineEvent(rt.initiatedAt);
            refundTimeline.processingAt = formatTimelineEvent(rt.processingAt);
            refundTimeline.deliveredAt = formatTimelineEvent(rt.deliveredAt);
        } else {
            refundTimeline.initiatedAt = null;
            refundTimeline.processingAt = null;
            refundTimeline.deliveredAt = null;
        }

        const orderObj = order.toObject();
        const formattedItems = orderObj.items.map(item => {
            if (item.productId && item.productId.packSizes) {
                const matchedPack = item.productId.packSizes.find(
                    p => p._id.toString() === item.packSizeId.toString()
                );
                if (matchedPack) {
                    item.selectedPackSize = {
                        weight: matchedPack.weight,
                        unit: matchedPack.unit,
                        price: matchedPack.price
                    };
                } else {
                    item.selectedPackSize = null;
                }
            } else {
                item.selectedPackSize = null;
            }
            return item;
        });

        return sendSuccessResponse(res, "Order timeline retrieved successfully", {
            orderId: order._id,
            totalAmount: order.totalAmount,
            discount: order.discount,
            finalAmount: order.finalAmount,
            orderStatus: order.orderStatus || order.status,
            paymentStatus: order.paymentStatus,
            refundStatus: order.refundStatus,
            statusTimeline,
            refundTimeline,
            items: formattedItems
        });
    } catch (error) {
        console.error("Error fetching order timeline:", error);
        return sendErrorResponse(res, 500, "Error fetching order timeline", error.message || error);
    }
};

export const getUserOrdersByStatusController = async (req, res) => {
    try {
        const userId = req?.user?.id;
        const { status } = req.params;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return sendBadRequestResponse(res, "Invalid or missing userId");
        }

        const allowedFilterStatuses = ["delivered", "cancelled", "in_progress"];
        if (!status || !allowedFilterStatuses.includes(status)) {
            return sendBadRequestResponse(
                res,
                `Status parameter is required and must be one of: ${allowedFilterStatuses.join(", ")}`
            );
        }

        let query = { userId };

        if (status === "delivered") {
            query.$or = [
                { orderStatus: "completed" },
                { status: "completed" },
                { orderStatus: "delivered" },
                { status: "delivered" }
            ];
        } else if (status === "cancelled") {
            query.$or = [
                { orderStatus: "cancelled" },
                { status: "cancelled" }
            ];
        } else if (status === "in_progress") {
            query.$or = [
                { orderStatus: "Pending" },
                { status: "Pending" },
                { orderStatus: "processing" },
                { status: "processing" }
            ];
        }

        const orders = await orderModel.find(query)
            .populate({
                path: "items.sellerId",
                select: "name email phone businessName storeName"
            })
            .populate({
                path: "items.productId",
                select: "productName price images productImage packSizes"
            });

        const formattedOrders = orders.map(order => {
            const orderObj = order.toObject();
            orderObj.items = orderObj.items.map(item => {
                if (item.productId && item.productId.packSizes) {
                    const matchedPack = item.productId.packSizes.find(
                        p => p._id.toString() === item.packSizeId.toString()
                    );
                    if (matchedPack) {
                        item.selectedPackSize = {
                            weight: matchedPack.weight,
                            unit: matchedPack.unit,
                            price: matchedPack.price
                        };
                    } else {
                        item.selectedPackSize = null;
                    }
                } else {
                    item.selectedPackSize = null;
                }
                return item;
            });
            return orderObj;
        });

        return sendSuccessResponse(res, `Orders with status ${status} retrieved successfully`, {
            total: formattedOrders.length,
            orders: formattedOrders
        });
    } catch (error) {
        console.error("Error filtering user orders by status:", error);
        return sendErrorResponse(res, 500, "Error filtering user orders by status", error.message || error);
    }
};