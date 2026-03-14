const { DataTypes } = require("sequelize");
const { sequelize } = require("../core/db_config");

const RoleMenu = sequelize.define(
  "RoleMenu",
  {
    id: {
      type: DataTypes.INTEGER(10),
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    id_role: {
      type: DataTypes.INTEGER(10),
      allowNull: true,
    },
    id_menu: {
      type: DataTypes.INTEGER(10),
      allowNull: true,
    },
    access: {
      type: DataTypes.STRING(3),
      allowNull: true,
    },
  },
  {
    tableName: "role_menus",
    timestamps: false,
  }
);

// Define association
RoleMenu.associate = (models) => {
  RoleMenu.belongsTo(models.Menu, { foreignKey: "id_menu" });
};

module.exports = RoleMenu;
