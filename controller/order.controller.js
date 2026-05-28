import mongoose from "mongoose";
import { sendBadRequestResponse, sendErrorResponse, sendNotFoundResponse, sendSuccessResponse } from "../utils/Response.utils.js";
import UserModel from "../model/user.model.js";
import orderModel from "../model/order.model.js";
import productModel from "../model/product.model.js";
import cartModel from "../model/cart.model.js";
import CouponModel from "../model/coupon.model.js";
import paymentModel from "../model/payment.model.js";
import couponModel from "../model/coupon.model.js";
import { checkStockAvailability, updateStock } from "../utils/stock.utils.js";



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

        const platformFee = 1;

        
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

        
        const stockCheck = await checkStockAvailability(items);
        if (!stockCheck.isValid) {
            return sendBadRequestResponse(res, stockCheck.message);
        }

        
        await updateStock(items, -1);

        try {
            
            const user = await UserModel.findById(userId).select("address selectedAddress");
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

            
            let order = await orderModel.findOne({ userId, "items.status": { $ne: "delivered" } });

            if (order) {
                
                order.items.push(...itemsWithSeller);

                
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
        } catch (saveError) {
            
            await updateStock(items, 1);
            throw saveError;
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

        
        let order = await orderModel.findOne({ _id: orderId, userId }).populate("items.productId");
        if (!order) {
            return sendNotFoundResponse(res, "Order not found for this user");
        }

        
        const itemsToUpdateStock = [];
        if (items) {
            for (const updateItem of items) {
                const orderItem = order.items.id(updateItem._id);
                if (orderItem) {
                    const product = await productModel.findById(orderItem.productId);
                    if (!product) continue;

                    const pack = product.packSizes.find(p => p._id.toString() === orderItem.packSizeId.toString());
                    if (!pack) continue;

                    const oldQty = orderItem.quantity;
                    const oldStatus = orderItem.status;
                    const newQty = updateItem.quantity !== undefined ? updateItem.quantity : oldQty;
                    const newStatus = updateItem.status !== undefined ? updateItem.status : oldStatus;

                    if (oldStatus === "delivered" && (newQty !== oldQty || newStatus !== oldStatus)) {
                        return sendBadRequestResponse(res, `Cannot modify quantity or status of a delivered item: ${product.productName}`);
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
                            productId: orderItem.productId._id || orderItem.productId,
                            packSizeId: orderItem.packSizeId,
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
                    packSizeId: item.packSizeId,
                    quantity: item.quantity,
                    direction: -item.direction
                });
            }

            let totalAmount = 0;

            
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

        
        const order = await orderModel.findOne({ userId, "items._id": itemId }).populate("items.productId");
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
                productId: item.productId._id || item.productId,
                packSizeId: item.packSizeId,
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

            
            let totalAmount = 0;
            order.items.forEach(i => {
                const price = i.productId?.price || 0;
                totalAmount += price * i.quantity;
            });
            order.totalAmount = totalAmount;

            
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
        } catch (saveError) {
            if (restoredStock) {
                await updateStock([{
                    productId: item.productId._id || item.productId,
                    packSizeId: item.packSizeId,
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

        
        order = await orderModel.findOne({ _id: orderId, userId }).populate("items.productId");

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
                    productId: item.productId._id || item.productId,
                    packSizeId: item.packSizeId,
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

            
            order.items.forEach(item => {
                if (item.status !== "cancelled") {
                    totalAmount += (item.productId?.price || 0) * item.quantity;
                }
            });
            order.totalAmount = totalAmount;

            
            if (order.appliedCoupon) {
                const coupon = await CouponModel.findOne({ code: order.appliedCoupon, isActive: true });
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
            order = await orderModel.findById(orderId).populate("items.productId");
        } else if (itemId && mongoose.Types.ObjectId.isValid(itemId)) {
            order = await orderModel.findOne({ "items._id": itemId }).populate("items.productId");
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
                        productId: item.productId._id || item.productId,
                        packSizeId: item.packSizeId,
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