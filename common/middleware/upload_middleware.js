const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { S3Client, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const multerS3 = require("multer-s3");
const { v4: uuidv4, v5: uuidv5 } = require("uuid");
const axios = require("axios");

const baseUploadDir = process.env.FILE_URL;
const storageType = process.env.DATABASE_PENYIMPANAN || "biasa";
const APP_NAMESPACE = "1b671a64-40d5-491e-99b0-da01ff1f3341";

const primaryEndpoint = process.env.NEO_ENDPOINT || "https://nos.wjv-1.neo.id";
const secondaryEndpoint = process.env.NEO_ENDPOINT_SECONDARY || "https://nos.jkt-1.neo.id";
const UPLOAD_BUCKET = process.env.NEO_BUCKET_UPLOAD || "palma-upload-bucket-testing";

let activeEndpoint = primaryEndpoint;
let s3Proxy = null;
let currentS3Client = null;
let primaryClient = null;
let secondaryClient = null;

if (storageType === "s3") {
  const s3Config = {
    region: process.env.NEO_REGION || "wjv-1",
    credentials: {
      accessKeyId: process.env.NEO_ACCESS_KEY,
      secretAccessKey: process.env.NEO_SECRET_KEY,
    },
    forcePathStyle: true,
  };

  primaryClient = new S3Client({ ...s3Config, endpoint: primaryEndpoint });
  secondaryClient = new S3Client({ ...s3Config, endpoint: secondaryEndpoint });
  currentS3Client = primaryClient;

  s3Proxy = new Proxy({}, {
    get: (target, prop) => {
      if (typeof currentS3Client[prop] === "function") {
        return currentS3Client[prop].bind(currentS3Client);
      }
      return currentS3Client[prop];
    }
  });
}

let lastEndpointCheck = 0;
const checkAndSwitchEndpoint = async () => {
  if (storageType !== "s3") return;
  const now = Date.now();
  if (now - lastEndpointCheck < 30000) return;

  try {
    await axios.get(primaryEndpoint, { timeout: 3000 });
    currentS3Client = primaryClient;
    activeEndpoint = primaryEndpoint;
    lastEndpointCheck = now;
  } catch (error) {
    currentS3Client = secondaryClient;
    activeEndpoint = secondaryEndpoint;
    lastEndpointCheck = now;
  }
};

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
      s3: s3Proxy,
      bucket: UPLOAD_BUCKET,
      acl: "public-read",
      contentType: multerS3.AUTO_CONTENT_TYPE,
      key: async (req, file, cb) => {
        try {
          await checkAndSwitchEndpoint();

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

const getFileUrl = (req, folderName, filename) => {
  if (!filename) return null;
  const cacheBuster = `?t=${Date.now()}`;

  if (storageType === "s3") {
    if (filename.includes("/")) {
       return `${activeEndpoint}/${UPLOAD_BUCKET}/${filename}${cacheBuster}`;
    }
    return `${activeEndpoint}/${UPLOAD_BUCKET}/${folderName}/${filename}${cacheBuster}`;
  }
  
  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}/backend`;
  return `${baseUrl}/uploads/${folderName}/${filename}${cacheBuster}`;
};

const deleteFile = async (folderName, filename) => {
  if (!filename) return false;
  if (storageType === "s3") {
    await checkAndSwitchEndpoint(); 
    const fileKey = filename.includes("/") ? filename : `${folderName}/${filename}`;
    const command = new DeleteObjectCommand({
      Bucket: UPLOAD_BUCKET,
      Key: fileKey,
    });
    try {
      await s3Proxy.send(command); 
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
};