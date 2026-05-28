import mongoose from "mongoose";
import { sendBadRequestResponse, sendErrorResponse, sendNotFoundResponse, sendSuccessResponse } from "../utils/Response.utils.js";
import UserModel from "../model/user.model.js";
import orderModel from "../model/order.model.js";
import productModel from "../model/product.model.js";
import variantModel from "../model/variant.model.js";
import stockModel from "../model/stock.model.js";
import cartModel from "../model/cart.model.js";
import CouponModel from "../model/coupon.model.js";
import paymentModel from "../model/payment.model.js";
import couponModel from "../model/coupon.model.js";
import { checkStockAvailability, updateStock } from "../utils/stock.utils.js";
import { getCurrencyRate, convertPrice } from "../utils/currency.utils.js";

const ratesMap = {
    USD: 1.0,
    INR: 83.0,
    AED: 3.67,
    NZD: 1.65
};

export const selectUserAddressController = async (req, res) => {
    try {
        const userId = req?.user?.id;
        const { addressId } = req?.params;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return sendBadRequestResponse(res, "Invalid or missing userId");
        }
        if (!addressId || !mongoose.Types.ObjectId.isValid(addressId)) {
            return sendBadRequestResponse(res, "Invalid or missing addressId");
        }

        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const address = user.address.id(addressId);
        if (!address) {
            return res.status(404).json({ message: "Address not found for this user" });
        }

        if (user.selectedAddress?.toString() === addressId) {
            return sendSuccessResponse(res, "Address already selected", {
                selectedAddress: user.selectedAddress
            });
        }

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

        const platformFeeVal = 1;

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
            if (!item.variantId || !mongoose.Types.ObjectId.isValid(item.variantId)) {
                return sendBadRequestResponse(res, `Invalid or missing variantId at index ${index}`);
            }
            if (!item.quantity || item.quantity < 1) {
                return sendBadRequestResponse(res, `Quantity must be >= 1 at index ${index}`);
            }
        }

        const stockCheck = await checkStockAvailability(items);
        if (!stockCheck.isValid) {
            return sendBadRequestResponse(res, stockCheck.message);
        }

        await updateStock(items, -1);

        try {
            const user = await UserModel.findById(userId);
            if (!user) {
                await updateStock(items, 1);
                return sendNotFoundResponse(res, "User not found");
            }
            if (!user.selectedAddress) {
                await updateStock(items, 1);
                return sendNotFoundResponse(res, "No selected address found. Please select an address first.");
            }

            const selectedAddress = user.address.id(user.selectedAddress);
            if (!selectedAddress) {
                await updateStock(items, 1);
                return sendNotFoundResponse(res, "Selected address not found in user addresses");
            }

            const { rate, currency } = getCurrencyRate(user);

            let subtotal = 0;
            const itemsWithSeller = await Promise.all(
                items.map(async (item) => {
                    const variant = await variantModel.findById(item.variantId).populate("productId");
                    if (!variant) {
                        throw new Error(`Variant not found for variantId: ${item.variantId}`);
                    }

                    const convertedVariantPrice = convertPrice(variant.price, rate);
                    subtotal += convertedVariantPrice * item.quantity;

                    return {
                        ...item,
                        sellerId: variant.productId.sellerId
                    };
                })
            );

            const deliveryCharges = convertPrice(20, rate);
            const platformFee = convertPrice(platformFeeVal, rate);

            let discount = 0;
            if (appliedCoupon) {
                const coupon = await CouponModel.findOne({ code: appliedCoupon.toUpperCase(), isActive: true });
                if (coupon && coupon.expiryDate >= new Date()) {
                    let eligibleAmount = 0;
                    for (const item of items) {
                        const variant = await variantModel.findById(item.variantId).populate("productId");
                        if (variant) {
                            const price = convertPrice(variant.price || 0, rate);
                            const itemTotal = price * item.quantity;

                            if (!coupon.sellerId || (variant.productId.sellerId && variant.productId.sellerId.toString() === coupon.sellerId.toString())) {
                                eligibleAmount += itemTotal;
                            }
                        }
                    }

                    const minOrderValInCurrency = convertPrice(coupon.minOrderValue, rate);

                    if (eligibleAmount >= minOrderValInCurrency) {
                        if (coupon.discountType === "percentage") {
                            discount = (eligibleAmount * coupon.discountValue) / 100;
                            const maxDiscountInCurrency = coupon.maxDiscount ? convertPrice(coupon.maxDiscount, rate) : null;
                            if (maxDiscountInCurrency && discount > maxDiscountInCurrency) {
                                discount = maxDiscountInCurrency;
                            }
                        } else if (coupon.discountType === "flat") {
                            discount = convertPrice(coupon.discountValue, rate);
                        }
                        if (discount > eligibleAmount) {
                            discount = eligibleAmount;
                        }
                    }
                }
            }

            let order = await orderModel.findOne({ userId, "items.status": { $ne: "delivered" } });

            if (order) {
                order.items.push(...itemsWithSeller);

                let newSubtotal = 0;
                for (const item of order.items) {
                    const variant = await variantModel.findById(item.variantId);
                    if (variant) {
                        newSubtotal += convertPrice(variant.price, rate) * item.quantity;
                    }
                }

                let newDiscount = 0;
                const activeCouponCode = appliedCoupon || order.appliedCoupon;
                if (activeCouponCode) {
                    const coupon = await CouponModel.findOne({ code: activeCouponCode.toUpperCase(), isActive: true });
                    if (coupon && coupon.expiryDate >= new Date()) {
                        let eligibleAmount = 0;
                        for (const item of order.items) {
                            const variant = await variantModel.findById(item.variantId).populate("productId");
                            if (variant) {
                                const price = convertPrice(variant.price || 0, rate);
                                const itemTotal = price * item.quantity;

                                if (!coupon.sellerId || (variant.productId.sellerId && variant.productId.sellerId.toString() === coupon.sellerId.toString())) {
                                    eligibleAmount += itemTotal;
                                }
                            }
                        }

                        const minOrderValInCurrency = convertPrice(coupon.minOrderValue, rate);

                        if (eligibleAmount >= minOrderValInCurrency) {
                            if (coupon.discountType === "percentage") {
                                newDiscount = (eligibleAmount * coupon.discountValue) / 100;
                                const maxDiscountInCurrency = coupon.maxDiscount ? convertPrice(coupon.maxDiscount, rate) : null;
                                if (maxDiscountInCurrency && newDiscount > maxDiscountInCurrency) {
                                    newDiscount = maxDiscountInCurrency;
                                }
                            } else if (coupon.discountType === "flat") {
                                newDiscount = convertPrice(coupon.discountValue, rate);
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
                order.currency = currency;
                if (!order.statusTimeline) order.statusTimeline = {};
                if (!order.statusTimeline.confirmedAt) order.statusTimeline.confirmedAt = new Date();

                await order.save();

                return sendSuccessResponse(res, "Order updated successfully (items appended)", order);
            } else {
                let uniqueOrderId;
                let exists = true;
                while (exists) {
                    uniqueOrderId = "ORD-" + Math.floor(100000 + Math.random() * 900000);
                    const check = await orderModel.findOne({ orderId: uniqueOrderId });
                    if (!check) exists = false;
                }

                const newOrder = await orderModel.create({
                    orderId: uniqueOrderId,
                    userId,
                    items: itemsWithSeller,
                    deliveryAddress: selectedAddress,
                    totalAmount: subtotal + platformFee + deliveryCharges,
                    discount,
                    finalAmount: subtotal - discount + platformFee + deliveryCharges,
                    appliedCoupon: appliedCoupon ? appliedCoupon.toUpperCase() : null,
                    orderStatus: "Pending",
                    status: "Pending",
                    paymentStatus: "Pending",
                    currency: currency,
                    statusTimeline: {
                        confirmedAt: new Date()
                    }
                });

                return sendSuccessResponse(res, "Order placed successfully", newOrder);
            }

        } catch (dbError) {
            await updateStock(items, 1);
            throw dbError;
        }

    } catch (error) {
        console.error("Error creating order:", error);
        return sendErrorResponse(res, 500, "Error while placing order", error.message || error);
    }
};

export const myOrderController = async (req, res) => {
    try {
        const { id: userId } = req?.user;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return sendBadRequestResponse(res, "User ID not found or invalid!");
        }

        const myOrders = await orderModel
            .find({ userId })
            .populate({
                path: "items.sellerId",
                select: "name email phone"
            })
            .populate({
                path: "items.productId",
                select: "productName"
            })
            .populate("items.variantId")
            .populate({
                path: "userId",
                select: "name email"
            });

        if (!myOrders || myOrders.length === 0) {
            return sendNotFoundResponse(res, "No orders found");
        }

        const formattedOrders = myOrders.map(order => {
            const orderObj = order.toObject();
            const orderRate = ratesMap[orderObj.currency] || 1.0;
            orderObj.items = orderObj.items.map(item => {
                if (item.variantId) {
                    item.selectedPackSize = {
                        weight: item.variantId.weight,
                        unit: item.variantId.unit,
                        price: convertPrice(item.variantId.price, orderRate),
                        variantImage: item.variantId.variantImage
                    };
                } else {
                    item.selectedPackSize = null;
                }
                return item;
            });
            return orderObj;
        });

        return sendSuccessResponse(res, "All My Order Fetched Successfully", {
            total: formattedOrders.length,
            orders: formattedOrders
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

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return sendBadRequestResponse(res, "Invalid or missing userId");
        }
        if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
            return sendBadRequestResponse(res, "Invalid or missing orderId");
        }

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

        let order = await orderModel.findOne({ _id: orderId, userId }).populate("items.variantId");
        if (!order) {
            return sendNotFoundResponse(res, "Order not found for this user");
        }

        const itemsToUpdateStock = [];
        if (items) {
            for (const updateItem of items) {
                const orderItem = order.items.id(updateItem._id);
                if (orderItem) {
                    const variant = await variantModel.findById(orderItem.variantId);
                    if (!variant) continue;

                    const oldQty = orderItem.quantity;
                    const oldStatus = orderItem.status;
                    const newQty = updateItem.quantity !== undefined ? updateItem.quantity : oldQty;
                    const newStatus = updateItem.status !== undefined ? updateItem.status : oldStatus;

                    if (oldStatus === "delivered" && (newQty !== oldQty || newStatus !== oldStatus)) {
                        return sendBadRequestResponse(res, `Cannot modify quantity or status of a delivered item`);
                    }

                    let qtyDelta = 0;
                    const wasCancelled = oldStatus === "cancelled";
                    const isCancelled = newStatus === "cancelled";

                    if (!wasCancelled && !isCancelled) {
                        qtyDelta = newQty - oldQty;
                    } else if (!wasCancelled && isCancelled) {
                        qtyDelta = -oldQty;
                    } else if (wasCancelled && !isCancelled) {
                        qtyDelta = newQty;
                    }

                    if (qtyDelta !== 0) {
                        itemsToUpdateStock.push({
                            productId: orderItem.productId,
                            variantId: orderItem.variantId,
                            quantity: Math.abs(qtyDelta),
                            direction: qtyDelta > 0 ? -1 : 1
                        });
                    }
                }
            }
        }

        const itemsToVerify = itemsToUpdateStock.filter(item => item.direction === -1);
        if (itemsToVerify.length > 0) {
            const stockCheck = await checkStockAvailability(itemsToVerify);
            if (!stockCheck.isValid) {
                return sendBadRequestResponse(res, stockCheck.message);
            }
        }

        const stockRollbackList = [];
        try {
            for (const item of itemsToUpdateStock) {
                await updateStock([item], item.direction);
                stockRollbackList.push({
                    productId: item.productId,
                    variantId: item.variantId,
                    quantity: item.quantity,
                    direction: -item.direction
                });
            }

            const orderRate = ratesMap[order.currency] || 1.0;
            let totalAmount = 0;

            if (items) {
                for (const updateItem of items) {
                    const orderItem = order.items.id(updateItem._id);
                    if (orderItem) {
                        if (updateItem.quantity !== undefined) orderItem.quantity = updateItem.quantity;
                        if (updateItem.status !== undefined) orderItem.status = updateItem.status;
                        if (updateItem.comment !== undefined) orderItem.comment = updateItem.comment;
                        if (updateItem.reasonForCancel !== undefined) orderItem.reasonForCancel = updateItem.reasonForCancel;

                        const variant = await variantModel.findById(orderItem.variantId);
                        const price = variant ? convertPrice(variant.price, orderRate) : 0;
                        totalAmount += price * orderItem.quantity;
                    }
                }
            }

            if (comment !== undefined) {
                order.comment = comment;
            }

            order.totalAmount = totalAmount;

            if (order.appliedCoupon) {
                const coupon = await CouponModel.findOne({ code: order.appliedCoupon, isActive: true });
                let discount = 0;
                if (coupon) {
                    if (coupon.discountType === "percentage") {
                        discount = (totalAmount * coupon.discountValue) / 100;
                        const maxDiscountInCurrency = coupon.maxDiscount ? convertPrice(coupon.maxDiscount, orderRate) : null;
                        if (maxDiscountInCurrency && discount > maxDiscountInCurrency) discount = maxDiscountInCurrency;
                    } else {
                        discount = convertPrice(coupon.discountValue, orderRate);
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
        } catch (saveError) {
            for (const item of stockRollbackList) {
                await updateStock([item], item.direction);
            }
            throw saveError;
        }

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

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return sendBadRequestResponse(res, "Invalid or missing userId");
        }
        if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
            return sendBadRequestResponse(res, "Invalid or missing itemId");
        }

        const order = await orderModel.findOne({ userId, "items._id": itemId }).populate("items.variantId");
        if (!order) {
            return sendNotFoundResponse(res, "Order containing this item not found for this user");
        }

        const item = order.items.id(itemId);
        if (!item) {
            return sendNotFoundResponse(res, "Item not found in this order");
        }

        let restoredStock = false;
        if (item.status !== "cancelled" && item.status !== "delivered") {
            await updateStock([{
                productId: item.productId,
                variantId: item.variantId,
                quantity: item.quantity
            }], 1);
            restoredStock = true;
        }

        try {
            item.deleteOne();

            if (order.items.length === 0) {
                await orderModel.deleteOne({ _id: order._id });
                return sendSuccessResponse(res, "Order deleted completely (no items left)", null);
            }

            const orderRate = ratesMap[order.currency] || 1.0;
            let totalAmount = 0;
            for (const i of order.items) {
                const variant = await variantModel.findById(i.variantId);
                const price = variant ? convertPrice(variant.price, orderRate) : 0;
                totalAmount += price * i.quantity;
            }
            order.totalAmount = totalAmount;

            if (order.appliedCoupon) {
                const coupon = await CouponModel.findOne({ code: order.appliedCoupon, isActive: true });
                let discount = 0;
                if (coupon) {
                    if (coupon.discountType === "percentage") {
                        discount = (totalAmount * coupon.discountValue) / 100;
                        const maxDiscountInCurrency = coupon.maxDiscount ? convertPrice(coupon.maxDiscount, orderRate) : null;
                        if (maxDiscountInCurrency && discount > maxDiscountInCurrency) discount = maxDiscountInCurrency;
                    } else if (coupon.discountType === "flat") {
                        discount = convertPrice(coupon.discountValue, orderRate);
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
        } catch (saveError) {
            if (restoredStock) {
                await updateStock([{
                    productId: item.productId,
                    variantId: item.variantId,
                    quantity: item.quantity
                }], -1);
            }
            throw saveError;
        }
        return sendSuccessResponse(res, "Item deleted from order successfully", order);

    } catch (error) {
        console.error("Error While Deleting Order Item:", error);
        return sendErrorResponse(res, 500, "Error While Deleting Order Item", error?.message || error);
    }
};

export const cancelMyOrderController = async (req, res) => {
    try {
        const userId = req?.user?.id;
        const { orderId } = req.params;
        const { reasonForCancel, comment } = req.body;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return sendBadRequestResponse(res, "Invalid or missing userId");
        }

        if (!reasonForCancel || reasonForCancel.trim() === "") {
            return sendBadRequestResponse(res, "Reason for cancellation is required");
        }

        if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
            return sendBadRequestResponse(res, "Invalid or missing orderId");
        }

        let order;
        let totalAmount = 0;

        order = await orderModel.findOne({ _id: orderId, userId }).populate("items.variantId");

        if (!order) {
            return sendNotFoundResponse(res, "Order not found");
        }

        if (order.status === "cancelled" || order.orderStatus === "cancelled") {
            return sendBadRequestResponse(res, "Order is already cancelled");
        }

        const allDelivered = order.items.every(item => item.status === "delivered");
        if (allDelivered) {
            return sendBadRequestResponse(res, "Cannot cancel this order as all items are already delivered");
        }

        const itemsToRestore = [];
        order.items.forEach(item => {
            if (item.status !== "delivered" && item.status !== "cancelled") {
                item.status = "cancelled";
                item.reasonForCancel = reasonForCancel;
                item.comment = comment || null;
                itemsToRestore.push({
                    productId: item.productId,
                    variantId: item.variantId,
                    quantity: item.quantity
                });
            }
        });

        if (itemsToRestore.length > 0) {
            await updateStock(itemsToRestore, 1);
        }

        try {
            order.status = "cancelled";
            order.orderStatus = "cancelled";
            order.reasonForCancel = reasonForCancel;
            order.comment = comment || null;

            const orderRate = ratesMap[order.currency] || 1.0;
            for (const item of order.items) {
                if (item.status !== "cancelled") {
                    const variant = await variantModel.findById(item.variantId);
                    const price = variant ? convertPrice(variant.price, orderRate) : 0;
                    totalAmount += price * item.quantity;
                }
            }
            order.totalAmount = totalAmount;

            if (order.appliedCoupon) {
                const coupon = await CouponModel.findOne({ code: order.appliedCoupon, isActive: true });
                let discount = 0;

                if (coupon) {
                    const minOrderValInCurrency = convertPrice(coupon.minOrderValue, orderRate);
                    if (totalAmount < minOrderValInCurrency) {
                        order.appliedCoupon = null;
                    } else {
                        if (coupon.discountType === "percentage") {
                            discount = (totalAmount * coupon.discountValue) / 100;
                            const maxDiscountInCurrency = coupon.maxDiscount ? convertPrice(coupon.maxDiscount, orderRate) : null;
                            if (maxDiscountInCurrency && discount > maxDiscountInCurrency) discount = maxDiscountInCurrency;
                        } else if (coupon.discountType === "flat") {
                            discount = convertPrice(coupon.discountValue, orderRate);
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
        } catch (saveError) {
            if (itemsToRestore.length > 0) {
                await updateStock(itemsToRestore, -1);
            }
            throw saveError;
        }

        return sendSuccessResponse(res, "Order cancelled successfully", order);

    } catch (error) {
        console.error("Error cancelling order:", error);
        return sendErrorResponse(res, 500, "Error cancelling order", error?.message || error);
    }
};

export const sellerChangeOrderStatusController = async (req, res) => {
    try {
        const sellerId = req?.user?.id; 
        const { orderId, itemId } = req.params; 
        const { status } = req.body;

        const allowedStatus = ["pending", "packing", "out for delivery", "delivered", "cancelled"];

        if (!sellerId || !mongoose.Types.ObjectId.isValid(sellerId)) {
            return res.status(400).json({ success: false, message: "Seller ID is missing or invalid. Please login again." });
        }

        if (!status || !allowedStatus.includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Please select a valid status: Pending, Packing, Out for Delivery, Delivered, or Cancelled."
            });
        }

        let order;

        if (orderId && mongoose.Types.ObjectId.isValid(orderId)) {
            order = await orderModel.findById(orderId).populate("items.variantId");
        } else if (itemId && mongoose.Types.ObjectId.isValid(itemId)) {
            order = await orderModel.findOne({ "items._id": itemId }).populate("items.variantId");
        }

        if (!order) {
            return res.status(404).json({ success: false, message: "We couldn’t find any order matching your selection." });
        }

        const hasSellerItem = order.items.some(item => item.sellerId.toString() === sellerId.toString());
        if (!hasSellerItem) {
            return res.status(403).json({ success: false, message: "You are not authorized to update this order." });
        }

        const itemsToRestore = [];
        order.items.forEach(item => {
            if (item.status !== "cancelled") {
                if (status === "cancelled") {
                    itemsToRestore.push({
                        productId: item.productId,
                        variantId: item.variantId,
                        quantity: item.quantity
                    });
                }
                item.status = status;
            }
        });

        if (status === "cancelled" && itemsToRestore.length > 0) {
            await updateStock(itemsToRestore, 1);
        }

        try {
            const orderRate = ratesMap[order.currency] || 1.0;
            let totalAmount = 0;
            for (const i of order.items) {
                if (i.status !== "cancelled") {
                    const variant = await variantModel.findById(i.variantId);
                    const price = variant ? convertPrice(variant.price, orderRate) : 0;
                    totalAmount += price * i.quantity;
                }
            }
            order.totalAmount = totalAmount;

            if (order.appliedCoupon) {
                const coupon = await couponModel.findOne({ code: order.appliedCoupon, isActive: true });
                let discount = 0;

                if (coupon) {
                    const minOrderValInCurrency = convertPrice(coupon.minOrderValue, orderRate);
                    if (totalAmount < minOrderValInCurrency) {
                        order.appliedCoupon = null;
                    } else {
                        if (coupon.discountType === "percentage") {
                            discount = (totalAmount * coupon.discountValue) / 100;
                            const maxDiscountInCurrency = coupon.maxDiscount ? convertPrice(coupon.maxDiscount, orderRate) : null;
                            if (maxDiscountInCurrency && discount > maxDiscountInCurrency) discount = maxDiscountInCurrency;
                        } else if (coupon.discountType === "flat") {
                            discount = convertPrice(coupon.discountValue, orderRate);
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

            if (status === "delivered") {
                order.paymentStatus = "Paid";
                const payment = await paymentModel.findOne({ orderId: order._id });
                if (payment) {
                    payment.paymentStatus = "Paid";
                    payment.paymentDate = new Date();
                    await payment.save();
                }
            } else {
                const payment = await paymentModel.findOne({ orderId: order._id });
                if (payment && payment.paymentMethod === "cash_on_delivery" && payment.paymentStatus !== "Paid") {
                    order.paymentStatus = "Pending";
                    payment.paymentStatus = "Pending";
                    await payment.save();
                }
            }

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
        } catch (saveError) {
            if (status === "cancelled" && itemsToRestore.length > 0) {
                await updateStock(itemsToRestore, -1);
            }
            throw saveError;
        }

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
                select: "productName"
            })
            .populate("items.variantId");

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
        const orderRate = ratesMap[orderObj.currency] || 1.0;
        const formattedItems = orderObj.items.map(item => {
            if (item.variantId) {
                item.selectedPackSize = {
                    weight: item.variantId.weight,
                    unit: item.variantId.unit,
                    price: convertPrice(item.variantId.price, orderRate),
                    variantImage: item.variantId.variantImage
                };
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
            items: formattedItems,
            currency: order.currency
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
                select: "productName"
            })
            .populate("items.variantId");

        const formattedOrders = orders.map(order => {
            const orderObj = order.toObject();
            const orderRate = ratesMap[orderObj.currency] || 1.0;
            orderObj.items = orderObj.items.map(item => {
                if (item.variantId) {
                    item.selectedPackSize = {
                        weight: item.variantId.weight,
                        unit: item.variantId.unit,
                        price: convertPrice(item.variantId.price, orderRate),
                        variantImage: item.variantId.variantImage
                    };
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