const { DataTypes } = require("sequelize");
const { sequelize } = require("../core/db_config");

const Menu = sequelize.define(
  "Menu",
  {
    id: {
      type: DataTypes.INTEGER(10),
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    parent_id: {
      type: DataTypes.INTEGER(10),
      allowNull: true,
    },
    nama: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    url: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    order: {
      type: DataTypes.INTEGER(10),
      allowNull: true,
    },
    icon: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },
  },
  {
    tableName: "menus",
    timestamps: false,
  }
);

// Define association
Menu.associate = (models) => {
  Menu.hasMany(models.RoleMenu, { foreignKey: "id_menu" });
};

module.exports = Menu;
