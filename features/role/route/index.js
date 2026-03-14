const express = require("express");
const router = express.Router();

const {
  getByPagination,
  createRole,
  getDetailById,
  updateById,
  deleteById,
  getAll,
} = require("../controller");

router.get("/all", getAll);
router.get("/", getByPagination);
router.get("/:id", getDetailById);
router.post("/", createRole);
router.put("/:id", updateById);
router.delete("/:id", deleteById);

module.exports = router;
