const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { S3Client, DeleteObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const multerS3 = require("multer-s3");
const { v4: uuidv4, v5: uuidv5 } = require("uuid");

const baseUploadDir = process.env.FILE_URL || "E:/upload_palma";
const storageType = process.env.DATABASE_PENYIMPANAN || "biasa";
const APP_NAMESPACE = "1b671a64-40d5-491e-99b0-da01ff1f3341";

// Pemisahan bucket upload dan bucket download sesuai instruksi Biznet
const UPLOAD_BUCKET = process.env.S3_BUCKET_NAME;
const DOWNLOAD_BUCKET = process.env.S3_DOWNLOAD_BUCKET_NAME || UPLOAD_BUCKET; 

let s3Client = null;

if (storageType === "s3") {
  // [PERBAIKAN 1]: Konfigurasi S3 Client disederhanakan khusus untuk layanan S3-Compatible
  s3Client = new S3Client({
    region: process.env.S3_REGION || "wjv-1",
    endpoint: process.env.S3_ENDPOINT || undefined,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY || process.env.access_key,
      secretAccessKey: process.env.S3_SECRET_KEY || process.env.secret_key,
    },
    forcePathStyle: true, // WAJIB TRUE untuk Biznet NOS
  });
}

const ensureDirectoryExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const generateS3Path = (req, file, folderName, rawName) => {
  let tahun = new Date().getFullYear();
  let prefix = "UMUM";

  if (req.user && req.user.user_id) {
      prefix = req.user.user_id;
  } else if (req.body && req.body.username) {
      prefix = req.body.username;
  }

  prefix = prefix.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
  return `${tahun}/AUTH_${prefix}/${folderName}/${rawName}`;
};

const createStorage = (folderName) => {
  if (storageType === "s3") {
    return multerS3({
      s3: s3Client,
      bucket: UPLOAD_BUCKET,
      // [PERBAIKAN 2]: Matikan AUTO_CONTENT_TYPE, gunakan mimetype asli bawaan file
      contentType: (req, file, cb) => {
        cb(null, file.mimetype);
      },
      key: async (req, file, cb) => {
        try {
          const ext = path.extname(file.originalname);
          let identifier = req.user?.user_id || req.body?.username || uuidv4();
          const staticUUID = uuidv5(`${folderName}_${identifier}`, APP_NAMESPACE);
          
          let prefix = "file";
          switch (folderName) {
            case "logo-aplikasi": prefix = "app-logo"; break;
            case "profile": prefix = "profile"; break;
            case "surat_penunjukan": prefix = "surat-penunjukan"; break;
          }

          const rawName = `${prefix}-${staticUUID}${ext}`;
          const finalPath = generateS3Path(req, file, folderName, rawName);
          
          file.filename = finalPath;
          cb(null, finalPath);
        } catch (err) {
          const ext = path.extname(file.originalname);
          const fallbackPath = `auth-fallback/${folderName}/fallback-${uuidv4()}${ext}`;
          file.filename = fallbackPath;
          cb(null, fallbackPath);
        }
      },
    });
  }

  return multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = path.join(baseUploadDir, folderName);
      ensureDirectoryExists(uploadPath);
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      let identifier = req.user?.user_id || req.body?.username || uuidv4();
      const staticUUID = uuidv5(`${folderName}_${identifier}`, APP_NAMESPACE);

      let prefix = "file";
      switch (folderName) {
        case "logo-aplikasi": prefix = "app-logo"; break;
        case "profile": prefix = "profile"; break;
        case "surat_penunjukan": prefix = "surat-penunjukan"; break;
      }

      cb(null, `${prefix}-${staticUUID}${ext}`);
    },
  });
};

const createFileFilter = (allowedTypes) => {
  return (req, file, cb) => {
    if (!allowedTypes.includes(file.mimetype)) {
      const typeNames = allowedTypes
        .map((type) => {
          switch (type) {
            case "image/jpeg": return "JPG";
            case "image/png": return "PNG";
            case "image/svg+xml": return "SVG";
            case "application/pdf": return "PDF";
            case "application/msword": return "DOC";
            case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": return "DOCX";
            default: return type;
          }
        })
        .join(", ");
      return cb(new Error(`Format file harus ${typeNames}`), false);
    }
    cb(null, true);
  };
};

