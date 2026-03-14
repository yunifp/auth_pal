const { DataTypes } = require("sequelize");
const { sequelize } = require("../core/db_config");

const Role = sequelize.define(
  "Role",
  {
    id: {
      type: DataTypes.INTEGER(10),
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    nama: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
  },
  {
    tableName: "roles",
    timestamps: false,
  }
);

module.exports = Role;
