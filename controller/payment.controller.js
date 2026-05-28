import mongoose from "mongoose";
import Stripe from "stripe";
import { sendBadRequestResponse, sendErrorResponse, sendNotFoundResponse, sendSuccessResponse } from "../utils/Response.utils.js";
import orderModel from "../model/order.model.js";
import paymentModel from "../model/payment.model.js";
import cartModel from "../model/cart.model.js";
import productModel from "../model/product.model.js";

const stripe = new Stripe(process.env.STRIPE_SECRET);

export const makeNewPaymentController = async (req, res) => {
    try {
        const userId = req?.user?.id;
        const {
            orderId,
            paymentMethod,
            transactionId,
            cardDetails,
        } = req.body;

        
        if (!userId || !orderId || !paymentMethod) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        
        const allowedMethods = ["credit_card", "cash_on_delivery", "upi"];
        if (!allowedMethods.includes(paymentMethod)) {
            return res.status(400).json({ success: false, message: `Invalid payment method. Allowed: ${allowedMethods.join(", ")}` });
        }

        
        const order = await orderModel.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        
        const amount = order.finalAmount;

        let stripePaymentIntentId = null;
        let clientSecret = null;
        let paymentStatus = "Pending";

        if (paymentMethod === "credit_card" || paymentMethod === "upi") {
            try {
                
                const paymentIntent = await stripe.paymentIntents.create({
                    amount: Math.round(amount * 100), 
                    currency: "usd", 
                    metadata: { orderId: orderId.toString(), userId: userId.toString() },
                    payment_method_types: paymentMethod === "credit_card" ? ["card"] : ["upi"],
                });
                stripePaymentIntentId = paymentIntent.id;
                clientSecret = paymentIntent.client_secret;
            } catch (stripeError) {
                console.error("Stripe Intent Creation Error:", stripeError);
                return res.status(500).json({ success: false, message: "Stripe PaymentIntent creation failed", error: stripeError.message });
            }
        }

        
        const payment = await paymentModel.create({
            userId,
            orderId,
            amount,
            paymentMethod,
            paymentStatus,
            transactionId: transactionId || null,
            cardDetails,
            stripePaymentIntentId,
            clientSecret,
        });

        
        if (order.items && order.items.length > 0) {
            await cartModel.updateOne(
                { userId },
                {
                    $pull: {
                        items: {
                            $or: order.items.map((i) => ({
                                productId: i.productId,
                                variantId: i.variantId,
                            })),
                        },
                    },
                }
            );
        }

        
        order.stripePaymentIntentId = stripePaymentIntentId;
        order.clientSecret = clientSecret;
        order.paymentStatus = "Pending";
        order.orderStatus = "Pending";
        order.status = "Pending";
        await order.save();

        return res.status(201).json({
            success: true,
            message: paymentMethod === "cash_on_delivery"
                ? "Payment record created (COD) & ordered items removed from cart"
                : "Stripe PaymentIntent created & ordered items removed from cart",
            data: payment,
            clientSecret,
            stripePaymentIntentId
        });
    } catch (error) {
        console.error("Payment Error:", error);
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message,
        });
    }
};

export const confirmStripePaymentController = async (req, res) => {
    if (!req.user || !req.user.id) {
        return sendErrorResponse(res, 401, "Authentication required. Please log in.");
    }

    const session = await mongoose.startSession();

    try {
        await session.startTransaction();

        const userId = req.user.id;
        const { paymentIntentId, orderId } = req.body;

        if (!paymentIntentId || !orderId) {
            return sendBadRequestResponse(res, "Payment Intent ID and Order ID are required");
        }

        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        if (paymentIntent.status !== 'succeeded') {
            return sendErrorResponse(res, 400, `Payment not completed. Status: ${paymentIntent.status}`);
        }

        const payment = await paymentModel.findOne({
            stripePaymentIntentId: paymentIntentId,
            userId: userId
        }).session(session);

        if (!payment) {
            return sendNotFoundResponse(res, "Payment record not found");
        }

        const order = await orderModel.findById(orderId).session(session);

        if (!order) {
            return sendNotFoundResponse(res, "Order not found");
        }

        if (order.userId.toString() !== userId.toString()) {
            return sendErrorResponse(res, 403, "You are not authorized to confirm this order");
        }

        payment.paymentStatus = "Paid";
        payment.paymentDate = new Date();
        await payment.save({ session });

        order.orderStatus = "Pending";
        order.status = "Pending";
        order.paymentStatus = "Paid";
        await order.save({ session });

        
        for (const item of order.items) {
            await productModel.updateOne(
                { _id: item.productId },
                {
                    $inc: {
                        "soldCount": item.quantity
                    }
                },
                { session }
            );
        }

        await session.commitTransaction();

        return sendSuccessResponse(res, "Payment confirmed successfully", {
            paymentId: payment._id,
            orderId: order._id,
            orderStatus: order.orderStatus,
            paymentStatus: payment.paymentStatus,
            amount: payment.amount,
            currency: "USD"
        });

    } catch (error) {
        await session.abortTransaction();
        console.error("Payment confirmation error:", error);
        return sendErrorResponse(res, 500, "Error confirming payment", error.message);
    } finally {
        session.endSession();
    }
};