const uploadConfigs = {
  logoAplikasi: multer({
    storage: createStorage("logo-aplikasi"),
    fileFilter: createFileFilter(["image/jpeg", "image/png", "image/svg+xml"]),
    limits: { fileSize: 2 * 1024 * 1024 },
  }),
  profile: multer({
    storage: createStorage("profile"),
    fileFilter: createFileFilter(["image/jpeg", "image/png"]),
    limits: { fileSize: 1 * 1024 * 1024 },
  }),
  surat_penunjukan: multer({
    storage: createStorage("surat_penunjukan"),
    fileFilter: createFileFilter(["image/jpeg", "image/png", "application/pdf"]),
    limits: { fileSize: 1 * 1024 * 1024 },
  }),
  dokumen: multer({
    storage: createStorage("dokumen"),
    fileFilter: createFileFilter(["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]),
    limits: { fileSize: 5 * 1024 * 1024 },
  }),
  custom: (folderName, allowedTypes, maxSize) => {
    return multer({
      storage: createStorage(folderName),
      fileFilter: createFileFilter(allowedTypes),
      limits: { fileSize: maxSize },
    });
  },
};

// === FUNGSI PROXY DENGAN KEAMANAN JWT & KEPEMILIKAN ===
const serveSecureFileProxy = async (req, res) => {
  const { folder, file } = req.query;

  if (!file || !folder) return res.status(400).send("Folder dan file wajib diisi");

  // === LAPIS 3: ANTI COPY-PASTE ADDRESS BAR ===
  const fetchDest = req.headers['sec-fetch-dest'];
  const fetchMode = req.headers['sec-fetch-mode'];
  
  if (fetchDest === 'document' && fetchMode === 'navigate') {
    return res.status(403).send("Akses Ditolak: Gambar/File hanya bisa dimuat dari dalam aplikasi Palma Beasiswa.");
  }
  // ===========================================

  const user = req.user;
  if (!user) return res.status(401).send("Akses ditolak: User tidak valid");

  try {
    if (file.includes("AUTH_") && !file.includes("AUTH_UMUM")) {
      const pathParts = file.split('/');
      const authFolder = pathParts.find(p => p.startsWith("AUTH_"));
      
      const userId = user.user_id || user.id; 
      const expectedFolder = `AUTH_${String(userId).toUpperCase()}`;
      
      if (authFolder && authFolder !== expectedFolder) {
        return res.status(403).send("Akses ditolak: Anda tidak memiliki izin untuk melihat file ini");
      }
    }

    const currentStorageType = process.env.DATABASE_PENYIMPANAN || "biasa";

    if (currentStorageType === "s3") {
      const fileKey = file.includes("/") ? file : `${folder}/${file}`;
      
      // Mengambil objek file dari Bucket khusus Download
      const command = new GetObjectCommand({
        Bucket: DOWNLOAD_BUCKET, 
        Key: fileKey,
      });

      if (!s3Client) {
        s3Client = new S3Client({
          region: process.env.S3_REGION || "wjv-1", 
          credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY || process.env.access_key,
            secretAccessKey: process.env.S3_SECRET_KEY || process.env.secret_key,
          },
          forcePathStyle: true,
        });
      }

      const response = await s3Client.send(command);

      res.setHeader("Content-Type", response.ContentType);
      res.setHeader("Cache-Control", "private, max-age=3600");
      if (response.ContentLength) res.setHeader("Content-Length", response.ContentLength);

      response.Body.pipe(res);
    } else {
      const currentBaseUploadDir = process.env.FILE_URL || "E:/upload_palma";
      const filePath = path.join(currentBaseUploadDir, folder, file);
      if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
      } else {
        res.status(404).send("File lokal tidak ditemukan");
      }
    }

  } catch (error) {
    console.error("Proxy Error:", error.message);
    res.status(404).send("Gagal memuat file");
  }
};

const getFileUrl = (req, folderName, filename) => {
  if (!filename) return null;
  const cacheBuster = `&t=${Date.now()}`;
  
  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}/backend`;
  const encodedFilename = encodeURIComponent(filename);
  const encodedFolder = encodeURIComponent(folderName);

  return `${baseUrl}/api/files/view?folder=${encodedFolder}&file=${encodedFilename}${cacheBuster}`;
};

const deleteFile = async (folderName, filename) => {
  if (!filename) return false;
  if (storageType === "s3") {
    const fileKey = filename.includes("/") ? filename : `${folderName}/${filename}`;
    
    // Proses penghapusan tetap dilakukan pada Bucket asal (Upload Bucket)
    const command = new DeleteObjectCommand({
      Bucket: UPLOAD_BUCKET,
      Key: fileKey,
    });
    try {
      await s3Client.send(command); 
      return true;
    } catch (error) {
      return false;
    }
  } else {
    const filePath = path.join(baseUploadDir, folderName, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  }
};

module.exports = {
  uploadConfigs,
  getFileUrl,
  deleteFile,
  ensureDirectoryExists,
  baseUploadDir,
  serveSecureFileProxy,
};