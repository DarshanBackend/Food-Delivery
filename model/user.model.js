import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
    name: { type: String, required: [true, "Name iS Required to add."] },
    mobileNo: { type: String, default: null },
    email: { type: String, required: [true, "Email iS Required to add."], unique: true },
    password: { type: String, default: null },
    role: {
        type: String,
        enum: ["user", "admin"],
        default: "user"
    },
    uid: { type: String, default: null },
    avatar: { type: String, default: null },
    otp: { type: Number },
    resetOtpExpiry: { type: Date, default: null },
    verified: { type: Boolean, default: false }
})

const UserModel = mongoose.model("user", UserSchema);

export default UserModel;