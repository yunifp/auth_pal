const { DataTypes } = require("sequelize");
const { sequelize } = require("../core/db_config");

const UserRole = sequelize.define(
  "UserRole",
  {
    id: {
      type: DataTypes.INTEGER(10),
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    id_user: {
      type: DataTypes.INTEGER(10),
      allowNull: true,
    },
    id_role: {
      type: DataTypes.INTEGER(10),
      allowNull: true,
    },
  },
  {
    tableName: "user_roles",
    timestamps: false,
  }
);

module.exports = UserRole;
