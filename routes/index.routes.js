import express from 'express';
import { AuthController } from '../controller/auth.controller.js';
import { newSellerController, verifySellerMobileOtpController, sellerLoginController, sellerForgetPasswordController, sellerVerifyForgetOtpController, sellerPasswordResetController, sellerGstVerifyAndInsertController, setSellerBusinessAddressController, sellerGstResetOtpController, sellerBrandInfoAddController, sellerBankInfoSetController, sellerPickUpAddressSetController, trueSellerAgreementController, getAllSeller, getSeller, verifySellerOtpController } from '../controller/seller.controller.js';
import { CategoryController } from '../controller/category.controller.js';
import { isUser, sellerAuth, UserAuth } from '../middleware/auth.middleware.js';
import { upload } from '../middleware/imageUpload.js';
import { getProfileController, getSellerProfileController, getUserAddressController, userAddressAddController, userAddressDeleteController, userAddressUpdatecontroller, userPasswordChangeController, userProfileUpdateController, userRemoveAccountController } from '../controller/profile.controller.js';
import { filterProductController, getAllProductsController, getPackSizeByIdController, getProductByCategoryController, getProductDetailController, newProductController, searchProductController } from '../controller/product.controller.js';
import { addToCartController, deleteCartItemController, getMyCartController, updateCartItemController } from '../controller/cart.controller.js';
import { createCoupon, deleteCoupon, getAllCoupon, getCouponById, updateCoupon } from '../controller/coupon.controller.js';
import { makeNewPaymentController } from '../controller/payment.controller.js';
import { cancelMyOrderController, deleteMyOrderController, myOrderController, newOrderController, selectUserAddressController, sellerChangeOrderStatusController, updateMyOrderController } from '../controller/order.controller.js';

const indexRouter = express.Router();

//base url = domain/api

//register
indexRouter.post("/new/user", AuthController.newUserRegisterController);
indexRouter.post("/verfiy/motp", AuthController.verifyMobileOtpController);

//register & login with (google/facebook)
indexRouter.post("/new/social/user", AuthController.newSocialRegisterLoginController)

//User login
indexRouter.post("/login", AuthController.userLoginController);
indexRouter.post("/forget/password", AuthController.sendForgotMailOtpController);
indexRouter.post("/verify/forget/password", AuthController.verifyForgetOtpController)
indexRouter.post("/reset/password", AuthController.resetPasswordController);

//seller.router.js
indexRouter.post("/new/seller", newSellerController)
indexRouter.post("/verify/seller/otp", verifySellerMobileOtpController)
indexRouter.post("/seller/login", sellerLoginController)
indexRouter.post("/seller/forget/password", sellerForgetPasswordController);
indexRouter.post("/seller/verify/forget/password", sellerVerifyForgetOtpController)
indexRouter.post("/seller/reset/password", sellerPasswordResetController);

// Category 
indexRouter.post("/createCategory", sellerAuth, upload.single("category_image"), CategoryController.createCategory)
indexRouter.get("/getAllCategory", CategoryController.getAllCategory)
indexRouter.get("/getCategoryById/:id", CategoryController.getCategoryById)
indexRouter.put("/updateCategory/:id", sellerAuth, upload.single("category_image"), CategoryController.updateCategory)
indexRouter.delete("/deleteCategory/:id", sellerAuth, CategoryController.deleteCategory)

// Product
indexRouter.post("/new/product", sellerAuth, upload.fields([{ name: "productImage", maxCount: 1 }, { name: "gImage", maxCount: 5 }]), newProductController);
indexRouter.get("/all/products", getAllProductsController); // *
indexRouter.get("/get/short/productBycategory/:categoryId", getProductByCategoryController);
indexRouter.get("/get/product/detail/:productId", getProductDetailController)
indexRouter.get("/search", searchProductController);
indexRouter.get("/filter", filterProductController);
indexRouter.get("/packSize/:packSizeId", getPackSizeByIdController);


