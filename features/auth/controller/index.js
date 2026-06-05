const { RoleMenu, Menu, User, Role, UserRole, EmailLog } = require("../../../models");
const {
  successResponse,
  failResponse,
  errorResponse,
} = require("../../../common/response");

const argon2 = require("argon2");
const jwt = require("jsonwebtoken");
const { literal, Op } = require("sequelize");
const { getFileUrl, deleteFile } = require("../../../common/middleware/upload_middleware");
const {
  generateUserId,
  generatePin,
} = require("../../../utils/stringFormatter");
const { v4: uuidv4 } = require("uuid");

const { sendNotificationToQueue } = require("../../../utils/notification");

const captchaStore = {};
const processingEmails = new Set();

exports.login = async (req, res) => {
  const { user_id, pin, jenis_akun, captchaId, answer } = req.body;

  if (!captchaId || answer === undefined) {
    return failResponse(res, "Silakan selesaikan hitungan captcha terlebih dahulu", 400);
  }
  if (!(captchaId in captchaStore) || captchaStore[captchaId] !== Number(answer)) {
    if (captchaId in captchaStore) delete captchaStore[captchaId];
    return failResponse(res, "Jawaban captcha salah atau kedaluwarsa", 400);
  }
  delete captchaStore[captchaId];

  try {
    const user = await User.findOne({
      where: { user_id },
      include: [{ model: Role, through: { attributes: [] } }],
    });

    if (!user) return failResponse(res, "User ID atau PIN salah", 200);

    const valid = await argon2.verify(user.pin, pin);
    if (!valid) return failResponse(res, "User ID atau PIN salah", 200);

    if (!user.is_active)
      return failResponse(res, "Akun anda belum diverifikasi", 200);

    const roleIds = user.Roles.map((role) => role.id);

    if (
      (jenis_akun === "penerima-beasiswa" && !roleIds.includes(1)) ||
      (jenis_akun === "instansi" && roleIds.includes(1))
    ) {
      return failResponse(res, "User ID atau PIN salah", 200);
    }

    const menusRaw = await Menu.findAll({
      include: [
        {
          model: RoleMenu,
          where: { id_role: { [Op.in]: roleIds } },
          attributes: ["access"],
        },
      ],
      order: [
        [literal("`order` IS NULL"), "ASC"],
        ["order", "ASC"],
      ],
      distinct: true,
    });

    const menusWithAccess = menusRaw.map((menu) => {
      const accessSet = new Set();
      menu.RoleMenus.forEach((rm) => {
        if (rm.access) {
          rm.access.split("").forEach((char) => accessSet.add(char));
        }
      });
      const access = [...accessSet].sort().join("");

      const menuJson = menu.toJSON();
      delete menuJson.RoleMenus;

      return {
        ...menuJson,
        access,
      };
    });

    const menus = buildMenuTree(menusWithAccess);

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
      { expiresIn: "7h" },
    );

    const refreshToken = jwt.sign(
      { id: user.id, user_id: user.user_id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: "7d" },
    );

    await user.update({ refresh_token: refreshToken });

    const userAvatar = (user.avatar && user.avatar !== "default.jpg")
      ? getFileUrl(req, "profile", user.avatar)
      : null;

    let redirectPage = "/home";
    if (jenis_akun === "instansi") {
      redirectPage = "/home";
    }

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
        avatar: userAvatar,
      },
      accessToken,
      refreshToken,
      menus,
      redirectPage: redirectPage,
    });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

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
    username,
    password,
    captchaId,
    answer
  } = req.body;

  if (email && processingEmails.has(email)) {
    return failResponse(res, "Pendaftaran Anda sedang diproses, harap tunggu sebentar.", 429);
  }

  try {
    if (!captchaId || answer === undefined) {
      return failResponse(res, "Silakan selesaikan hitungan captcha terlebih dahulu", 400);
    }
    if (!(captchaId in captchaStore) || captchaStore[captchaId] !== Number(answer)) {
      if (captchaId in captchaStore) delete captchaStore[captchaId];
      return failResponse(res, "Jawaban captcha salah atau kedaluwarsa", 400);
    }
    delete captchaStore[captchaId];

    if (email) processingEmails.add(email);

    const existingEmail = await User.findOne({ where: { email } });
    if (existingEmail) return failResponse(res, "Email sudah digunakan", 200);

    const existingHP = await User.findOne({ where: { no_hp } });
    if (existingHP) return failResponse(res, "No. HP sudah digunakan", 200);

    let user_id, pin, hashedPin, is_active;

    if (jenis_akun === "beasiswa") {
      user_id = generateUserId(8);
      pin = generatePin(6);
      hashedPin = await argon2.hash(pin);
      is_active = 1;
    } else {
      if (!username || !password) {
        return failResponse(res, "Username dan password wajib diisi", 200);
      }
      user_id = username;
      pin = password;
      hashedPin = await argon2.hash(pin);
      is_active = 0;
    }

    const roleMap = {
      beasiswa: 1,
      ditjenbun: 2,
      provinsi: 3,
      kabkota: 4,
      lembaga_seleksi: 5,
      lembaga_pendidikan: 10,
    };
    const user_role = roleMap[jenis_akun] || 0;

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
      surat_penunjukan: fileSurat ? (fileSurat.filename || fileSurat.key) : null,
    });

    await UserRole.create({
      id_user: newUser.id,
      id_role: user_role,
    });

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
        <h2 style="color: #2e7d32; text-align: center;">Pendaftaran Berhasil</h2>
        <p>Halo <b>${nama_lengkap}</b>,</p>
        <p>Selamat, pendaftaran akun Anda di Aplikasi Beasiswa SDM Sawit telah berhasil. Berikut adalah detail informasi akun Anda:</p>
        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 5px 0;"><b>User ID:</b> ${user_id}</p>
          <p style="margin: 5px 0;"><b>PIN    :</b> ${pin}</p>
        </div>
        <p style="color: red; font-size: 13px;"><b>Penting:</b> Harap simpan informasi ini dengan baik !!!.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.REDIRECT_URL || 'https://real.dev-palma.my.id'}" style="background-color: #2e7d32; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Login Sekarang</a>
        </div>
        <hr style="border: 0; border-top: 1px solid #eee; margin-top: 30px;" />
        <p style="font-size: 12px; color: #888; text-align: center;">&copy; ${new Date().getFullYear()} Aplikasi Beasiswa SDM Sawit. All rights reserved.</p>
      </div>
    `;

    sendNotificationToQueue("auth-create-account", email, htmlContent);

    if (jenis_akun === "beasiswa") {
      return successResponse(res, "User berhasil dibuat. Detail login telah dikirim ke Email Anda.", {
        user_id,
        pin,
      });
    } else {
      return successResponse(res, "User berhasil dibuat. Detail login telah dikirim ke Email Anda.");
    }
  } catch (error) {
    return errorResponse(res, error.message);
  } finally {
    if (email) processingEmails.delete(email);
  }
};


exports.getProfile = async (req, res) => {
  try {
    const authHeader = req.headers["authorization"];
    if (!authHeader) {
      return errorResponse(res, "Token otorisasi tidak ditemukan", 401);
    }

    const token = authHeader.split(" ")[1];

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtErr) {
      // Mengembalikan respons 401 secara aman saat token expired
      return errorResponse(res, "Sesi Anda telah habis (Token Expired)", 401);
    }

    const userRaw = await User.findByPk(decoded.id, {
      attributes: { exclude: ["password"] },
    });

    if (!userRaw) {
      return errorResponse(res, "User tidak ditemukan", 404);
    }

    const userAvatar = (userRaw.avatar && userRaw.avatar !== "default.jpg")
      ? getFileUrl(req, "profile", userRaw.avatar)
      : null;

    const user = {
      nama: userRaw.nama_lengkap,
      user_id: userRaw.user_id,
      avatar: userAvatar,
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

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtErr) {
      return errorResponse(res, "Sesi Anda telah habis (Token Expired)", 401);
    }

    const filename = req.file ? (req.file.filename || req.file.key) : null;
    const { nama, current_pin, pin } = req.body;

    const user = await User.findByPk(decoded.id);
    if (!user) {
      return errorResponse(res, "User tidak ditemukan", 404);
    }

    const updateData = {
      nama_lengkap: nama,
    };

    if (filename) {
      if (user.avatar && user.avatar !== "default.jpg") {
        await deleteFile("profile", user.avatar);
      }
      updateData.avatar = filename;
    }

    if (pin) {
      if (!current_pin) {
        return errorResponse(res, "PIN sekarang wajib diisi", 400);
      }

      const isPinValid = await argon2.verify(user.pin, current_pin);
      if (!isPinValid) {
        return errorResponse(res, "PIN sekarang salah", 400);
      }

      const hashedPin = await argon2.hash(pin);

      updateData.pin = hashedPin;
      updateData.telah_ganti_pin = true;
    }

    await User.update(updateData, { where: { id: decoded.id } });

    const userRaw = await User.findByPk(decoded.id, {
      attributes: { exclude: ["pin"] },
    });

    const userAvatar = (userRaw.avatar && userRaw.avatar !== "default.jpg")
      ? getFileUrl(req, "profile", userRaw.avatar)
      : null;

    const responseUser = {
      id: userRaw.id,
      user_id: userRaw.user_id,
      nama: userRaw.nama_lengkap,
      avatar: userAvatar,
      telah_ganti_pin: userRaw.telah_ganti_pin,
    };

    return successResponse(res, "Profil berhasil diperbarui", responseUser);
  } catch (error) {
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

    const user = await User.findOne({
      where: { id: decoded.id },
      include: [{ model: Role, through: { attributes: [] } }],
    });

    if (!user || user.refresh_token !== refreshToken) {
      return errorResponse(res, "Refresh token tidak valid", 401);
    }

    if (!user.is_active) {
      return errorResponse(res, "Akun tidak aktif", 401);
    }

    const roleIds = user.Roles.map((role) => role.id);

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

exports.forgotPin = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return failResponse(res, "Email wajib diisi", 400);
  }

  if (processingEmails.has(email)) {
    return failResponse(res, "Permintaan reset PIN sedang diproses, harap tunggu sebentar.", 429);
  }

  try {
    processingEmails.add(email);

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return failResponse(res, "Email tidak terdaftar di sistem kami", 404);
    }

    const secret = process.env.JWT_SECRET + user.pin;
    const payload = { email: user.email, id: user.id };
    const token = jwt.sign(payload, secret);

    const frontendUrl = process.env.REDIRECT_URL || 'https://real.dev-palma.my.id';
    const resetLink = `${frontendUrl}/reset-pin/${user.id}/${token}`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
        <h2 style="color: #2e7d32; text-align: center;">Reset PIN Anda</h2>
        <p>Halo <b>${user.nama_lengkap}</b>,</p>
        <p>Kami menerima permintaan untuk melakukan reset PIN pada akun Anda. Berikut adalah detail informasi akun Anda:</p>
        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 5px 0;"><b>ID User:</b> ${user.id}</p>
          <p style="margin: 5px 0;"><b>Username / User ID:</b> ${user.user_id}</p>
        </div>
        <p>Silakan klik tombol di bawah ini untuk membuat PIN baru:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background-color: #2e7d32; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Reset PIN Sekarang</a>
        </div>
        <p>Atau Anda dapat menyalin tautan berikut ke browser Anda:</p>
        <p style="word-break: break-all; color: #555;"><i>${resetLink}</i></p>
        <p style="color: red; font-size: 12px;">*Tautan ini hanya berlaku selama 15 menit. Jika Anda tidak merasa meminta reset PIN, abaikan email ini.</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin-top: 30px;" />
        <p style="font-size: 12px; color: #888; text-align: center;">&copy; ${new Date().getFullYear()} Aplikasi Palma Beasiswa. All rights reserved.</p>
      </div>
    `;

    sendNotificationToQueue("auth-forgot-password", user.email, htmlContent);

    return successResponse(res, "Link reset PIN telah berhasil dikirim ke email Anda");
  } catch (error) {
    return errorResponse(res, "Gagal mengirim email. Pastikan konfigurasi SMTP benar.");
  } finally {
    processingEmails.delete(email);
  }
};

exports.resetPin = async (req, res) => {
  try {
    const { id, token } = req.params;
    const { new_pin } = req.body;

    if (!id || !token || !new_pin) {
      return failResponse(res, "Data tidak lengkap", 400);
    }

    const user = await User.findByPk(id);
    if (!user) {
      return failResponse(res, "User tidak ditemukan", 404);
    }

    const secret = process.env.JWT_SECRET + user.pin;

    try {
      jwt.verify(token, secret);
    } catch (err) {
      return failResponse(res, "Link reset PIN tidak valid atau sudah kedaluwarsa", 400);
    }

    const hashedPin = await argon2.hash(String(new_pin));

    await User.update(
      {
        pin: hashedPin,
        telah_ganti_pin: "Y"
      },
      { where: { id: user.id } }
    );

    return successResponse(res, "PIN berhasil direset. Silakan login menggunakan PIN baru Anda.");
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};