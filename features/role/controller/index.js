const Role = require("../../../models/Role");
const {
  successResponse,
  failResponse,
  errorResponse,
} = require("../../../common/response");
const { Op } = require("sequelize");

exports.getAll = async (req, res) => {
  try {
    const roles = await Role.findAll();

    return successResponse(res, "Data berhasil dimuat", roles);
  } catch (error) {
    return res.status(500).json(errorResponse("Internal Server Error"));
  }
};

exports.getByPagination = async (req, res) => {
  try {
    // Ambil parameter page dan limit dari query, default ke 1 dan 10
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || "";
    const whereCondition = search
      ? {
          [Op.or]: [{ nama: { [Op.like]: `%${search}%` } }],
        }
      : {};

    // Ambil data role + total count
    const { count, rows } = await Role.findAndCountAll({
      where: whereCondition,
      limit,
      offset,
      order: [["id", "ASC"]],
    });

    return successResponse(res, "Data berhasil dimuat", {
      result: rows,
      total: count,
      current_page: page,
      total_pages: Math.ceil(count / limit),
    });
  } catch (error) {
    return res.status(500).json(errorResponse("Internal Server Error"));
  }
};

exports.createRole = async (req, res) => {
  try {
    const { nama } = req.body;

    // Cek apakah sudah ada nama yang sama
    const existing = await Role.findOne({ where: { nama } });
    if (existing) {
      return failResponse(res, "Nama role sudah digunakan", 400);
    }

    await Role.create({ nama });

    return successResponse(res, "Role berhasil ditambahkan");
  } catch (error) {
    return res.status(500).json(errorResponse("Internal Server Error"));
  }
};

exports.getDetailById = async (req, res) => {
  try {
    const { id } = req.params;

    const role = await Role.findOne({
      where: { id },
    });

    if (!role) return failResponse(res, "Data tidak ditemukan", 200);

    return successResponse(res, "Data berhasil dimuat", role);
  } catch (error) {
    console.error(error);
    return res.status(500).json(errorResponse("Internal Server Error"));
  }
};

exports.updateById = async (req, res) => {
  try {
    const { id } = req.params;
    const { nama } = req.body;

    // Cek apakah nama digunakan oleh role lain
    const existing = await Role.findOne({
      where: {
        nama,
        id: { [Op.ne]: id }, // selain id yang sedang di-update
      },
    });

    if (existing) {
      return failResponse(res, "Nama role sudah digunakan", 400);
    }

    await Role.update(req.body, { where: { id } });

    return successResponse(res, "Data berhasil diperbarui");
  } catch (error) {
    return res.status(500).json(errorResponse("Internal Server Error"));
  }
};

exports.deleteById = async (req, res) => {
  try {
    const { id } = req.params;

    // Menghapus data berdasarkan id
    await Role.destroy({ where: { id } });

    return successResponse(res, "Data berhasil dihapus");
  } catch (error) {
    return res.status(500).json(errorResponse("Internal Server Error"));
  }
};