//seller.kyc.router.js
indexRouter.post("/seller/gst/verify", sellerAuth, sellerGstVerifyAndInsertController);
indexRouter.post("/seller/business/address", sellerAuth, setSellerBusinessAddressController); //business info save + otp send for GST verify
indexRouter.post("/seller/verify/otp", sellerAuth, verifySellerOtpController)
indexRouter.post("/seller/gst/reset/otp", sellerAuth, sellerGstResetOtpController); //resend gst verif y OTP

//seller.brand.info.router.js
indexRouter.post("/seller/brand/info", sellerAuth, sellerBrandInfoAddController);
//seller bank detail verify & insert record
indexRouter.post("/seller/bank/insert", sellerAuth, sellerBankInfoSetController);
//seller.pickup.address.js
indexRouter.post("/seller/pickup/address", sellerAuth, sellerPickUpAddressSetController)
//seller agreement accept or not
indexRouter.post('/seller/agreement', sellerAuth, trueSellerAgreementController);


//profile.route.js
indexRouter.get("/user/profile", UserAuth, getProfileController);
//update email,name,mobile No,avatar;
indexRouter.patch("/user/profile/update", UserAuth, upload.single("avatar"), userProfileUpdateController);

//user address
indexRouter.post("/user/address", UserAuth, userAddressAddController);
indexRouter.patch("/user/address/update/:addressId", UserAuth, userAddressUpdatecontroller);
indexRouter.delete("/user/address/delete/:addressId", UserAuth, updateCartItemController);
indexRouter.get("/user/address", UserAuth, getUserAddressController);

//cart.route.js
indexRouter.post("/add/cart/:productId", UserAuth, addToCartController);
indexRouter.get("/my/cart", UserAuth, getMyCartController)
indexRouter.patch("/update/cart/:productId", UserAuth, updateCartItemController)
indexRouter.delete("/delete/item/:cartItemId", UserAuth, deleteCartItemController)


//change password
indexRouter.post("/user/change/password", UserAuth, userPasswordChangeController);
//delete Account
indexRouter.delete("/user/remove/account", UserAuth, userRemoveAccountController);
//seller.profile
indexRouter.get("/seller/profile", sellerAuth, getSellerProfileController);

//admin api
indexRouter.get("/getAllnewUser", AuthController.getAllnewUser)
indexRouter.get("/getUser", UserAuth, AuthController.getUser)
indexRouter.get("/getAllSeller", getAllSeller)
indexRouter.get("/getSeller", sellerAuth, getSeller)

// Coupon
indexRouter.post("/seller/createCoupon", sellerAuth, createCoupon)
indexRouter.get("/getAllCoupon", UserAuth, getAllCoupon)
indexRouter.get("/getCouponById/:id", UserAuth, getCouponById)
indexRouter.patch("/seller/updateCoupon/:id", sellerAuth, updateCoupon)
indexRouter.delete("/seller/deleteCoupon/:id", sellerAuth, deleteCoupon)

// Payment
// indexRouter.post("/user/createPayment", UserAuth, isUser, createPayment)
// indexRouter.get("/getAllPayment", UserAuth, getAllPayment)
// indexRouter.get("/getPaymentById/:id", UserAuth, getPaymentById)
// indexRouter.get("/getUserPayment", UserAuth, getUserPayment)
// indexRouter.patch("/user/updatePayment/:id", UserAuth, updatePayment)
// indexRouter.delete("/user/deletePayment/:id", UserAuth, deletePayment)



//order.routes.js
indexRouter.put("/users/select-address/:addressId", UserAuth, selectUserAddressController)
indexRouter.post("/new/order", UserAuth, newOrderController)
indexRouter.patch("/update/myorder/:orderId", UserAuth, updateMyOrderController);
indexRouter.delete("/delete/myorder/:itemId", UserAuth, deleteMyOrderController)
indexRouter.post("/user/order/cancel/:itemId", UserAuth, cancelMyOrderController)
indexRouter.patch("/order/status/:itemId", sellerAuth, sellerChangeOrderStatusController)



// payment.route.js
// make payment

indexRouter.post("/new/payment", UserAuth, makeNewPaymentController);
indexRouter.get("/my/order", UserAuth, myOrderController)

export default indexRouter;