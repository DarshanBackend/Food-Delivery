import mongoose from "mongoose";
import CouponModel from "../model/coupon.model.js";
import { ThrowError } from "../utils/Error.utils.js";
import { sendBadRequestResponse, sendNotFoundResponse, sendSuccessResponse } from "../utils/Response.utils.js";
import OrderModel from "../model/order.model.js";


export const createCoupon = async (req, res) => {
    try {
        const { code, discountType, discountValue, minOrderValue, maxDiscount, expiryDate, isActive } = req.body;
        const sellerId = req.user.id; // seller creating the coupon

        if (!code || !discountType || !discountValue || !expiryDate) {
            return sendBadRequestResponse(res, "Required fields missing");
        }

        const existCoupon = await CouponModel.findOne({ code });
        if (existCoupon) return sendBadRequestResponse(res, "Coupon code already exists");

        const [day, month, year] = expiryDate.split("/").map(Number);
        const expiry = new Date(year, month - 1, day, 23, 59, 59, 999);

        const newCoupon = await CouponModel.create({
            code,
            discountType,
            discountValue,
            minOrderValue: minOrderValue || 0,
            maxDiscount: maxDiscount || null,
            expiryDate: expiry,
            isActive: isActive ?? true,
            sellerId // assign seller
        });

        return sendSuccessResponse(res, "Coupon created successfully", newCoupon);
    } catch (error) {
        return ThrowError(res, 500, error.message);
    }
};

export const getAllCoupon = async (req, res) => {
    try {
        const coupons = await CouponModel.find();

        if (!coupons || coupons.length === 0) {
            return sendNotFoundResponse(res, "No coupons found!");
        }

        return sendSuccessResponse(res, "Coupons fetched successfully", coupons);
    } catch (error) {
        return ThrowError(res, 500, error.message);
    }
};

export const getCouponById = async (req, res) => {
    try {
        const { id } = req.params;

        // Validate ID
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return sendBadRequestResponse(res, "Invalid Coupon ID");
        }

        // Find coupon
        const coupon = await CouponModel.findById(id);
        if (!coupon) {
            return sendNotFoundResponse(res, "Coupon not found!");
        }

        return sendSuccessResponse(res, "Coupon fetched successfully", coupon);
    } catch (error) {
        return ThrowError(res, 500, error.message);
    }
};


export const updateCoupon = async (req, res) => {
    try {
        const { id } = req.params;

        // Validate ID
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return sendBadRequestResponse(res, "Invalid Coupon ID");
        }

        // Check coupon exists
        const existingCoupon = await CouponModel.findById(id);
        if (!existingCoupon) {
            return sendNotFoundResponse(res, "Coupon not found!");
        }

        // Only allow valid fields to update
        const allowedUpdates = [
            "code",
            "discountType",
            "discountValue",
            "minOrderValue",
            "maxDiscount",
            "expiryDate",
            "isActive"
        ];

        const updates = {};
        Object.keys(req.body).forEach((key) => {
            if (allowedUpdates.includes(key)) {
                updates[key] = req.body[key];
            }
        });

        // Update coupon
        const updatedCoupon = await CouponModel.findByIdAndUpdate(id, updates, { new: true });

        return sendSuccessResponse(res, "Coupon updated successfully", updatedCoupon);
    } catch (error) {
        return ThrowError(res, 500, error.message);
    }
};

export const deleteCoupon = async (req, res) => {
    try {
        const { id } = req.params;

        // Validate ID
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return sendBadRequestResponse(res, "Invalid Coupon ID");
        }

        // Check if coupon exists
        const coupon = await CouponModel.findById(id);
        if (!coupon) {
            return sendNotFoundResponse(res, "Coupon not found!");
        }

        // Delete coupon
        await CouponModel.findByIdAndDelete(id);

        return sendSuccessResponse(res, "Coupon deleted successfully", { deletedId: id });
    } catch (error) {
        return ThrowError(res, 500, error.message);
    }
};

export const applyCouponController = async (req, res) => {
    try {
        const { code, orderId } = req.body;

        if (!code || !orderId)
            return sendBadRequestResponse(res, "Coupon code and orderId are required");

        const order = await OrderModel.findById(orderId).populate("items.productId");
        if (!order) return sendNotFoundResponse(res, "Order not found");

        const coupon = await CouponModel.findOne({ code: code.toUpperCase(), isActive: true });
        if (!coupon) return sendNotFoundResponse(res, "Invalid or inactive coupon");

        if (coupon.expiryDate < new Date())
            return sendBadRequestResponse(res, "Coupon has expired");

        // ✅ Calculate only for items belonging to this seller
        let eligibleAmount = 0;
        order.items.forEach(item => {
            if (item.sellerId.toString() === coupon.sellerId.toString()) {
                eligibleAmount += (item.productId.price || 0) * item.quantity;
            }
        });

        if (eligibleAmount === 0) {
            return sendBadRequestResponse(res, "Coupon not applicable: no items from this seller in order");
        }

        if (eligibleAmount < coupon.minOrderValue) {
            return sendBadRequestResponse(res, `Minimum order value for this coupon: ₹${coupon.minOrderValue}`);
        }

        let discount = 0;
        if (coupon.discountType === "percentage") {
            discount = (eligibleAmount * coupon.discountValue) / 100;
            if (coupon.maxDiscount && discount > coupon.maxDiscount) {
                discount = coupon.maxDiscount;
            }
        } else if (coupon.discountType === "flat") {
            discount = coupon.discountValue;
        }

        if (discount > eligibleAmount) discount = eligibleAmount;

        // ✅ Final amount = totalAmount - discount (only applied to eligible seller part)
        order.appliedCoupon = coupon.code;
        order.discount = discount;
        order.finalAmount = order.totalAmount - discount;

        await order.save();

        return sendSuccessResponse(res, "Coupon applied successfully", {
            orderId: order._id,
            sellerId: coupon.sellerId,
            couponCode: coupon.code,
            eligibleAmount,
            discount,
            finalAmount: order.finalAmount
        });
    } catch (error) {
        return ThrowError(res, 500, error.message);
    }
};