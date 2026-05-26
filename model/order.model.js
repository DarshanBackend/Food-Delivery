import mongoose from "mongoose";
import { UserAddressSchema } from "./user.model.js";

const orderSchema = new mongoose.Schema(
    {
        orderId: {
            type: String,
            unique: true,
            sparse: true
        },
        userId: {
            type: mongoose.Types.ObjectId,
            ref: "user",
            required: [true, "UserId is required for Order"],
        },
        items: [
            {
                productId: {
                    type: mongoose.Types.ObjectId,
                    ref: "product",
                    required: [true, "Product Id is required for Order"],
                },
                sellerId: {
                    type: mongoose.Types.ObjectId,
                    ref: "seller",
                    required: [true, "Seller Id is required for Order"],
                },
                packSizeId: {
                    type: mongoose.Types.ObjectId,
                    required: [true, "PackSize Id is required for Order"],
                },
                quantity: {
                    type: Number,
                    required: [true, "Quantity is required"],
                    min: [1, "Minimum 1 quantity is required"],
                },
                status: {
                    type: String,
                    enum: ["pending", "packing", "out for delivery", "delivered", "cancelled"],
                    default: "pending",
                },
                reasonForCancel: { type: String, default: null },
                comment: { type: String, default: null },
            },
        ],

        // Global delivery address for the order
        deliveryAddress: UserAddressSchema,

        totalAmount: { type: Number, required: true, default: 0 },
        platformFee: { type: Number, default: 0 },
        discount: { type: Number, default: 0 },
        finalAmount: { type: Number, required: true, default: 0 },
        appliedCoupon: { type: String, default: null },
        orderStatus: { type: String, default: "Pending" },
        status: { type: String, default: "Pending" },
        paymentStatus: { type: String, default: "Pending" },
        stripePaymentIntentId: { type: String, default: null },
        clientSecret: { type: String, default: null },
        refundStatus: {
            type: String,
            enum: ["refund initiated", "under progress", "delivered"],
            default: null,
        },
        statusTimeline: {
            confirmedAt: { type: Date, default: null },
            processingAt: { type: Date, default: null },
            shippedAt: { type: Date, default: null },
            deliveredAt: { type: Date, default: null },
            cancelledAt: { type: Date, default: null }
        },
        refundTimeline: {
            initiatedAt: { type: Date, default: null },
            processingAt: { type: Date, default: null },
            deliveredAt: { type: Date, default: null }
        }
    },
    { timestamps: true }
);

const orderModel = mongoose.model("order", orderSchema);

export default orderModel;
