const { ListAplikasi } = require("../../../models");
const { successResponse, errorResponse } = require("../../../common/response");

exports.getData = async (req, res) => {
  try {
    const list_aplikasi = await ListAplikasi.findAll();

    const aplikasiPublik = list_aplikasi.filter(
      (user) => user.kategori_aplikasi == "publik"
    ).length;
    const aplikasiInternal = list_aplikasi.filter(
      (user) => user.kategori_aplikasi == "internal"
    ).length;

    return successResponse(res, "Data berhasil dimuat", {
      aplikasiPublik,
      aplikasiInternal,
    });
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};
