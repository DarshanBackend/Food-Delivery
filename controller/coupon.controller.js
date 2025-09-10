import mongoose from "mongoose";
import CouponModel from "../model/coupon.model.js";
import { ThrowError } from "../utils/Error.utils.js";
import { sendBadRequestResponse, sendNotFoundResponse, sendSuccessResponse } from "../utils/Response.utils.js";

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

export const getCouponById = async (req, res) {
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

        const updateCoupon =

    } catch (error) {
        return ThrowError(res, 500, error.message)
    }
}
