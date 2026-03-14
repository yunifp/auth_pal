const { User, Role, UserRole } = require("../../../models");
const {
  successResponse,
  failResponse,
  errorResponse,
} = require("../../../common/response");
const argon2 = require("argon2");
const ExcelJS = require("exceljs");
const { Op } = require("sequelize");
const { getFileUrl } = require("../../../common/middleware/upload_middleware");

exports.getByPagination = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || "";

    const whereCondition = search
      ? {
        [Op.or]: [
          { nama: { [Op.like]: `%${search}%` } },
          { username: { [Op.like]: `%${search}%` } },
        ],
      }
      : {};

    const { count, rows } = await User.findAndCountAll({
      where: whereCondition,
      limit,
      offset,
      order: [["created_at", "ASC"]],
      include: [
        {
          model: Role,
          attributes: ["id", "nama"],
          through: { attributes: [] },
        },
      ],
      distinct: true, // penting agar count menghitung user unik
    });

    const resultWithRoles = rows.map((user) => {
      const userJson = user.toJSON();
      return {
        ...userJson,
        role:
          userJson.Roles?.map((role) => ({
            id: role.id,
            nama: role.nama,
          })) || [],
        Roles: undefined,
      };
    });

    return successResponse(res, "Data berhasil dimuat", {
      result: resultWithRoles,
      total: count,
      currentPage: page,
      totalPages: Math.ceil(count / limit),
    });
  } catch (error) {
    return res.status(500).json(errorResponse("Internal Server Error"));
  }
};

exports.createUser = async (req, res) => {
  try {
    const { id_role, username, ...userData } = req.body;

    // Cek apakah username sudah digunakan
    const existing = await User.findOne({ where: { user_id: username } });
    if (existing) {
      return failResponse(res, "NIK/NIP sudah digunakan", 400);
    }

    // Cek apakah ada file gambar yang diupload
    if (req.file) {
      userData.avatar = req.file.filename;
    }

    const hashedPassword = await argon2.hash(userData.password);
    const user = await User.create({
      ...userData,
      nama_lengkap: userData.nama,
      user_id: username,
      pin: hashedPassword,
    });

    if (Array.isArray(id_role) && id_role.length > 0) {
      await user.setRoles(id_role);
    }

    return successResponse(res, "User berhasil ditambahkan");
  } catch (error) {
    console.error(error);
    return res.status(500).json(errorResponse("Internal Server Error"));
  }
};

exports.getDetailById = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findOne({
      where: { id },
      attributes: { exclude: ["password"] },
      include: [
        {
          model: Role,
          through: { attributes: [] },
        },
      ],
    });

    if (!user) return failResponse(res, "Data tidak ditemukan", 200);

    // gunakan user.avatar bukan userRaw.avatar
    const avatarFile = user.avatar ? user.avatar : "default.jpg";

    // convert user ke plain object
    const userData = user.toJSON();

    // override avatar url
    userData.avatar = getFileUrl(req, "profile", avatarFile);

    // ambil role dari userData.Roles dan rename ke role
    const role = userData.Roles;

    // hapus properti Roles agar tidak dobel
    delete userData.Roles;

    // hasil akhir
    const result = {
      ...userData,
      role,
    };

    console.log(result);

    return successResponse(res, "Data berhasil dimuat", result);
  } catch (error) {
    return res.status(500).json(errorResponse("Internal Server Error"));
  }
};

exports.updateById = async (req, res) => {
  try {
    const { id } = req.params;
    const { id_role, username, ...userData } = req.body;

    // Cek apakah username digunakan oleh user lain
    if (username) {
      const existing = await User.findOne({
        where: {
          user_id: username,
          id: { [Op.ne]: id }, // selain user ini
        },
      });

      if (existing) {
        return failResponse(res, "NIK/NIP sudah digunakan", 400);
      }
    }

    // Cek apakah ada file gambar yang diupload
    if (req.file) {
      userData.avatar = req.file.filename;
    }

    const [affectedRows] = await User.update(
      { ...userData, user_id: username },
      { where: { id } },
    );

    if (affectedRows === 0) {
      return failResponse(res, "Data tidak ditemukan", 404);
    }

    if (Array.isArray(id_role)) {
      const user = await User.findByPk(id);
      if (!user) {
        return failResponse(res, "Data tidak ditemukan", 404);
      }
      await user.setRoles(id_role);
    }

    const updatedUser = await User.findByPk(id, {
      attributes: { exclude: ["password"] },
      include: [
        {
          model: Role,
          through: { attributes: [] },
        },
      ],
    });

    const userDataJson = updatedUser.toJSON();
    const avatarFile = userDataJson.avatar || "default.jpg";
    userDataJson.avatar = getFileUrl(req, "profile", avatarFile);

    const result = {
      ...userDataJson,
      role: userDataJson.Roles,
    };
    delete result.Roles;

    return successResponse(res, "Data berhasil diperbarui", result);
  } catch (error) {
    console.error(error);
    return res.status(500).json(errorResponse("Internal Server Error"));
  }
};

