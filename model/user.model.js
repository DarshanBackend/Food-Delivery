import mongoose from "mongoose";


const UserAddressSchema = new mongoose.Schema({
    firstName: { type: String, trim: true, default: null },
    lastName: { type: String, trim: true, default: null },
    phone: {
        type: String,
        default: null,
        match: [/^[0-9]{10}$/, "Please enter a valid 10-digit phone number"]
    },
    email: {
        type: String,
        trim: true,
        lowercase: true,
        default: null,
        match: [/.+@.+\..+/, "Please enter a valid email address"]
    },
    houseNo: { type: String, default: null },
    landmark: { type: String, default: null },
    pincode: { type: String, default: null },
    city: { type: String, default: null },
    state: { type: String, default: null },
    country: { type: String, default: null },
    saveAs: {
        type: String,
        enum: ["Home", "Office", "Other"],
        default: "Home"
    }
});


const UserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Name is required"],
        trim: true
    },
    mobileNo: {
        type: String,
        default: null,
        match: [/^[0-9]{10}$/, "Please enter a valid mobile number"]
    },
    email: {
        type: String,
        required: [true, "Email is required"],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/.+@.+\..+/, "Please enter a valid email address"]
    },
    password: {
        type: String,
        select: false // Exclude password from queries by default
    },
    role: {
        type: String,
        enum: ["user", "admin"],
        default: "user"
    },
    address: [UserAddressSchema],
    uid: { type: String, default: null },
    avatar: { type: String, default: null },
    otp: { type: Number, default: null },
    resetOtpExpiry: { type: Date, default: null },
    verified: { type: Boolean, default: false }
}, { timestamps: true }); // adds createdAt & updatedAt automatically


const UserModel = mongoose.model("user", UserSchema);

export default UserModel;
