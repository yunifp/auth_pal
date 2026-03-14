const Menu = require("./Menu");
const RoleMenu = require("./RoleMenu");
const Role = require("./Role");
const User = require("./User");
const UserRole = require("./UserRole");

// Buat object models supaya gampang akses
const models = {
  Menu,
  RoleMenu,
  Role,
  User,
  UserRole,
};

// Relasi RoleMenu ↔ Menu
RoleMenu.belongsTo(Menu, { foreignKey: "id_menu" });
Menu.hasMany(RoleMenu, { foreignKey: "id_menu" });

// Relasi RoleMenu ↔ Role
RoleMenu.belongsTo(Role, { foreignKey: "id_role" });
Role.hasMany(RoleMenu, { foreignKey: "id_role" });

// Relasi User ↔ Role via UserRole (Many-to-Many)
User.belongsToMany(Role, {
  through: UserRole,
  foreignKey: "id_user",
  otherKey: "id_role",
});
Role.belongsToMany(User, {
  through: UserRole,
  foreignKey: "id_role",
  otherKey: "id_user",
});

// Relasi UserRole ↔ Role dan User (biar bisa eager load jika dibutuhkan)
UserRole.belongsTo(Role, { foreignKey: "id_role" });
UserRole.belongsTo(User, { foreignKey: "id_user" });

module.exports = models;
