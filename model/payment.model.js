import mongoose from "mongoose";

const paymentSchema = mongoose.Schema({
    transactionId: {
        type: String
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user"
    },
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "product"
    }
}, { timestamps: true })

export default mongoose.model("payment", paymentSchema)