exports.deleteById = async (req, res) => {
  try {
    const { id } = req.params;

    // Menghapus data berdasarkan id
    await User.destroy({ where: { id } });

    return successResponse(res, "Data berhasil dihapus");
  } catch (error) {
    return res.status(500).json(errorResponse("Internal Server Error"));
  }
};

exports.exportExcel = async (req, res) => {
  try {
    const users = await User.findAll({
      include: [
        {
          model: Role,
          attributes: { exclude: ["password"] },
          through: { attributes: [] },
        },
      ],
    });

    const resultWithRoles = users.map((user) => {
      const userJson = user.toJSON();
      return {
        ...userJson,
        role: userJson.Roles?.map((role) => role.nama) || [],
        Roles: undefined,
      };
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Users");

    worksheet.columns = [
      { header: "Nama", key: "nama", width: 20 },
      { header: "Username", key: "username", width: 20 },
      { header: "Role", key: "role", width: 20 },
      { header: "Status", key: "is_active", width: 20 },
      { header: "Waktu Dibuat", key: "created_at", width: 20 },
      { header: "Waktu Diubah", key: "updated_at", width: 20 },
    ];

    worksheet.addRows(resultWithRoles);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", "attachment; filename=users.xlsx");

    await workbook.xlsx.write(res);
  } catch (error) {
    return res.status(500).json(errorResponse("Internal Server Error"));
  }
};

exports.getOpPt = async (req, res) => {
  try {
    const { id_pt } = req.params;

    const users = await User.findAll({
      where: { id_lembaga_pendidikan: id_pt },
      attributes: { exclude: ["password"] },
      include: [
        {
          model: Role,
          where: { id: 8 },
          through: { attributes: [] },
          required: true,
        },
      ],
    });

    if (!users || users.length === 0)
      return failResponse(res, "Data tidak ditemukan", 200);

    const formattedUser = users.map((user) => {
      const userData = user.toJSON(); // ✅ convert dulu

      const avatarFile = userData.avatar ? userData.avatar : "default.jpg";

      userData.avatar = getFileUrl(req, "profile", avatarFile);

      return userData; // ✅ WAJIB return
    });

    return successResponse(res, "Data berhasil dimuat", formattedUser);
  } catch (error) {
    return errorResponse("Internal Server Error");
  }
};

exports.getVerifPt = async (req, res) => {
  try {
    const { id_pt } = req.params;

    const users = await User.findAll({
      where: { id_lembaga_pendidikan: id_pt },
      attributes: { exclude: ["password"] },
      include: [
        {
          model: Role,
          where: { id: 9 },
          through: { attributes: [] },
          required: true,
        },
      ],
    });

    if (!users || users.length === 0)
      return failResponse(res, "Data tidak ditemukan", 200);

    const formattedUser = users.map((user) => {
      const userData = user.toJSON(); // convert dulu ke plain object

      const avatarFile = userData.avatar ? userData.avatar : "default.jpg";
      userData.avatar = getFileUrl(req, "profile", avatarFile);

      return userData; // wajib return di map
    });

    return successResponse(res, "Data berhasil dimuat", formattedUser);
  } catch (error) {
    console.log(error);
    return errorResponse("Internal Server Error");
  }
};

// Tambahkan di user controller
exports.getVerifikatorIds = async (req, res) => {
  try {
    const userRoles = await UserRole.findAll({
      where: { id_role: 15 },
      attributes: ["id_user"],
      order: [["id_user", "ASC"]],
    });

    const ids = userRoles.map((ur) => ur.id_user);

    return successResponse(res, "Data berhasil dimuat", ids);
  } catch (error) {
    return res.status(500).json(errorResponse("Internal Server Error"));
  }
};