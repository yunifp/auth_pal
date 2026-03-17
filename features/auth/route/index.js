const express = require("express");
const router = express.Router();

const {
  login,
  register,
  updateProfile,
  getProfile,
  refreshToken,
  logout,
  getCaptcha,
  verifyCaptcha,
  forgotPin, 
  resetPin
} = require("../controller");
const {
  uploadConfigs,
} = require("../../../common/middleware/upload_middleware");

router.get("/profile", getProfile);
router.post("/login", login);
router.post(
  "/register",
  uploadConfigs.surat_penunjukan.single("surat_penunjukan"),
  register,
);
router.put("/profile", uploadConfigs.profile.single("avatar"), updateProfile);
router.post("/refresh-token", refreshToken);
router.post("/logout", logout);
router.post("/forgot-pin", forgotPin);
router.post("/reset-pin/:id/:token", resetPin);

router.get("/captcha", getCaptcha);
router.post("/verify-captcha", verifyCaptcha);

module.exports = router;
