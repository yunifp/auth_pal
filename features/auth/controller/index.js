const { RoleMenu, Menu, User, Role, UserRole } = require("../../../models");
const {
  successResponse,
  failResponse,
  errorResponse,
} = require("../../../common/response");

const argon2 = require("argon2");
const jwt = require("jsonwebtoken");
const { literal, Op } = require("sequelize");
const { getFileUrl } = require("../../../common/middleware/upload_middleware");
const {
  generateUserId,
  generatePin,
} = require("../../../utils/stringFormatter");
const { v4: uuidv4 } = require("uuid");

exports.login = async (req, res) => {
  const { user_id, pin, jenis_akun } = req.body;

  try {
    // Ambil user + roles sekaligus
    const user = await User.findOne({
      where: { user_id },
      include: [{ model: Role, through: { attributes: [] } }],
    });

    if (!user) return failResponse(res, "User ID atau PIN salah", 200);

    const valid = await argon2.verify(user.pin, pin);
    if (!valid) return failResponse(res, "User ID atau PIN salah", 200);

    if (!user.is_active)
      return failResponse(res, "Akun anda belum diverifikasi", 200);

    // Ambil semua id_role user, contoh: [1, 2]
    const roleIds = user.Roles.map((role) => role.id);

    // Validasi jenis_akun vs role, tapi pesan sama
    if (
      (jenis_akun === "penerima-beasiswa" && !roleIds.includes(1)) ||
      (jenis_akun === "instansi" && roleIds.includes(1))
    ) {
      return failResponse(res, "User ID atau PIN salah", 200);
    }

    // Ambil menu berdasarkan semua role user (id_role IN [...])
    const menusRaw = await Menu.findAll({
      include: [
        {
          model: RoleMenu,
          where: { id_role: { [Op.in]: roleIds } },
          attributes: ["access"], // ambil access
        },
      ],
      order: [
        [literal("`order` IS NULL"), "ASC"],
        ["order", "ASC"],
      ],
      distinct: true,
    });

    // Gabungkan akses per menu
    const menusWithAccess = menusRaw.map((menu) => {
      const accessSet = new Set();
      menu.RoleMenus.forEach((rm) => {
        if (rm.access) {
          rm.access.split("").forEach((char) => accessSet.add(char));
        }
      });
      const access = [...accessSet].sort().join("");

      // Buat object baru tanpa RoleMenus
      const menuJson = menu.toJSON();
      delete menuJson.RoleMenus; // hapus properti RoleMenus

      return {
        ...menuJson,
        access,
      };
    });

    // Bikin tree dengan akses sudah disertakan
    const menus = buildMenuTree(menusWithAccess);

    // Login
    const accessToken = jwt.sign(
      {
        id: user.id,
        user_id: user.user_id,
        nama: user.nama_lengkap,
        role: roleIds,
        id_lembaga_pendidikan: user.id_lembaga_pendidikan,
        id_jenjang: user.id_jenjang,
        kode_prov: user.kode_prov,
        kode_kab: user.kode_kab,
        aud: "palma-apps",
        iss: "palma",
      },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }, // access token 15 menit
    );

    const refreshToken = jwt.sign(
      { id: user.id, user_id: user.user_id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: "7d" }, // refresh token 7 hari
    );

    await user.update({ refresh_token: refreshToken });

    const avatarFile = user.avatar ? user.avatar : "default.jpg";

    return successResponse(res, "Login berhasil", {
      user: {
        id: user.id,
        user_id: user.user_id,
        nama_lengkap: user.nama_lengkap,
        id_lembaga_pendidikan: user.id_lembaga_pendidikan,
        lembaga_pendidikan: user.lembaga_pendidikan,
        id_jenjang: user.id_jenjang,
        jenjang: user.jenjang,
        email: user.email,
        no_hp: user.no_hp,
        kode_prov: user.kode_prov,
        kode_kab: user.kode_kab,
        role: user.Roles,
        avatar: getFileUrl(req, "profile", avatarFile),
      },
      accessToken,
      refreshToken,
      menus,
      redirectPage: "/home",
    });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const captchaStore = {};

exports.getCaptcha = (req, res) => {
  const a = Math.floor(Math.random() * 10);
  const b = Math.floor(Math.random() * 10);
  const answer = a + b;

  const captchaId = crypto.randomUUID();
  captchaStore[captchaId] = answer;

  return successResponse(res, "Captcha berhasil dimuat", {
    captchaId,
    question: `Berapa ${a} + ${b}?`,
  });
};

exports.verifyCaptcha = (req, res) => {
  try {
    const { captchaId, answer } = req.body || {};

    if (!captchaId || answer === undefined) {
      return errorResponse(res, "Payload tidak lengkap");
    }

    if (!(captchaId in captchaStore)) {
      return errorResponse(res, "Captcha tidak valid");
    }

    const isValid = captchaStore[captchaId] === Number(answer);

    delete captchaStore[captchaId];

    if (!isValid) {
      return successResponse(res, "Captcha salah", false);
    }

    return successResponse(res, "Captcha valid", true);
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.register = async (req, res) => {
  try {
    const {
      nama_lengkap,
      email,
      no_hp,
      id_perguruan_tinggi,
      id_jenjang,
      id_program_studi,
      kode_prov,
      kode_kab,
      jenis_akun,
      username, // input untuk non-beasiswa
      password, // input untuk non-beasiswa
    } = req.body;

    // Cek email sudah ada atau belum
    const existingEmail = await User.findOne({ where: { email } });
    if (existingEmail) return failResponse(res, "Email sudah digunakan", 200);

    // Cek no hp sudah ada atau belum
    const existingHP = await User.findOne({ where: { no_hp } });
    if (existingHP) return failResponse(res, "No. HP sudah digunakan", 200);

    let user_id, pin, hashedPin, is_active;

    if (jenis_akun === "beasiswa") {
      // Generate otomatis untuk penerima beasiswa
      user_id = generateUserId(8);
      pin = generatePin(6);
      hashedPin = await argon2.hash(pin);
      is_active = 1;
    } else {
      // Non-beasiswa pakai input user
      if (!username || !password) {
        return failResponse(res, "Username dan password wajib diisi", 200);
      }
      user_id = username;
      pin = password;
      hashedPin = await argon2.hash(pin);
      is_active = 0; // Non-beasiswa otomatis inactive
    }

    // Mapping role
    const roleMap = {
      beasiswa: 1,
      ditjenbun: 2,
      provinsi: 3,
      kabkota: 4,
      lembaga_seleksi: 5,
      lembaga_pendidikan: 10,
    };
    const user_role = roleMap[jenis_akun] || 0;

    // Helper untuk pecah string "id#nama"
    const parseField = (val) => {
      if (!val) return { id: null, label: null };
      if (val.includes("#")) {
        const [id, label] = val.split("#");
        return { id, label };
      }
      return { id: val, label: null };
    };

    const perguruanTinggi = parseField(id_perguruan_tinggi);
    const jenjang = parseField(id_jenjang);
    const programStudi = parseField(id_program_studi);
    const prov = parseField(kode_prov);
    const kab = parseField(kode_kab);

    const fileSurat = req.file;

    // Insert user baru
    const newUser = await User.create({
      nama_lengkap,
      email,
      no_hp,
      user_id,
      pin: hashedPin,
      id_lembaga_pendidikan: perguruanTinggi.id,
      lembaga_pendidikan: perguruanTinggi.label,
      id_jenjang: jenjang.id,
      jenjang: jenjang.label,
      id_program_studi: programStudi.id,
      program_studi: programStudi.label,
      kode_prov: prov.id,
      prov: prov.label,
      kode_kab: kab.id,
      kab_kota: kab.label,
      is_active,
      surat_penunjukan: fileSurat ? fileSurat.filename : null, // <-- simpan file
    });

    // Tambahkan ke user role
    await UserRole.create({
      id_user: newUser.id,
      id_role: user_role,
    });

    // Response
    if (jenis_akun === "beasiswa") {
      return successResponse(res, "User berhasil dibuat", {
        user_id,
        pin,
      });
    } else {
      return successResponse(res, "User berhasil dibuat");
    }
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

exports.getProfile = async (req, res) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader.split(" ")[1];

  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  try {
    const userRaw = await User.findByPk(decoded.id, {
      attributes: { exclude: ["password"] },
    });

    const avatarFile = userRaw.avatar ? userRaw.avatar : "default.jpg";

    const user = {
      nama: userRaw.nama_lengkap,
      user_id: userRaw.user_id,
      avatar: getFileUrl(req, "profile", avatarFile),
    };

    return successResponse(res, "User berhasil dimuat", user);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const authHeader = req.headers["authorization"];
    if (!authHeader) {
      return errorResponse(res, "Token tidak ditemukan", 401);
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const filename = req.file ? req.file.filename : null;
    const { nama, current_pin, pin } = req.body;

    // 🔍 Ambil user (termasuk pin untuk verifikasi)
    const user = await User.findByPk(decoded.id);
    if (!user) {
      return errorResponse(res, "User tidak ditemukan", 404);
    }

    const updateData = {
      nama_lengkap: nama,
    };

    if (filename) {
      updateData.avatar = filename;
    }

    // 🔐 JIKA USER MAU GANTI PIN
    if (pin) {
      if (!current_pin) {
        return errorResponse(res, "PIN sekarang wajib diisi", 400);
      }

      const isPinValid = await argon2.verify(user.pin, current_pin);
      if (!isPinValid) {
        return errorResponse(res, "PIN sekarang salah", 400);
      }

      // 🔥 hash PIN baru
      const hashedPin = await argon2.hash(pin);

      updateData.pin = hashedPin;
      updateData.telah_ganti_pin = true;
    }

    await User.update(updateData, { where: { id: decoded.id } });

    // 🔄 Ambil ulang data (tanpa pin)
    const userRaw = await User.findByPk(decoded.id, {
      attributes: { exclude: ["pin"] },
    });

    const avatarFile = userRaw.avatar || "default.jpg";

    const responseUser = {
      id: userRaw.id,
      user_id: userRaw.user_id,
      nama: userRaw.nama_lengkap,
      avatar: getFileUrl(req, "profile", avatarFile),
      telah_ganti_pin: userRaw.telah_ganti_pin,
    };

    return successResponse(res, "Profil berhasil diperbarui", responseUser);
  } catch (error) {
    console.error(error);
    return errorResponse(res, error.message);
  }
};

exports.logout = async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      return res
        .status(400)
        .json({ success: false, message: "Refresh token required" });
    }

    const decoded = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);

    await User.update({ refresh_token: null }, { where: { id: decoded.id } });

    return res.json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    return res
      .status(401)
      .json({ success: false, message: "Invalid refresh token" });
  }
};

exports.refreshToken = async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return errorResponse(res, "Refresh token tidak ada", 401);
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    // 🔹 AMBIL DATA USER LENGKAP dari database
    const user = await User.findOne({
      where: { id: decoded.id },
      include: [{ model: Role, through: { attributes: [] } }],
    });

    // 🔹 Validasi user & refresh token
    if (!user || user.refresh_token !== refreshToken) {
      return errorResponse(res, "Refresh token tidak valid", 401);
    }

    if (!user.is_active) {
      return errorResponse(res, "Akun tidak aktif", 401);
    }

    // 🔹 Ambil role IDs
    const roleIds = user.Roles.map((role) => role.id);

    // 🔹 Bikin access token baru dengan PAYLOAD LENGKAP (sama seperti login)
    const newAccessToken = jwt.sign(
      {
        id: user.id,
        user_id: user.user_id,
        nama: user.nama_lengkap,
        role: roleIds,
        id_lembaga_pendidikan: user.id_lembaga_pendidikan,
        id_jenjang: user.id_jenjang,
        kode_prov: user.kode_prov,
        kode_kab: user.kode_kab,
        aud: "palma-apps",
        iss: "palma",
      },
      process.env.JWT_SECRET,
      { expiresIn: "15m" },
    );

    return successResponse(res, "Token berhasil diperbarui", {
      accessToken: newAccessToken,
    });
  } catch (err) {
    return errorResponse(res, "Refresh token tidak valid / expired", 401);
  }
};

const buildMenuTree = (menus) => {
  const map = {};
  menus.forEach((menu) => {
    map[menu.id] = { ...menu, children: [] };
  });

  const tree = [];
  menus.forEach((menu) => {
    if (menu.parent_id) {
      if (map[menu.parent_id]) {
        map[menu.parent_id].children.push(map[menu.id]);
      }
    } else {
      tree.push(map[menu.id]);
    }
  });

  return tree;
};
