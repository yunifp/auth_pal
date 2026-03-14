const express = require("express");
const router = express.Router();

const {
  getByPagination,
  getDetailById,
  updateById,
  deleteById,
  create,
} = require("../controller");
const {
  uploadConfigs,
} = require("../../../common/middleware/upload_middleware");

router.get("/", getByPagination);
router.get("/:id", getDetailById);
router.post(
  "/",
  uploadConfigs.surat_penunjukan.single("surat_penunjukan"),
  create,
);
router.put(
  "/:id",
  uploadConfigs.surat_penunjukan.single("surat_penunjukan"),
  updateById,
);
router.delete("/:id", deleteById);

module.exports = router;
