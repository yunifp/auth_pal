const express = require("express");
const router = express.Router();

const {
  getByPagination,
  getDetailById,
  updateById,
  deleteById,
  createUser,
  exportExcel,
  getOpPt,
  getVerifPt,
  getVerifikatorIds,
  getUsersByIds,
  createOperatorPT,
  updateOperatorPT
} = require("../controller");

const {
  uploadConfigs,
} = require("../../../common/middleware/upload_middleware");

router.get("/", getByPagination);
router.get("/by-ids", getUsersByIds);
router.get("/verifikator-ids", getVerifikatorIds);
router.get("/op-pt/:id_pt", getOpPt);
router.get("/verif-pt/:id_pt", getVerifPt);
router.get("/export-excel", exportExcel);

router.post("/pt-accounts", createOperatorPT);
router.put("/pt-accounts/:id_pt", updateOperatorPT);

router.post("/", uploadConfigs.profile.single("avatar"), createUser);
router.get("/:id", getDetailById);
router.put("/:id", uploadConfigs.profile.single("avatar"), updateById);
router.delete("/:id", deleteById);

module.exports = router;