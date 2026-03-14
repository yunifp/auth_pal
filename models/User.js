const { DataTypes } = require("sequelize");
const { sequelize } = require("../core/db_config");

const User = sequelize.define(
  "User",
  {
    id: {
      type: DataTypes.INTEGER(10),
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    nama_lengkap: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    no_hp: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    user_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    pin: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    id_perguruan_tinggi: {
      type: DataTypes.INTEGER(10),
      allowNull: true,
    },
    perguruan_tinggi: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    id_program_studi: {
      type: DataTypes.INTEGER(10),
      allowNull: true,
    },
    program_studi: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    kode_prov: {
      type: DataTypes.INTEGER(10),
      allowNull: true,
    },
    prov: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    kode_kab: {
      type: DataTypes.INTEGER(10),
      allowNull: true,
    },
    kab_kota: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    refresh_token: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    avatar: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    id_lembaga_pendidikan: {
      type: DataTypes.INTEGER(10),
      allowNull: true,
    },
    lembaga_pendidikan: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    id_jenjang: {
      type: DataTypes.INTEGER(10),
      allowNull: true,
    },
    jenjang: {
      type: DataTypes.STRING(2),
      allowNull: true,
    },
    jabatan: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    surat_penunjukan: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    is_active: {
      type: DataTypes.INTEGER(10),
      allowNull: true,
      defaultValue: 0,
    },
    telah_ganti_pin: {
      type: DataTypes.ENUM("Y", "N"),
      allowNull: false,
      defaultValue: "N",
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
    tableName: "users",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    underscored: true,
  },
);

module.exports = User;
