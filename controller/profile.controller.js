import mongoose from "mongoose";
import { sendBadRequestResponse, sendErrorResponse, sendNotFoundResponse, sendSuccessResponse } from "../utils/Response.utils.js";
import UserModel from "../model/user.model.js";
import { uploadFile } from "../middleware/imageUpload.js";
import axios from "axios";
import bcrypt from 'bcryptjs';
import sellerModel from "../model/seller.model.js";

export const getProfileController = async (req, res) => {
    try {
        const { id } = req?.user;

        if (!id && !mongoose.Types.ObjectId.isValid(id)) {
            return sendNotFoundResponse(res, "Provided token User Id not Found!");
        }

        const userProfile = await UserModel.findOne({ _id: id });

        if (!userProfile && !userProfile.length !== 0) {
            return sendNotFoundResponse(res, "User Profile Not Found");
        }

        return sendSuccessResponse(res, "User Profile Fetched SuccessFully", { userProfile })

    } catch (error) {
        console.log("Error while Fetch My Profile");
        return sendErrorResponse(res, 500, "Error while Fetch User Profile", error);
    }
}

export const userProfileUpdateController = async (req, res) => {
    try {
        const { id } = req?.user;

        // Validate user id
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return sendBadRequestResponse(res, "Invalid or missing user ID from token");
        }

        const { name, email, mobileNo } = req.body || {};

        // Body must exist and at least one field provided
        if (!req.body || (!name && !email && !mobileNo && !req.file)) {
            return sendBadRequestResponse(res, "At least one of name, email, mobileNo, or avatar is required!");
        }

        let avatarUrl;
        if (req.file) {
            // Upload avatar to S3
            const result = await uploadFile(req.file);
            avatarUrl = result.url;
        }

        // Build update object dynamically (only include provided fields)
        const updateData = {};
        if (name) updateData.name = name;
        if (email) updateData.email = email;
        if (mobileNo) updateData.mobileNo = mobileNo;
        if (avatarUrl) updateData.avatar = avatarUrl;

        // Update user profile
        const updatedUser = await UserModel.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true } // return updated document
        );

        if (!updatedUser) {
            return sendBadRequestResponse(res, "User not found!");
        }

        return sendSuccessResponse(res, "Profile updated successfully", { updatedUser });

    } catch (error) {
        console.error("Profile Update Error:", error.message);
        return sendErrorResponse(res, 500, "Error while updating user profile!", error);
    }
};

export const userAddressAddController = async (req, res) => {
    try {
        const { id } = req?.user;

        // ✅ Validate user id
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return sendBadRequestResponse(res, "Invalid User Id in Token!");
        }

        const { firstName, lastName, phone, email, houseNo, landmark, pincode, city, state, country, saveAs } = req?.body;

        // ✅ Check required fields
        if (!firstName || !lastName || !phone || !email || !houseNo || !pincode) {
            return sendBadRequestResponse(res, "All required fields (firstName, lastName, phone, email, houseNo, pincode) must be provided!");
        }

        // ✅ Verify pincode using India Post API
        const pincodeResp = await axios.get(`https://api.postalpincode.in/pincode/${pincode}`);
        const pinData = pincodeResp.data[0];

        if (pinData.Status !== "Success" || !pinData.PostOffice || pinData.PostOffice.length === 0) {
            return sendBadRequestResponse(res, "Invalid or inactive Pincode!");
        }
        let Lemail = String(email).toLowerCase();
        // If city/state not given, auto-fill from API
        const postOffice = pinData.PostOffice[0];
        const addressData = {
            firstName,
            lastName,
            phone,
            email: Lemail,
            houseNo,
            landmark,
            pincode,
            city: city || postOffice.District,
            state: state || postOffice.State,
            country: country || postOffice.Country,
            saveAs: saveAs || "Home"
        };

        // ✅ Save address to user
        const updatedUser = await UserModel.findByIdAndUpdate(
            id,
            { $push: { address: addressData } },
            { new: true }
        );

        return sendSuccessResponse(res, "User Address insert Successfull", updatedUser);
    } catch (error) {
        console.error("Error in userAddressAddController:", error.message);
        return sendErrorResponse(res, 500, "Something went wrong while adding address!", error.message);
    }
};

