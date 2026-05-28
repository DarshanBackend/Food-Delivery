import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true,
        index: true,
    },
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "order",
        required: true,
        index: true,
        unique: true,
    },
    amount: {
        type: Number,
        required: true,
    },
    paymentMethod: {
        type: String,
        enum: ["credit_card", "cash_on_delivery", "upi"],
        required: true,
        default: "cash_on_delivery",
    },
    paymentStatus: {
        type: String,
        enum: ["pending", "completed", "failed", "refunded", "Paid", "Pending", "Processing"],
        required: true,
        default: "Pending",
        index: true,
    },
    transactionId: {
        type: String,
        unique: true,
        sparse: true, 
    },
    paymentDate: {
        type: Date,
        default: Date.now,
    },
    cardDetails: {
        cardHolderName: String,
        cardLast4Digits: String,
        cardType: String, 
        expiryMonth: Number,
        expiryYear: Number,
        billingAddress: String,
    },
    stripePaymentIntentId: {
        type: String,
        default: null,
    },
    clientSecret: {
        type: String,
        default: null,
    },
    refundStatus: {
        type: String,
        enum: ["refund initiated", "under progress", "delivered"],
        default: null,
    },
    refundTimeline: {
        initiatedAt: { type: Date, default: null },
        processingAt: { type: Date, default: null },
        deliveredAt: { type: Date, default: null }
    }
}, { timestamps: true });

const paymentModel = mongoose.model("Payment", paymentSchema);

export default paymentModel;