const express = require("express");
const router = express.Router();

const {
  getMenusByRole,
  getByPagination,
  getAll,
  createMenu,
  updateById,
  getDetailById,
  deleteById,
  getMenusAccess,
  updateMenuAccess,
} = require("../controller");

router.get("/", getByPagination);
router.get("/all", getAll);
router.get("/role/:id", getMenusByRole);
router.get("/access/:id", getMenusAccess);
router.get("/:id", getDetailById);
router.post("/", createMenu);
router.put("/access/:id", updateMenuAccess);
router.put("/:id", updateById);
router.delete("/:id", deleteById);

module.exports = router;
