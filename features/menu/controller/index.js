const { sequelize } = require("../../../core/db_config");
const { literal } = require("sequelize");
const { QueryTypes } = require("sequelize");
const { Menu, RoleMenu } = require("../../../models");
const {
  successResponse,
  failResponse,
  errorResponse,
} = require("../../../common/response");
const { Op } = require("sequelize");
const jwt = require("jsonwebtoken");

exports.getByPagination = async (req, res) => {
  try {
    // Ambil parameter page dan limit dari query, default ke 1 dan 10
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || "";
    const whereCondition = search
      ? {
          [Op.or]: [
            { nama: { [Op.like]: `%${search}%` } },
            { url: { [Op.like]: `%${search}%` } },
          ],
        }
      : {};

    // Ambil data role + total count
    const { count, rows } = await Menu.findAndCountAll({
      where: whereCondition,
      limit,
      offset,
      order: [
        ["parent_id", "ASC"],
        ["order", "ASC"],
      ],
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

exports.getAll = async (req, res) => {
  try {
    // Ambil data role + total count
    const menus = await Menu.findAll({
      order: [
        [literal("`order` IS NULL"), "ASC"],
        ["order", "ASC"],
      ],
    });

    return successResponse(res, "Data berhasil dimuat", menus);
  } catch (error) {
    return res.status(500).json(errorResponse("Internal Server Error"));
  }
};

exports.getMenusByRole = async (req, res) => {
  const { id } = req.params;

  try {
    const menusRaw = await Menu.findAll({
      include: [
        {
          model: RoleMenu,
          where: { id_role: id },
          attributes: [],
        },
      ],
      order: [
        [literal("`order` IS NULL"), "ASC"],
        ["order", "ASC"],
      ],
    });

    // bikin tree
    const menus = buildMenuTree(menusRaw);

    return successResponse(res, "Data berhasil dimuat", menus);
  } catch (error) {
    return res.status(500).json(errorResponse("Internal Server Error"));
  }
};

exports.createMenu = async (req, res) => {
  try {
    const { nama, url, icon, parent_id, order } = req.body;

    await Menu.create({ nama, url, icon, parent_id, order });

    return successResponse(res, "Menu berhasil ditambahkan");
  } catch (error) {
    console.log(error);
    return res.status(500).json(errorResponse("Internal Server Error"));
  }
};

exports.getDetailById = async (req, res) => {
  try {
    const { id } = req.params;

    const menu = await Menu.findOne({
      where: { id },
    });

    if (!menu) return failResponse(res, "Data tidak ditemukan", 200);

    return successResponse(res, "Data berhasil dimuat", menu);
  } catch (error) {
    console.error(error);
    return res.status(500).json(errorResponse("Internal Server Error"));
  }
};

exports.updateById = async (req, res) => {
  try {
    const { id } = req.params;

    await Menu.update(req.body, { where: { id } });

    const menuRaw = (
      await Menu.findAll({
        include: [
          {
            model: RoleMenu,
            where: { id_role: 99 },
            attributes: ["access"], // ambil hanya access
          },
        ],
        order: [
          [literal("`order` IS NULL"), "ASC"],
          ["order", "ASC"],
        ],
      })
    ).map((item) => {
      const plain = item.get({ plain: true });
      // Ambil access dari RoleMenus[0] jika ada
      plain.access = plain.RoleMenus?.[0]?.access || null;
      delete plain.RoleMenus;
      return plain;
    });

    const newMenus = buildMenuTree(menuRaw);

    return successResponse(res, "Data berhasil diperbarui", {
      menus: newMenus,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json(errorResponse("Internal Server Error"));
  }
};

exports.deleteById = async (req, res) => {
  try {
    const { id } = req.params;

    // Menghapus data berdasarkan id
    await Menu.destroy({ where: { id } });

    return successResponse(res, "Data berhasil dihapus");
  } catch (error) {
    return res.status(500).json(errorResponse("Internal Server Error"));
  }
};

exports.getMenusAccess = async (req, res) => {
  const { id } = req.params;

  try {
    const results = await sequelize.query(
      `
        SELECT 
          a.id,
          a.parent_id,
          a.nama,
          a.url,
          a.\`order\`,
          a.icon,
          b.access
        FROM menus a
        LEFT JOIN role_menus b ON a.id = b.id_menu AND b.id_role = :roleId
        ORDER BY a.\`order\` ASC
      `,
      {
        replacements: { roleId: id },
        type: QueryTypes.SELECT,
      },
    );

    // Bangun tree dari hasil flat
    const menus = buildMenuTreeWithAccess(results);

    return successResponse(res, "Data berhasil dimuat", menus);
  } catch (error) {
    return res.status(500).json(errorResponse("Internal Server Error"));
  }
};

exports.updateMenuAccess = async (req, res) => {
  try {
    // Id menu yang di-update
    const { id } = req.params;
    const { access, id_role } = req.body;

    const authHeader = req.headers["authorization"];
    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Id role yang sedang login (jika dia mengatur role yang dia sendiri maka langsung berubah di tampilan)
    const id_role_login = decoded.role;

    const existingRoleMenu = await RoleMenu.findOne({
      where: {
        id_menu: id,
        id_role: id_role,
      },
    });

    // Simpan jika ada akses "R"
    if (access && access.includes("R")) {
      if (existingRoleMenu) {
        await RoleMenu.update({ access }, { where: { id_menu: id, id_role } });
      } else {
        await RoleMenu.create({ id_menu: id, id_role, access });
      }
    } else {
      // Hapus jika tidak ada akses "R"
      if (existingRoleMenu) {
        await RoleMenu.destroy({ where: { id_menu: id, id_role } });
      }
    }

    // Ambil ulang menu dan akses berdasarkan role yang diminta
    const menusRaw = await Menu.findAll({
      include: [
        {
          model: RoleMenu,
          where: { id_role },
          attributes: ["access"],
        },
      ],
      order: [
        [literal("`order` IS NULL"), "ASC"],
        ["order", "ASC"],
      ],
    });

    // Tambahkan properti access dari RoleMenu ke tiap menu
    const menusWithAccess = menusRaw.map((menu) => {
      const accessArray = menu.RoleMenus?.map((rm) => rm.access || "") ?? [];
      const combinedAccess = [...new Set(accessArray.join("").split(""))].join(
        "",
      );
      return {
        ...menu.toJSON(),
        access: combinedAccess,
        RoleMenus: undefined, // Hapus RoleMenus dari output
      };
    });

    // Susun menjadi tree
    const menus = buildMenuTree(menusWithAccess);

    return successResponse(res, "Data berhasil diperbarui", {
      menus,
      update: id_role_login.includes(id_role),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json(errorResponse("Internal Server Error"));
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

const buildMenuTreeWithAccess = (menus) => {
  const map = {};
  const tree = [];

  // Pertama, buat semua node di map
  menus.forEach((menu) => {
    map[menu.id] = {
      ...menu, // Langsung spread object menu (tanpa .dataValues)
      children: [],
    };
  });

  // Kedua, hubungkan parent dan children
  menus.forEach((menu) => {
    if (menu.parent_id) {
      const parent = map[menu.parent_id];
      if (parent) {
        parent.children.push(map[menu.id]);
      }
    } else {
      tree.push(map[menu.id]);
    }
  });

  return tree;
};
