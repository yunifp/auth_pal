const dotenv = require("dotenv");
dotenv.config({ path: "./config.env" }); 
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const bodyParser = require("body-parser");

const checkAuthorization = require("./common/middleware/auth_middleware");
const { serveSecureFileProxy } = require("./common/middleware/upload_middleware");

const app = express();
app.set("trust proxy", true);
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

// [PENYESUAIAN 1]: Konfigurasi CORS agar menerima Custom Header X-Palma-Auth dan Lapis 2
app.use(cors({
  origin: "*", // Sangat disarankan diganti spesifik ke "https://beasiswa.dev-palma.my.id" di production
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Palma-Auth", "Sec-Fetch-Dest", "Referer"]
}));

app.use(morgan("dev"));
app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: true,
  }),
);

app.use("/uploads", express.static(process.env.FILE_URL || "E:/upload_palma"));

// [PENYESUAIAN 2]: Sisipkan checkAuthorization agar membaca header X-Palma-Auth
// sebelum meneruskan ke serveSecureFileProxy
app.get(
  "/api/files/view", 
  checkAuthorization, 
  serveSecureFileProxy
);

app.use("/api/auth/auth", require("./features/auth/route"));
app.use(
  "/api/auth/users",
  checkAuthorization,
  require("./features/user/route"),
);
app.use(
  "/api/auth/roles",
  checkAuthorization,
  require("./features/role/route"),
);
app.use(
  "/api/auth/menus",
  checkAuthorization,
  require("./features/menu/route"),
);
app.use(
  "/api/auth/db-admin-verifikator-lp",
  checkAuthorization,
  require("./features/db-admin-verifikator/route"),
);

app.use(
  "/api/auth/db-admin-verifikator-dinas",
  checkAuthorization,
  require("./features/db-admin-verifikator-dinas/route"),
);

module.exports = app;