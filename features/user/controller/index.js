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
const { sequelize } = require("../../../core/db_config");
const { generateUserId, generatePin } = require("../../../utils/stringFormatter");

exports.getByPagination = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || "";
    const roleFilter = req.query.role || "";

    const whereCondition = {};

    if (search) {
      whereCondition[Op.or] = [
        { nama_lengkap: { [Op.like]: `%${search}%` } },
        { user_id: { [Op.like]: `%${search}%` } },
      ];
    }

    if (roleFilter) {
      const userRoles = await UserRole.findAll({
        where: { id_role: roleFilter },
        attributes: ["id_user"],
      });
      const userIds = userRoles.map((ur) => ur.id_user);

      whereCondition.id = { [Op.in]: userIds };
    }

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
      distinct: true,
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
    return errorResponse(res, "Internal Server Error", 500);
  }
};

exports.createUser = async (req, res) => {
  try {
    const { id_role, username, ...userData } = req.body;

    const existing = await User.findOne({ where: { user_id: username } });
    if (existing) {
      return failResponse(res, "NIK/NIP sudah digunakan", 400);
    }

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
    return errorResponse(res, "Internal Server Error", 500);
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

    const avatarFile = user.avatar ? user.avatar : "default.jpg";

    const userData = user.toJSON();

    userData.avatar = getFileUrl(req, "profile", avatarFile);

    const role = userData.Roles;

    delete userData.Roles;

    const result = {
      ...userData,
      role,
    };

    return successResponse(res, "Data berhasil dimuat", result);
  } catch (error) {
    return errorResponse(res, "Internal Server Error", 500);
  }
};

exports.updateById = async (req, res) => {
  try {
    const { id } = req.params;
    const { id_role, username, ...userData } = req.body;

    if (username) {
      const existing = await User.findOne({
        where: {
          user_id: username,
          id: { [Op.ne]: id },
        },
      });

      if (existing) {
        return failResponse(res, "NIK/NIP sudah digunakan", 400);
      }
    }

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
    return errorResponse(res, "Internal Server Error", 500);
  }
};

exports.deleteById = async (req, res) => {
  try {
    const { id } = req.params;

    await User.destroy({ where: { id } });

    return successResponse(res, "Data berhasil dihapus");
  } catch (error) {
    return errorResponse(res, "Internal Server Error", 500);
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
    return errorResponse(res, "Internal Server Error", 500);
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
      const userData = user.toJSON(); 

      const avatarFile = userData.avatar ? userData.avatar : "default.jpg";

      userData.avatar = getFileUrl(req, "profile", avatarFile);

      return userData; 
    });

    return successResponse(res, "Data berhasil dimuat", formattedUser);
  } catch (error) {
    return errorResponse(res, "Internal Server Error", 500);
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
      const userData = user.toJSON(); 

      const avatarFile = userData.avatar ? userData.avatar : "default.jpg";
      userData.avatar = getFileUrl(req, "profile", avatarFile);

      return userData; 
    });

    return successResponse(res, "Data berhasil dimuat", formattedUser);
  } catch (error) {
    return errorResponse(res, "Internal Server Error", 500);
  }
};

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
    return errorResponse(res, "Internal Server Error", 500);
  }
};

exports.getUsersByIds = async (req, res) => {
  try {
    const { ids } = req.query;
    if (!ids) return successResponse(res, "Data berhasil dimuat", []);

    const idArray = ids.split(",").map(Number).filter((id) => !isNaN(id) && id > 0);

    const users = await User.findAll({
      where: { id: { [Op.in]: idArray } },
      attributes: ["id", "nama_lengkap"],
    });

    return successResponse(res, "Data berhasil dimuat", users);
  } catch (error) {
    return errorResponse(res, "Internal Server Error", 500);
  }
};

exports.createOperatorPT = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const {
      id_pt, 
      nama_pt,
      namaOperator, 
      emailOperator, 
      noTeleponOperator
    } = req.body;

    if (!id_pt) {
      return failResponse(res, "ID Perguruan Tinggi (id_pt) wajib dikirim", 400);
    }

    const opUserId = generateUserId(8);
    const opPin = generatePin(6);
    const hashedOpPin = await argon2.hash(opPin);

    const operator = await User.create({
      nama_lengkap: namaOperator,
      email: emailOperator,
      no_hp: noTeleponOperator,
      user_id: opUserId,
      pin: hashedOpPin,
      id_lembaga_pendidikan: id_pt,
      lembaga_pendidikan: nama_pt,
      is_active: 1
    }, { transaction });
    
    await UserRole.create({ id_user: operator.id, id_role: 111 }, { transaction });

    await transaction.commit();

    return successResponse(res, "Akun Operator PT berhasil dibuat", {
      operator: { user_id: opUserId, pin: opPin }
    });

  } catch (error) {
    await transaction.rollback();
    return errorResponse(res, "Internal Server Error saat membuat akun PT", 500);
  }
};

exports.updateOperatorPT = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id_pt } = req.params;
    const {
      nama_pt,
      namaOperator, 
      emailOperator, 
      noTeleponOperator
    } = req.body;

    const existingOp = await User.findOne({
      where: { id_lembaga_pendidikan: id_pt },
      include: [{ model: Role, where: { id: 111 }, through: { attributes: [] } }]
    });


    
    let newCredentials = null; 

    if (existingOp) {
      await User.update({
        nama_lengkap: namaOperator,
        email: emailOperator,
        no_hp: noTeleponOperator,
        lembaga_pendidikan: nama_pt
      }, { where: { id: existingOp.id }, transaction });
    } else if (namaOperator) {
      const opUserId = generateUserId(8);
      const opPin = generatePin(6);
      const hashedOpPin = await argon2.hash(opPin);
      
      const newOp = await User.create({
        nama_lengkap: namaOperator, email: emailOperator, no_hp: noTeleponOperator,
        user_id: opUserId, pin: hashedOpPin, id_lembaga_pendidikan: id_pt,
        lembaga_pendidikan: nama_pt, is_active: 1
      }, { transaction });
      
      await UserRole.create({ id_user: newOp.id, id_role: 111 }, { transaction });

      newCredentials = {
        user_id: opUserId,
        pin: opPin
      };
    }

    await transaction.commit();

    return successResponse(
      res, 
      "Akun Operator PT berhasil diupdate", 
      newCredentials ? { operator: newCredentials } : null
    );

  } catch (error) {
    await transaction.rollback();
    return errorResponse(res, "Internal Server Error saat update akun PT", 500);
  }
};