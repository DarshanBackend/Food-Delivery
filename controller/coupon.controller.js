import mongoose from "mongoose";
import CouponModel from "../model/coupon.model.js";
import { ThrowError } from "../utils/Error.utils.js";
import { sendBadRequestResponse, sendNotFoundResponse, sendSuccessResponse, sendErrorResponse } from "../utils/Response.utils.js";
import OrderModel from "../model/order.model.js";
import cartModel from "../model/cart.model.js";


export const createCoupon = async (req, res) => {
    try {
        const { code, discountType, discountValue, minOrderValue, maxDiscount, expiryDate, isActive } = req.body;
        const sellerId = req.user.id; 

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
            sellerId 
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

        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return sendBadRequestResponse(res, "Invalid Coupon ID");
        }

        
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

        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return sendBadRequestResponse(res, "Invalid Coupon ID");
        }

        
        const existingCoupon = await CouponModel.findById(id);
        if (!existingCoupon) {
            return sendNotFoundResponse(res, "Coupon not found!");
        }

        
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

        
        const updatedCoupon = await CouponModel.findByIdAndUpdate(id, updates, { new: true });

        return sendSuccessResponse(res, "Coupon updated successfully", updatedCoupon);
    } catch (error) {
        return ThrowError(res, 500, error.message);
    }
};

export const deleteCoupon = async (req, res) => {
    try {
        const { id } = req.params;

        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return sendBadRequestResponse(res, "Invalid Coupon ID");
        }

        
        const coupon = await CouponModel.findById(id);
        if (!coupon) {
            return sendNotFoundResponse(res, "Coupon not found!");
        }

        
        await CouponModel.findByIdAndDelete(id);

        return sendSuccessResponse(res, "Coupon deleted successfully", { deletedId: id });
    } catch (error) {
        return ThrowError(res, 500, error.message);
    }
};

export const applyCouponController = async (req, res) => {
    try {
        const { code } = req.body;
        const { id: userId } = req.user;

        if (!code) {
            return sendBadRequestResponse(res, "Coupon code is required");
        }

        const cart = await cartModel.findOne({ userId }).populate("items.productId");
        if (!cart) {
            return sendNotFoundResponse(res, "Cart not found");
        }

        if (cart.items.length === 0) {
            return sendBadRequestResponse(res, "Cart is empty. Add products to apply coupon.");
        }

        const coupon = await CouponModel.findOne({ code: code.toUpperCase(), isActive: true });
        if (!coupon) {
            return sendNotFoundResponse(res, "Invalid or inactive coupon");
        }

        if (coupon.expiryDate < new Date()) {
            return sendBadRequestResponse(res, "Coupon has expired");
        }

        let cartTotal = 0;
        let eligibleAmount = 0;

        cart.items.forEach(item => {
            const product = item.productId;
            if (!product) return;

            const selectedPack = product.packSizes?.find(
                p => p._id.toString() === item.packSizeId.toString()
            );
            if (selectedPack) {
                const itemPrice = selectedPack.price;
                const itemTotal = itemPrice * item.quantity;
                cartTotal += itemTotal;

                if (!coupon.sellerId || (product.sellerId && product.sellerId.toString() === coupon.sellerId.toString())) {
                    eligibleAmount += itemTotal;
                }
            }
        });

        if (eligibleAmount === 0) {
            return sendBadRequestResponse(res, "Coupon not applicable: no eligible products from this seller in cart");
        }

        if (eligibleAmount < coupon.minOrderValue) {
            return sendBadRequestResponse(res, `Minimum order value for this coupon is $${coupon.minOrderValue}`);
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

        if (discount > eligibleAmount) {
            discount = eligibleAmount;
        }

        const finalAmount = cartTotal - discount;

        cart.appliedCoupon = {
            code: coupon.code,
            couponId: coupon._id,
            discount: discount,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            eligibleAmount: eligibleAmount,
            cartTotal: cartTotal,
            finalAmount: finalAmount
        };

        await cart.save();

        return sendSuccessResponse(res, "Coupon applied successfully", {
            cartId: cart._id,
            items: cart.items,
            appliedCoupon: cart.appliedCoupon,
            originalAmount: cartTotal,
            discount,
            finalAmount
        });
    } catch (error) {
        console.error("applyCouponController error:", error);
        return sendErrorResponse(res, 500, "Error applying coupon", error.message);
    }
};

export const removeCouponController = async (req, res) => {
    try {
        const { id: userId } = req.user;

        const cart = await cartModel.findOne({ userId }).populate("items.productId");
        if (!cart) {
            return sendNotFoundResponse(res, "Cart not found");
        }

        const removedCoupon = cart.appliedCoupon;
        cart.appliedCoupon = undefined;
        await cart.save();

        let cartTotal = 0;
        cart.items.forEach(item => {
            const product = item.productId;
            if (!product) return;

            const selectedPack = product.packSizes?.find(
                p => p._id.toString() === item.packSizeId.toString()
            );
            if (selectedPack) {
                cartTotal += selectedPack.price * item.quantity;
            }
        });

        return sendSuccessResponse(res, "Coupon removed successfully", {
            cartId: cart._id,
            items: cart.items,
            originalAmount: cartTotal,
            finalAmount: cartTotal,
            discount: 0,
            removedCoupon
        });
    } catch (error) {
        console.error("removeCouponController error:", error);
        return sendErrorResponse(res, 500, "Error removing coupon", error.message);
    }
};