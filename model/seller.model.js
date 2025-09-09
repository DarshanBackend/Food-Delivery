import mongoose from "mongoose";

const sellerSchema = new mongoose.Schema({
    mobileNo: { type: String, required: [true, "mobileNo iS Required to insert"], default: null },
    email: { type: String, required: [true, "email iS Required to insert"], default: null },
    password: { type: String, required: [true, "password iS Required to insert"], default: null },
    avatar: { type: String, default: null },
    otp: { type: String, default: null },
    GSTIN: { type: String, default: null },
    verified: { type: Boolean, default: false }, //GSTIN & mobile OTP both verfi after this TRUE
    businessName: { type: String, default: null },
    panNumber: { type: String, default: null },
    businessType: { type: String, default: null },
    businessAddr: { type: String, default: null },
    storeName: { type: String, default: null },
    ownerName: { type: String, default: null },
    BankAcNumber: { type: String, default: null },
    ifsc: { type: String, default: null },
    pickUpAddr: [
        {
            houseNo: { type: String, default: null },
            street: { type: String, default: null },
            landmark: { type: String, default: null },
            pincode: { type: String, default: null },
            city: { type: String, default: null },
            state: { type: String, default: null }
        }
    ],
    isSellerAgreementAccept: { type: Boolean, default: false },
    total_product: {
        type: Number
    },
    products: [
        { type: mongoose.Schema.Types.ObjectId }
    ]
});

const sellerModel = mongoose.model("seller", sellerSchema);

export default sellerModel