export const testConfirmStripePayment = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        await session.startTransaction();

        const userId = req.user.id;
        const { orderId } = req.body;

        if (!orderId) {
            return sendBadRequestResponse(res, "Order ID is required");
        }

        const order = await orderModel.findById(orderId).session(session);
        if (!order) {
            return sendNotFoundResponse(res, "Order not found");
        }

        let payment = await paymentModel.findOne({ orderId: order._id, userId }).session(session);

        if (!payment) {
            payment = new paymentModel({
                userId,
                orderId: order._id,
                amount: order.finalAmount,
                stripePaymentIntentId: order.stripePaymentIntentId || `test_intent_${Date.now()}`,
                clientSecret: order.clientSecret || `test_secret_${Date.now()}`,
                paymentStatus: "Pending",
                paymentMethod: "credit_card"
            });
            await payment.save({ session });
        }

        payment.paymentStatus = "Paid";
        payment.paymentDate = new Date();
        await payment.save({ session });

        order.paymentStatus = "Paid";
        order.orderStatus = "Pending";
        order.status = "Pending";
        await order.save({ session });

        
        for (const item of order.items) {
            await productModel.updateOne(
                { _id: item.productId },
                {
                    $inc: {
                        "soldCount": item.quantity
                    }
                },
                { session }
            );
        }

        await session.commitTransaction();

        return sendSuccessResponse(res, "Payment confirmed successfully (TEST MODE)", {
            orderId: order._id,
            orderStatus: order.orderStatus,
            paymentStatus: payment.paymentStatus,
            amount: payment.amount,
            stripePaymentIntentId: payment.stripePaymentIntentId,
            clientSecret: payment.clientSecret,
            message: "This is a test confirmation - no actual Stripe payment was processed",
        });

    } catch (error) {
        await session.abortTransaction();
        console.error("Test payment confirmation error:", error);
        return sendErrorResponse(res, 500, "Error confirming test payment", error.message);
    } finally {
        session.endSession();
    }
};

export const getPaymentStatusController = async (req, res) => {
    try {
        const userId = req.user.id;
        const { orderId } = req.params;

        const payment = await paymentModel.findOne({
            orderId,
            userId
        }).populate('orderId');

        if (!payment) {
            return sendNotFoundResponse(res, "Payment not found");
        }

        if ((payment.paymentMethod === "credit_card" || payment.paymentMethod === "upi") && payment.paymentStatus === "Pending") {
            try {
                const paymentIntent = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);

                if (paymentIntent.status === 'succeeded') {
                    payment.paymentStatus = "Paid";
                    payment.paymentDate = new Date();
                    await payment.save();

                    await orderModel.findByIdAndUpdate(orderId, {
                        orderStatus: "Pending",
                        status: "Pending",
                        paymentStatus: "Paid"
                    });
                }
            } catch (stripeError) {
                console.error("Stripe status check error:", stripeError);
            }
        }

        const updatedOrder = await orderModel.findById(orderId);

        return sendSuccessResponse(res, "Payment status retrieved", {
            paymentId: payment._id,
            orderId: payment.orderId._id,
            orderStatus: updatedOrder.orderStatus,
            paymentStatus: payment.paymentStatus,
            paymentMethod: payment.paymentMethod,
            amount: payment.amount,
            clientSecret: payment.clientSecret,
            stripePaymentIntentId: payment.stripePaymentIntentId
        });

    } catch (error) {
        console.error("Get payment status error:", error);
        return sendErrorResponse(res, 500, "Error retrieving payment status", error.message);
    }
};

