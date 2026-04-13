const { DataTypes } = require("sequelize");
const { sequelize } = require("../core/db_config");

const EmailLog = sequelize.define(
  "EmailLog",
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
    email_to: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    subject: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    body_html: {
      type: DataTypes.TEXT("long"), // Menggunakan tipe TEXT panjang untuk menyimpan elemen HTML
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(50), // Menyimpan status "sent" atau "failed"
      allowNull: true,
      defaultValue: "sent",
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "email_logs",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    underscored: true,
  }
);

module.exports = EmailLog;