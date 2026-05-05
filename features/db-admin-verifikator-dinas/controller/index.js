const Role = require("../../../models/Role");
const {
  successResponse,
  failResponse,
  errorResponse,
} = require("../../../common/response");
const { Op } = require("sequelize");
const { User, UserRole } = require("../../../models");
const { safeSplit } = require("../../../utils/stringFormatter");
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
          [Op.or]: [
            { nama_lengkap: { [Op.like]: `%${search}%` } },
            { user_id: { [Op.like]: `%${search}%` } },
          ],
        }
      : {};

    const { count, rows } = await User.findAndCountAll({
      where: whereCondition,
      include: [
        {
          model: Role,
          attributes: [],
          where: {
            id: {
              [Op.in]: [3, 4, 5], 
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
      order: [["id", "DESC"]],
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
    return errorResponse(res, "Internal Server Error");
  }
};

exports.create = async (req, res) => {
  try {
    const { 
      jenis_akun, 
      username, 
      password, 
      nama_lengkap, 
      nama, 
      no_hp, 
      email, 
      perguruan_tinggi, 
      jenjang, 
      provinsi, 
      kabkota, 
      is_active 
    } = req.body;

    const surat_penunjukan = req.file ? (req.file.filename || req.file.key) : null;

    const [idPerguruanTinggi, namaPerguruanTinggi] = safeSplit(perguruan_tinggi);
    const [idJenjang, namaJenjang] = safeSplit(jenjang);
    const [kodeProv, namaProv] = safeSplit(provinsi);
    const [kodeKab, namaKab] = safeSplit(kabkota);

    let hashedPin = null;
    if (password) {
      hashedPin = await argon2.hash(password);
    } else {
      hashedPin = await argon2.hash("123456");
    }

    const insertData = {
      user_id: username,
      pin: hashedPin,
      nama_lengkap: nama_lengkap || nama,
      email,
      no_hp,
      id_perguruan_tinggi: idPerguruanTinggi,
      perguruan_tinggi: namaPerguruanTinggi,
      id_jenjang: idJenjang,
      jenjang: namaJenjang,
      kode_prov: kodeProv,
      prov: namaProv,
      kode_kab: kodeKab,
      kab_kota: namaKab,
      surat_penunjukan,
      is_active: is_active !== undefined ? is_active : 1,
    };

    const user = await User.create(insertData);

    if (jenis_akun) {
      await UserRole.create({ id_user: user.id, id_role: jenis_akun });
    }

    return successResponse(res, "Akun instansi berhasil ditambahkan");
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
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
        "nama_lengkap",
        "email",
        "no_hp",
        "id_perguruan_tinggi",
        "perguruan_tinggi",
        "id_jenjang",
        "jenjang",
        "kode_prov",
        "prov",
        "kode_kab",
        "kab_kota",
        "surat_penunjukan",
        "is_active",
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

    userData.jenis_akun = role?.id_role ? String(role.id_role) : null;
    userData.username = userData.user_id; 
    userData.nama = userData.nama_lengkap;

    userData.perguruan_tinggi = userData.id_perguruan_tinggi && userData.perguruan_tinggi
      ? `${userData.id_perguruan_tinggi}#${userData.perguruan_tinggi}`
      : null;
      
    userData.jenjang = userData.id_jenjang && userData.jenjang
      ? `${userData.id_jenjang}#${userData.jenjang}`
      : null;
      
    userData.provinsi = userData.kode_prov && userData.prov
      ? `${userData.kode_prov}#${userData.prov}`
      : null;
      
    userData.kabkota = userData.kode_kab && userData.kab_kota
      ? `${userData.kode_kab}#${userData.kab_kota}`
      : null;

    return successResponse(res, "Data berhasil dimuat", userData);
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.updateById = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      jenis_akun, 
      username, 
      password, 
      nama_lengkap, 
      nama, 
      no_hp, 
      email, 
      perguruan_tinggi, 
      jenjang, 
      provinsi, 
      kabkota, 
      is_active 
    } = req.body;

    const surat_penunjukan = req.file ? (req.file.filename || req.file.key) : null;

    const [idPerguruanTinggi, namaPerguruanTinggi] = safeSplit(perguruan_tinggi);
    const [idJenjang, namaJenjang] = safeSplit(jenjang);
    const [kodeProv, namaProv] = safeSplit(provinsi);
    const [kodeKab, namaKab] = safeSplit(kabkota);

    const updateData = {
      user_id: username,
      nama_lengkap: nama_lengkap || nama,
      no_hp,
      email,
      id_perguruan_tinggi: idPerguruanTinggi || null,
      perguruan_tinggi: namaPerguruanTinggi || null,
      id_jenjang: idJenjang || null,
      jenjang: namaJenjang || null,
      kode_prov: kodeProv || null,
      prov: namaProv || null,
      kode_kab: kodeKab || null,
      kab_kota: namaKab || null,
      is_active,
    };

    if (password) {
      updateData.pin = await argon2.hash(password);
    }

    if (surat_penunjukan) {
      updateData.surat_penunjukan = surat_penunjukan;
    }

    await User.update(updateData, { where: { id } });

    if (jenis_akun) {
      await UserRole.destroy({ where: { id_user: id } });
      await UserRole.create({ id_user: id, id_role: jenis_akun });
    }

    return successResponse(res, "Data dan role berhasil diperbarui");
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.deleteById = async (req, res) => {
  try {
    const { id } = req.params;
    await UserRole.destroy({ where: { id_user: id } });
    await User.destroy({ where: { id } });

    return successResponse(res, "Data berhasil dihapus");
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};