export const verifyPayment = async (req, res) => {
    try {
        const { clientSecret, orderId } = req.body;

        if (!clientSecret || !orderId) {
            return res.status(400).json({
                success: false,
                message: "clientSecret and orderId are required",
            });
        }

        const paymentIntentId = clientSecret.split("_secret_")[0];

        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        const stripeStatus = paymentIntent.status;
        const transactionId = paymentIntent.id;

        let paymentStatus = "Pending";
        let orderPaymentStatus = "Pending";
        let orderStatus = "Pending";

        if (stripeStatus === "succeeded") {
            paymentStatus = "Paid";
            orderPaymentStatus = "Paid";
            orderStatus = "Pending";
        } else if (stripeStatus === "processing") {
            paymentStatus = "Processing";
            orderPaymentStatus = "Processing";
            orderStatus = "Processing";
        } else {
            paymentStatus = "Failed";
            orderPaymentStatus = "Failed";
            orderStatus = "Pending";
        }

        const paymentDoc = await paymentModel.findOneAndUpdate(
            { clientSecret, orderId },
            { paymentStatus, transactionId },
            { new: true }
        );

        if (!paymentDoc) {
            return res.status(404).json({
                success: false,
                message: "Payment record not found",
            });
        }

        const order = await orderModel.findById(orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found",
            });
        }

        order.paymentStatus = orderPaymentStatus;
        order.orderStatus = orderStatus;
        order.status = orderStatus;
        await order.save();

        return res.status(200).json({
            success: true,
            message: "Payment verified and order updated successfully",
            result: {
                paymentStatus,
                transactionId,
                stripeStatus,
                orderStatus,
                orderId: order._id,
                clientSecret,
            },
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Payment verification failed",
            error: err.message,
        });
    }
};

export const getAllPaymentHistory = async (req, res) => {
    try {
        const payments = await paymentModel.find({}).populate("orderId").populate("userId");
        return sendSuccessResponse(res, "All payment get successfully", payments);
    } catch (error) {
        return sendErrorResponse(res, 500, "Error while Get all payment History", error);
    }
};

export const updateRefundStatusController = async (req, res) => {
    try {
        const sellerId = req?.user?.id;
        const { paymentId } = req.params;
        const { refundStatus } = req.body;

        const allowedRefundStatuses = ["refund initiated", "under progress", "delivered"];
        if (!refundStatus || !allowedRefundStatuses.includes(refundStatus)) {
            return res.status(400).json({
                success: false,
                message: "Invalid refund status. Allowed: " + allowedRefundStatuses.join(", ")
            });
        }

        const payment = await paymentModel.findById(paymentId);
        if (!payment) {
            return res.status(404).json({ success: false, message: "Payment record not found." });
        }

        const order = await orderModel.findById(payment.orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found." });
        }

        
        const hasSellerItem = order.items.some(item => item.sellerId.toString() === sellerId.toString());
        if (!hasSellerItem) {
            return res.status(403).json({ success: false, message: "You are not authorized to update this refund." });
        }

        payment.refundStatus = refundStatus;
        if (!payment.refundTimeline) {
            payment.refundTimeline = {};
        }
        if (refundStatus === "refund initiated") {
            payment.refundTimeline.initiatedAt = new Date();
        } else if (refundStatus === "under progress") {
            payment.refundTimeline.processingAt = new Date();
        } else if (refundStatus === "delivered") {
            payment.refundTimeline.deliveredAt = new Date();
        }

        if (refundStatus === "delivered") {
            payment.paymentStatus = "refunded";
            order.paymentStatus = "refunded";
        }
        await payment.save();

        order.refundStatus = refundStatus;
        if (!order.refundTimeline) {
            order.refundTimeline = {};
        }
        if (refundStatus === "refund initiated") {
            order.refundTimeline.initiatedAt = new Date();
        } else if (refundStatus === "under progress") {
            order.refundTimeline.processingAt = new Date();
        } else if (refundStatus === "delivered") {
            order.refundTimeline.deliveredAt = new Date();
        }
        await order.save();

        return res.status(200).json({
            success: true,
            message: `Refund status updated to ${refundStatus}`,
            payment,
            order
        });
    } catch (error) {
        console.error("Update Refund Status Error:", error);
        return res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};