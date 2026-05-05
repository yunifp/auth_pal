const Role = require("../../../models/Role");
const {
  successResponse,
  failResponse,
  errorResponse,
} = require("../../../common/response");
const { Op } = require("sequelize");
const { User, UserRole } = require("../../../models");
const {
  safeSplit,
  generateUserId,
  generatePin,
} = require("../../../utils/stringFormatter");
const argon2 = require("argon2");
const { getFileUrl } = require("../../../common/middleware/upload_middleware");

exports.getByPagination = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || "";
    const whereCondition = search
      ? {
          [Op.or]: [{ nama_lengkap: { [Op.like]: `%${search}%` } }],
        }
      : {};

    if (req.query.lpId) {
      whereCondition.id_lembaga_pendidikan = req.query.lpId;
    }

    const { count, rows } = await User.findAndCountAll({
      where: whereCondition,
      include: [
        {
          model: Role,
          attributes: [],
          where: {
            id: {
              [Op.in]: [8, 9, 10],
            },
          },
          through: {
            attributes: [],
          },
          required: true,
        },
      ],
      limit,
      offset,
      order: [["id", "ASC"]],
      distinct: true,
    });

    const formattedRows = rows.map((user) => {
      const data = user.toJSON();

      if (data.surat_penunjukan) {
        data.surat_penunjukan = getFileUrl(
          req,
          "surat_penunjukan",
          data.surat_penunjukan,
        );
      }

      return data;
    });

    return successResponse(res, "Data berhasil dimuat", {
      result: formattedRows,
      total: count,
      currentPage: page,
      totalPages: Math.ceil(count / limit),
    });
  } catch (error) {
    return errorResponse("Internal Server Error");
  }
};

exports.create = async (req, res) => {
  try {
    const {
      jenis_akun,
      jabatan,
      lembaga_pendidikan,
      nama,
      no_hp,
      email,
      is_active,
    } = req.body;

    const surat_penunjukan = req.file ? (req.file.filename || req.file.key) : null;

    const [idLembagaPendidikan, namaLembagaPendidikan] =
      safeSplit(lembaga_pendidikan);

    const user_id = generateUserId(8);

    const pinGenerated = generatePin(6);
    const hashedPin = await argon2.hash("123123");

    const insertData = {
      jenis_akun,
      jabatan,
      id_lembaga_pendidikan: idLembagaPendidikan,
      lembaga_pendidikan: namaLembagaPendidikan,
      nama_lengkap: nama,
      no_hp,
      email,
      surat_penunjukan,
      user_id,
      pin: hashedPin,
      is_active,
    };

    const user = await User.create(insertData);

    const insertId = user.id;

    await UserRole.create({ id_user: insertId, id_role: jenis_akun });

    return successResponse(res, "Data berhasil ditambahkan");
  } catch (error) {
    return errorResponse("Internal Server Error");
  }
};

exports.getDetailById = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findOne({
      where: { id },
      attributes: [
        "id",
        "user_id",
        "id_lembaga_pendidikan",
        "lembaga_pendidikan",
        "nama_lengkap",
        "no_hp",
        "email",
        "surat_penunjukan",
        "is_active",
        "jabatan",
      ],
    });

    if (!user) return failResponse(res, "Data tidak ditemukan", 200);

    const userData = user.get({ plain: true });

    if (userData.surat_penunjukan) {
      userData.surat_penunjukan = getFileUrl(
        req,
        "surat_penunjukan",
        userData.surat_penunjukan,
      );
    }

    const role = await UserRole.findOne({
      where: { id_user: id },
    });

    userData.jenis_akun = role?.id_role || null;

    return successResponse(res, "Data berhasil dimuat", userData);
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.updateById = async (req, res) => {
  try {
    const {
      jenis_akun,
      lembaga_pendidikan,
      nama,
      no_hp,
      email,
      is_active,
      jabatan,
    } = req.body;

    const { id } = req.params;

    const surat_penunjukan = req.file ? (req.file.filename || req.file.key) : null;

    const [idLembagaPendidikan, namaLembagaPendidikan] =
      safeSplit(lembaga_pendidikan);

    const updateData = {
      jenis_akun,
      id_lembaga_pendidikan: idLembagaPendidikan,
      lembaga_pendidikan: namaLembagaPendidikan,
      nama_lengkap: nama,
      no_hp,
      email,
      is_active,
      jabatan,
    };

    if (surat_penunjukan) {
      updateData.surat_penunjukan = surat_penunjukan;
    }

    await User.update(updateData, { where: { id } });

    await UserRole.destroy({ where: { id_user: id } });

    await UserRole.create({ id_user: id, id_role: jenis_akun });

    return successResponse(res, "Data berhasil diperbarui");
  } catch (error) {
    return errorResponse("Internal Server Error");
  }
};

exports.deleteById = async (req, res) => {
  try {
    const { id } = req.params;

    await User.destroy({ where: { id } });

    return successResponse(res, "Data berhasil dihapus");
  } catch (error) {
    return errorResponse("Internal Server Error");
  }
};