import express from 'express';
import { AuthController } from '../controller/auth.controller.js';
import { newSellerController, verifySellerMobileOtpController, sellerLoginController, sellerForgetPasswordController, sellerVerifyForgetOtpController, sellerPasswordResetController, sellerGstVerifyAndInsertController, setSellerBusinessAddressController, sellerGstResetOtpController, sellerBrandInfoAddController, sellerBankInfoSetController, sellerPickUpAddressSetController, trueSellerAgreementController } from '../controller/seller.controller.js';
import { CategoryController } from '../controller/category.controller.js';
import { isAdmin, sellerAuth, UserAuth } from '../middleware/auth.middleware.js';
import { processAndUploadMedia, upload, uploadMedia } from '../middleware/imageUpload.js';
import { createProduct, deleteProduct, getAllProduct, getProductById, updateProduct } from '../controller/product.controller.js';
import { getProfileController, userAddressAddController, userAddressUpdatecontroller, userProfileUpdateController } from '../controller/profile.controller.js';

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
// indexRouter.post("/createCategory", UserAuth, isAdmin, uploadMedia, processAndUploadMedia, CategoryController.createCategory)
// indexRouter.get("/getAllCategory", UserAuth, CategoryController.getAllCategory)
// indexRouter.get("/getCategoryById/:id", UserAuth, CategoryController.getCategoryById)
// indexRouter.put("/updateCategory/:id", UserAuth, isAdmin, uploadMedia, processAndUploadMedia, CategoryController.updateCategory)
// indexRouter.delete("/deleteCategory/:id", UserAuth, isAdmin, CategoryController.deleteCategory)

// Product
indexRouter.post("/createProduct", sellerAuth, createProduct)
indexRouter.get("/getAllProduct", getAllProduct)
indexRouter.get("/getProductById/:id", getProductById)
indexRouter.put("/updateProduct/:id", sellerAuth, updateProduct)
indexRouter.delete("/deleteProduct/:id", sellerAuth, deleteProduct)


//seller.kyc.router.js
indexRouter.post("/seller/gst/verify", sellerAuth, sellerGstVerifyAndInsertController);
indexRouter.post("/seller/business/address", sellerAuth, setSellerBusinessAddressController); //business info save + otp send for GST verify
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
//add address
indexRouter.post("/user/address", UserAuth, userAddressAddController);
//update Addree
indexRouter.patch("/user/address/update/:addressId", UserAuth, userAddressUpdatecontroller);

export default indexRouter;