import mongoose from "mongoose";
import CouponModel from "../model/coupon.model.js";
import { ThrowError } from "../utils/Error.utils.js";
import { sendBadRequestResponse, sendNotFoundResponse, sendSuccessResponse } from "../utils/Response.utils.js";
import couponModel from "../model/coupon.model.js";

export const createCoupon = async (req, res) => {
    try {
        const { name, description, price, isPrivate } = req.body;

        if (!name || !description || !price) {
            return sendBadRequestResponse(res, "All fields are required.");
        }

        const existName = await CouponModel.findOne({ name });
        if (existName) {
            return sendBadRequestResponse(res, "This coupon already exists.");
        }

        const newCoupon = await CouponModel.create({
            name,
            description,
            price,
            isPrivate: isPrivate || false
        });

        return res.status(201).json({
            success: true,
            message: "Coupon created successfully",
            result: newCoupon
        });
    } catch (error) {
        return ThrowError(res, 500, error.message);
    }
};

export const getAllCoupon = async (req, res) => {
    try {
        const coupon = await CouponModel.find()

        if (!coupon || !coupon.length === 0) {
            return sendNotFoundResponse(res, "No any Coupon found!!!")
        }

        return sendSuccessResponse(res, "Coupon fetched Successfully...", coupon)
    } catch (error) {
        return ThrowError(res, 500, error.message)
    }
}

export const getCouponById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return sendBadRequestResponse(res, "Invalid CouponId")
        }

        const existCoupom = await CouponModel.findById(id)
        if (!existCoupom) {
            return sendNotFoundResponse(res, "Coupon not Found!!!")
        }

        return sendSuccessResponse(res, "Coupon fetched Successfully...", existCoupom)
    } catch (error) {
        return ThrowError(res, 500, error.message)
    }
}

export const updateCoupon = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return sendBadRequestResponse(res, "Invalid CouponId")
        }

        const checkCoupon = await CouponModel.findById(id)
        if (!checkCoupon) {
            return sendNotFoundResponse(res, "Coupon not found!!!")
        }

        const updateCoupon = (req.body)
        const newCoupon = await CouponModel.findByIdAndUpdate(id, updateCoupon, { new: true })

        return sendSuccessResponse(res, "Coupon updated Successfully...", newCoupon)

    } catch (error) {
        return ThrowError(res, 500, error.message)
    }
}

export const deleteCoupon = async (req, res) => {
    try {
        const { id } = req.params

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return sendBadRequestResponse(res, "Invalid CouponId")
        }

        const checkCoupon = await CouponModel.findById(id)
        if (!checkCoupon) {
            return sendNotFoundResponse(res, "Coupon Not found!!!")
        }

        await CouponModel.findByIdAndDelete(id)

        return sendSuccessResponse(res, "Coupon deleted Successfully...")
    } catch (error) {
        return ThrowError(res, 500, error.message)
    }
}

export const applyCouponController = async (req, res) => {
    try {
        const { code, orderAmount } = req.body;

        if (!code || !orderAmount) {
            return res.status(400).json({ success: false, message: "Coupon code and order amount are required" });
        }

        const coupon = await couponModel.findOne({ code: code.toUpperCase(), isActive: true });

        if (!coupon) {
            return res.status(404).json({ success: false, message: "Invalid or expired coupon" });
        }

        if (coupon.expiryDate < new Date()) {
            return res.status(400).json({ success: false, message: "Coupon expired" });
        }

        if (orderAmount < coupon.minOrderValue) {
            return res.status(400).json({ success: false, message: `Minimum order value should be ₹${coupon.minOrderValue}` });
        }

        let discount = 0;

        if (coupon.discountType === "percentage") {
            discount = (orderAmount * coupon.discountValue) / 100;
            if (coupon.maxDiscount && discount > coupon.maxDiscount) {
                discount = coupon.maxDiscount;
            }
        } else if (coupon.discountType === "flat") {
            discount = coupon.discountValue;
        }

        const finalAmount = orderAmount - discount;

        return res.status(200).json({
            success: true,
            message: "Coupon applied successfully",
            data: {
                orderAmount,
                discount,
                finalAmount,
                coupon: coupon.code,
            },
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};