//update user address controller
//address have many so thir indivual  index id pass and update
export const userAddressUpdatecontroller = async (req, res) => {
    try {
        const { id } = req?.user; // userId from auth token
        const { addressId } = req?.params;
        // ✅ Validate user id
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return sendBadRequestResponse(res, "Invalid User Id in Token!");
        }

        const {
            firstName,
            lastName,
            phone,
            email,
            houseNo,
            landmark,
            pincode,
            city,
            state,
            country,
            saveAs,
        } = req?.body;

        // ✅ Validate addressId
        if (!addressId || !mongoose.Types.ObjectId.isValid(addressId)) {
            return sendBadRequestResponse(res, "Valid addressId must be provided!");
        }

        // ✅ Build update object dynamically (only fields that are provided)
        const updateFields = {};
        if (firstName) updateFields["address.$.firstName"] = firstName;
        if (lastName) updateFields["address.$.lastName"] = lastName;
        if (phone) updateFields["address.$.phone"] = phone;
        if (email) updateFields["address.$.email"] = String(email).toLowerCase();
        if (houseNo) updateFields["address.$.houseNo"] = houseNo;
        if (landmark) updateFields["address.$.landmark"] = landmark;
        if (pincode) updateFields["address.$.pincode"] = pincode;
        if (city) updateFields["address.$.city"] = city;
        if (state) updateFields["address.$.state"] = state;
        if (country) updateFields["address.$.country"] = country;
        if (saveAs) updateFields["address.$.saveAs"] = saveAs;

        // ✅ Update address using positional operator $
        const updatedUser = await UserModel.findOneAndUpdate(
            { _id: id, "address._id": addressId },
            { $set: updateFields },
            { new: true }
        );

        if (!updatedUser) {
            return sendBadRequestResponse(res, "Address not found or update failed!");
        }

        return sendSuccessResponse(
            res,
            "User address updated successfully!",
            updatedUser
        );
    } catch (error) {
        console.error("Error in userAddressUpdateController:", error.message);
        return sendErrorResponse(
            res,
            500,
            "Something went wrong while updating address!",
            error.message
        );
    }
};

export const userAddressDeleteController = async (req, res) => {
    try {
        const { id } = req?.user;
        const { addressId } = req?.params;

        if (!id && !mongoose.Types.ObjectId.isValid(id)) {
            return sendBadRequestResponse(res, "User Id And token Id Not FOUND!!");
        }

        if (!mongoose.Types.ObjectId.isValid(addressId) && !req.params) {
            return sendBadRequestResponse(res, "address Id or Req.params Are required tO request!");
        }

        //delete Address

        const deleteUserAddress = await UserModel.findByIdAndUpdate(
            id,
            { $pull: { address: { _id: addressId } } },
            { new: true }
        );

        if (!deleteUserAddress) {
            return sendNotFoundResponse(res, "User Not Found");
        }

        return sendSuccessResponse(res, "Address deleted successfully", deleteUserAddress);

    } catch (error) {
        console.log("Error while Delete User address" + error.message);
        return sendErrorResponse(res, 500, "Error During! Delete User Address!", error);
    }
}

export const getUserAddressController = async (req, res) => {
    try {
        const { id } = req?.user;
        if (!id && !mongoose.Types.ObjectId.isValid(id)) {
            return sendBadRequestResponse(res, "user _id not found! by Token");
        }

        const address = await UserModel.find({ _id: id }).select("address");

        if (!address && address.length === 0) {
            return sendNotFoundResponse(res, "No Address Found For you!!");
        }

        return sendSuccessResponse(res, "User Address Fetch Successfully", {
            total: address.length,
            address: address
        })

    } catch (error) {
        console.log("Error While Get user Address" + error.message);
        return sendErrorResponse(res, 500, "Error while Get User Address", error);
    }
}

export const userPasswordChangeController = async (req, res) => {
    try {
        const { id } = req?.user;
        const { oldPassword, newPassword } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return sendBadRequestResponse(res, "Invalid userId");
        }

        if (!oldPassword || !newPassword) {
            return sendBadRequestResponse(res, "Old password and new password required");
        }

        const user = await UserModel.findById(id).select("password"); // make sure password is selected

        if (!user) {
            return sendBadRequestResponse(res, "User not found");
        }

        // Compare old password
        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) {
            return sendBadRequestResponse(res, "Old password is incorrect");
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        user.password = hashedPassword;
        await user.save();

        return sendSuccessResponse(res, "Password changed successfully");
    } catch (error) {
        console.error("Change Password Error:", error);
        return sendErrorResponse(res, 500, "Something went wrong while changing password", error);
    }
}

export const userRemoveAccountController = async (req, res) => {
    try {
        const { id } = req?.user;
        if (!id && !mongoose.Types.ObjectId.isValid(id)) {
            return sendBadRequestResponse(res, "User Id And token Id Not FOUND!!");
        }

        const removeUser = await UserModel.findByIdAndDelete({ _id: id });

        if (!removeUser) {
            return sendNotFoundResponse(res, "User Account Not Found");
        }

        return sendSuccessResponse(res, "User Account Delete SuccessFullY! ", removeUser);


    } catch (error) {
        console.log("Erro while User Accounr Remove" + error.message);
        return sendErrorResponse(res, 500, "Error while Delete User Account!", error)
    }
}

//seller profile
export const getSellerProfileController = async (req, res) => {
    try {
        const { id } = req?.user;

        if (!id) {
            return sendErrorResponse(res, 400, "Seller ID missing from token");
        }

        const seller = await sellerModel.findById(id).select("-password"); 
        // exclude password field for security

        if (!seller) {
            return sendNotFoundResponse(res, "Seller not found");
        }

        return sendSuccessResponse(res, "Seller profile fetched successfully", seller);
    } catch (error) {
        console.error("Error fetching seller profile:", error);
        return sendErrorResponse(res, 500, "Error fetching seller profile");
    }
};
