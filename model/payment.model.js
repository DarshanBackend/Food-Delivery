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
        enum: ["credit_card", "debit_card", "paypal", "bank_transfer", "cash_on_delivery"],
        required: true,
        default: "cash_on_delivery",
    },
    paymentStatus: {
        type: String,
        enum: ["pending", "completed", "failed", "refunded"],
        required: true,
        default: "pending",
        index: true,
    },
    transactionId: {
        type: String,
        unique: true,
        sparse: true, // allows multiple null values
    },
    paymentDate: {
        type: Date,
        default: Date.now,
    },
    cardDetails: {
        cardHolderName: String,
        cardLast4Digits: String,
        cardType: String, // e.g., Visa, MasterCard
        expiryMonth: Number,
        expiryYear: Number,
        billingAddress: String,
    },
    paypalDetails: {
        paypalId: String,
        email: String,
    },
    bankTransferDetails: {
        bankName: String,
        accountNumber: String,
        routingNumber: String,
        transactionReference: String,
    },
}, { timestamps: true });

const paymentModel = mongoose.model("Payment", paymentSchema);

export default paymentModel;