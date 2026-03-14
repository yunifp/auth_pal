const multer = require("multer");
const path = require("path");
const fs = require("fs");

const baseUploadDir = process.env.FILE_URL;

// Fungsi untuk membuat folder jika belum ada
const ensureDirectoryExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// Storage configuration dengan dynamic folder
const createStorage = (folderName) => {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = path.join(baseUploadDir, folderName);
      ensureDirectoryExists(uploadPath);
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 1e6);

      // Nama file berdasarkan folder type
      let prefix = "file";
      switch (folderName) {
        case "logo-aplikasi":
          prefix = "app-logo";
          break;
        case "profile":
          prefix = "profile";
          break;
        case "surat-penunjukan":
          prefix = "surat-penunjukan";
          break;
        default:
          prefix = "file";
      }

      const filename = `${prefix}-${timestamp}-${random}${ext}`;
      cb(null, filename);
    },
  });
};

// File filter untuk berbagai jenis file
const createFileFilter = (allowedTypes) => {
  return (req, file, cb) => {
    if (!allowedTypes.includes(file.mimetype)) {
      const typeNames = allowedTypes
        .map((type) => {
          switch (type) {
            case "image/jpeg":
              return "JPG";
            case "image/png":
              return "PNG";
            case "image/svg+xml":
              return "SVG";
            case "application/pdf":
              return "PDF";
            case "application/msword":
              return "DOC";
            case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
              return "DOCX";
            default:
              return type;
          }
        })
        .join(", ");

      return cb(new Error(`Format file harus ${typeNames}`), false);
    }
    cb(null, true);
  };
};

// Predefined upload configurations
const uploadConfigs = {
  // Untuk logo aplikasi
  logoAplikasi: multer({
    storage: createStorage("logo-aplikasi"),
    fileFilter: createFileFilter(["image/jpeg", "image/png", "image/svg+xml"]),
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  }),

  // Untuk profile picture
  profile: multer({
    storage: createStorage("profile"),
    fileFilter: createFileFilter(["image/jpeg", "image/png"]),
    limits: { fileSize: 1 * 1024 * 1024 }, // 1MB
  }),

  // Untuk surat penunjukan
  surat_penunjukan: multer({
    storage: createStorage("surat_penunjukan"),
    fileFilter: createFileFilter([
      "image/jpeg",
      "image/png",
      "application/pdf",
    ]),
    limits: { fileSize: 1 * 1024 * 1024 }, // 1MB
  }),

  // Untuk dokumen
  dokumen: multer({
    storage: createStorage("dokumen"),
    fileFilter: createFileFilter([
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  }),

  // Generic upload dengan custom folder
  custom: (folderName, allowedTypes, maxSize) => {
    return multer({
      storage: createStorage(folderName),
      fileFilter: createFileFilter(allowedTypes),
      limits: { fileSize: maxSize },
    });
  },
};

// Helper function untuk mendapatkan URL file
const getFileUrl = (req, folderName, filename) => {
  const baseUrl =
    process.env.BASE_URL || `${req.protocol}://${req.get("host")}/backend`;

  return `${baseUrl}/uploads/${folderName}/${filename}`;
};

// Helper function untuk menghapus file
const deleteFile = (folderName, filename) => {
  const filePath = path.join(baseUploadDir, folderName, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
};

module.exports = {
  uploadConfigs,
  getFileUrl,
  deleteFile,
  ensureDirectoryExists,
  baseUploadDir,
};
